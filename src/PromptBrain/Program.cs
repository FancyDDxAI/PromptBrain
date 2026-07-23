using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PromptBrain;

internal static class Program
{
    private const string SingleInstanceName = "Local\\PromptBrain.Desktop.SingleInstance";

    [STAThread]
    private static void Main()
    {
        using var instanceMutex = new Mutex(true, SingleInstanceName, out var ownsMutex);
        if (!ownsMutex)
        {
            MessageBox.Show(
                "PromptBrain is already running. Open the existing window instead of starting a second data writer.",
                "PromptBrain",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        try
        {
            Application.Run(new MainForm());
        }
        finally
        {
            instanceMutex.ReleaseMutex();
        }
    }
}

internal sealed class MainForm : Form
{
    private readonly EmbeddedAppServer server = new();
    private readonly WebView2 webView = new();
    private bool closeAfterFlush;
    private TaskCompletionSource<bool>? stateIdleSignal;

    public MainForm()
    {
        Text = "PromptBrain";
        var appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        if (appIcon is not null)
        {
            Icon = appIcon;
        }

        MinimumSize = new Size(760, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(16, 18, 24);
        WindowState = FormWindowState.Maximized;

        webView.Dock = DockStyle.Fill;
        webView.DefaultBackgroundColor = Color.FromArgb(16, 18, 24);
        Controls.Add(webView);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);

        try
        {
            server.Start();

            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PromptBrain",
                "WebView2");
            Directory.CreateDirectory(userDataFolder);

            var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await webView.EnsureCoreWebView2Async(environment);

            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = true;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.WebMessageReceived += (_, args) =>
            {
                try
                {
                    if (args.TryGetWebMessageAsString() == "promptbrain-state-idle")
                    {
                        stateIdleSignal?.TrySetResult(true);
                    }
                }
                catch
                {
                    // Ignore unrelated structured messages from future UI features.
                }
            };
            webView.CoreWebView2.DocumentTitleChanged += (_, _) =>
            {
                Text = string.IsNullOrWhiteSpace(webView.CoreWebView2.DocumentTitle)
                    ? "PromptBrain"
                    : webView.CoreWebView2.DocumentTitle;
            };

            webView.CoreWebView2.Navigate(server.Url);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                "PromptBrain needs Microsoft Edge WebView2 Runtime. Install Microsoft Edge or the WebView2 Runtime, then open the app again.",
                "PromptBrain",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"PromptBrain could not start.\n\n{ex.Message}",
                "PromptBrain",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        webView.Dispose();
        server.Dispose();
        base.OnFormClosed(e);
    }

    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        if (!closeAfterFlush && webView.CoreWebView2 is not null)
        {
            e.Cancel = true;
            closeAfterFlush = true;
            try
            {
                stateIdleSignal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                _ = webView.CoreWebView2.ExecuteScriptAsync(
                    "(async () => { try { await globalThis.PromptBrainStateStore?.flushAll?.(); } catch {} finally { globalThis.chrome?.webview?.postMessage('promptbrain-state-idle'); } })()");
                await Task.WhenAny(stateIdleSignal.Task, Task.Delay(TimeSpan.FromSeconds(5)));
            }
            catch
            {
                // The full local emergency copy is already synchronous in the browser store.
            }

            BeginInvoke(Close);
            return;
        }

        base.OnFormClosing(e);
    }
}

public sealed class EmbeddedAppServer : IDisposable
{
    private const string ApiClientHeader = "X-PromptBrain-Client";
    private const string ApiClientValue = "PromptBrainDesktop";
    private const int StateBodyLimit = 32 * 1024 * 1024;
    private const int AssetBodyLimit = 48 * 1024 * 1024;
    private const int OllamaBodyLimit = 4 * 1024 * 1024;
    private static readonly HttpClient Http = new(new HttpClientHandler
    {
        AutomaticDecompression = DecompressionMethods.All
    });

    private readonly Assembly assembly = Assembly.GetExecutingAssembly();
    private readonly CancellationTokenSource cancellation = new();
    private readonly SemaphoreSlim stateGate = new(1, 1);
    private readonly SemaphoreSlim assetGate = new(1, 1);
    private readonly string dataDirectory;
    private readonly string stateFilePath;
    private readonly string assetDirectory;
    private HttpListener? listener;
    private Task? listenerTask;
    private FileStream? dataWriterLock;
    private bool disposed;

    public string Url { get; private set; } = "";
    public string DataDirectory => dataDirectory;

    public EmbeddedAppServer()
    {
        dataDirectory = ResolveDataDirectory();
        stateFilePath = Path.Combine(dataDirectory, "promptbrain-state.json");
        assetDirectory = Path.Combine(dataDirectory, "assets");
    }

    public void Start()
    {
        Directory.CreateDirectory(dataDirectory);
        var lockPath = Path.Combine(dataDirectory, ".promptbrain-writer.lock");
        try
        {
            dataWriterLock = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        }
        catch (IOException ex)
        {
            throw new InvalidOperationException($"PromptBrain data is already open by another writer: {dataDirectory}", ex);
        }

        var configuredPort = Environment.GetEnvironmentVariable("PROMPTBRAIN_PORT");
        var hasConfiguredPort = int.TryParse(configuredPort, out var requestedPort) && requestedPort is > 0 and <= 65535;
        Exception? lastError = null;
        for (var attempt = 0; attempt < (hasConfiguredPort ? 1 : 20); attempt += 1)
        {
            var port = hasConfiguredPort ? requestedPort : GetFreePort();
            var candidateUrl = $"http://127.0.0.1:{port}/";
            var candidate = new HttpListener();
            candidate.Prefixes.Add(candidateUrl);
            try
            {
                candidate.Start();
                listener = candidate;
                Url = candidateUrl;
                break;
            }
            catch (HttpListenerException ex)
            {
                lastError = ex;
                candidate.Close();
            }
        }

        if (listener is null)
        {
            dataWriterLock.Dispose();
            dataWriterLock = null;
            throw new InvalidOperationException("PromptBrain could not reserve a loopback port.", lastError);
        }

        listenerTask = Task.Run(() => ListenAsync(cancellation.Token));
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        cancellation.Cancel();
        listener?.Close();

        try
        {
            listenerTask?.Wait(TimeSpan.FromSeconds(1));
        }
        catch
        {
            // Closing the listener intentionally interrupts pending request waits.
        }

        cancellation.Dispose();
        dataWriterLock?.Dispose();
        dataWriterLock = null;
        stateGate.Dispose();
        assetGate.Dispose();
    }

    private async Task ListenAsync(CancellationToken token)
    {
        Debug.Assert(listener is not null);

        while (!token.IsCancellationRequested && listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync();
            }
            catch
            {
                if (token.IsCancellationRequested || listener is not { IsListening: true })
                {
                    return;
                }

                continue;
            }

            _ = Task.Run(() => HandleRequestAsync(context), token);
        }
    }

    private async Task HandleRequestAsync(HttpListenerContext context)
    {
        try
        {
            var requestPath = Uri.UnescapeDataString(context.Request.Url?.AbsolutePath.TrimStart('/') ?? "");
            if (string.IsNullOrWhiteSpace(requestPath))
            {
                requestPath = "promptbrain.html";
            }

            requestPath = requestPath.Replace('\\', '/');
            if (requestPath.Contains("..", StringComparison.Ordinal))
            {
                SendText(context.Response, 403, "Forbidden");
                return;
            }

            if (requestPath.Equals("api/research", StringComparison.OrdinalIgnoreCase))
            {
                await HandleResearchAsync(context);
                return;
            }

            if (requestPath.Equals("api/status", StringComparison.OrdinalIgnoreCase))
            {
                HandleStatus(context);
                return;
            }

            if (requestPath.Equals("api/state", StringComparison.OrdinalIgnoreCase))
            {
                await HandleStateAsync(context);
                return;
            }

            if (requestPath.Equals("api/assets", StringComparison.OrdinalIgnoreCase) ||
                requestPath.StartsWith("api/assets/", StringComparison.OrdinalIgnoreCase))
            {
                await HandleAssetAsync(context, requestPath);
                return;
            }

            if (requestPath.Equals("api/ollama", StringComparison.OrdinalIgnoreCase))
            {
                await HandleOllamaAsync(context);
                return;
            }

            if (!TryReadResource(requestPath, out var bytes))
            {
                SendText(context.Response, 404, "Not found");
                return;
            }

            context.Response.StatusCode = 200;
            context.Response.ContentType = GetMimeType(requestPath);
            context.Response.ContentLength64 = bytes.Length;
            context.Response.Headers["Cache-Control"] = "no-store";
            context.Response.OutputStream.Write(bytes, 0, bytes.Length);
        }
        catch
        {
            if (context.Response.OutputStream.CanWrite)
            {
                SendText(context.Response, 500, "Server error");
            }
        }
        finally
        {
            context.Response.OutputStream.Close();
        }
    }

    private static async Task HandleResearchAsync(HttpListenerContext context)
    {
        var query = context.Request.QueryString["q"] ?? "";
        if (string.IsNullOrWhiteSpace(query))
        {
            SendJson(context.Response, new { results = Array.Empty<object>() });
            return;
        }

        var url = "https://lite.duckduckgo.com/lite/?q=" + Uri.EscapeDataString(query);
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.UserAgent.ParseAdd("PromptBrain/1.0");
        var html = await Http.SendAsync(request);
        var body = await html.Content.ReadAsStringAsync();

        var results = ParseDuckDuckGo(body).Take(8).ToArray();
        SendJson(context.Response, new { results });
    }

    private void HandleStatus(HttpListenerContext context)
    {
        if (!AuthorizeApiRequest(context, requireJson: false)) return;
        if (!context.Request.HttpMethod.Equals("GET", StringComparison.OrdinalIgnoreCase))
        {
            SendText(context.Response, 405, "Method not allowed");
            return;
        }

        SendJson(context.Response, new
        {
            ok = true,
            schemaVersion = 2,
            dataRoot = dataDirectory,
            statePath = stateFilePath,
            writerLocked = dataWriterLock is not null,
            processId = Environment.ProcessId,
            origin = Url.TrimEnd('/')
        });
    }

    private async Task HandleStateAsync(HttpListenerContext context)
    {
        if (!AuthorizeApiRequest(context, requireJson: context.Request.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase))) return;
        await stateGate.WaitAsync();
        try
        {
            if (context.Request.HttpMethod.Equals("GET", StringComparison.OrdinalIgnoreCase))
            {
                var bytes = await ReadValidStateBytesAsync(stateFilePath);
                if (bytes is null)
                {
                    SendText(context.Response, 200, "{}");
                    return;
                }

                context.Response.StatusCode = 200;
                context.Response.ContentType = "application/json; charset=utf-8";
                context.Response.ContentLength64 = bytes.Length;
                context.Response.Headers["Cache-Control"] = "no-store";
                await context.Response.OutputStream.WriteAsync(bytes);
                return;
            }

            if (!context.Request.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase))
            {
                SendText(context.Response, 405, "Method not allowed");
                return;
            }

            var payload = await ReadBoundedBodyAsync(context.Request, StateBodyLimit);
            if (string.IsNullOrWhiteSpace(payload))
            {
                SendText(context.Response, 400, "Missing state payload");
                return;
            }

            var parsed = JsonNode.Parse(payload) as JsonObject;
            if (parsed is null)
            {
                SendText(context.Response, 400, "State payload must be a JSON object");
                return;
            }

            var isEnvelope = parsed["state"] is JsonObject && parsed["expectedRevision"] is not null;
            var state = (isEnvelope ? parsed["state"]?.DeepClone() : parsed.DeepClone()) as JsonObject;
            if (state is null)
            {
                SendText(context.Response, 400, "State must be a JSON object");
                return;
            }

            var currentRevision = await ReadStateRevisionAsync(stateFilePath);
            if (!isEnvelope && currentRevision != 0)
            {
                SendJson(context.Response, new
                {
                    ok = false,
                    error = "revision_required",
                    revision = currentRevision
                }, 428);
                return;
            }

            long? expectedRevision = null;
            if (isEnvelope)
            {
                if (parsed["expectedRevision"] is not JsonValue expectedValue ||
                    !expectedValue.TryGetValue<long>(out var parsedRevision) || parsedRevision < 0)
                {
                    SendText(context.Response, 400, "expectedRevision must be a non-negative integer");
                    return;
                }
                expectedRevision = parsedRevision;
            }
            if (expectedRevision.HasValue && expectedRevision.Value != currentRevision)
            {
                SendJson(context.Response, new
                {
                    ok = false,
                    error = "revision_conflict",
                    revision = currentRevision
                }, 409);
                return;
            }

            if (!IsValidStateObject(state, out var validationError))
            {
                SendJson(context.Response, new { ok = false, error = "invalid_state", message = validationError }, 400);
                return;
            }

            var savedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var revision = currentRevision + 1;
            state["schemaVersion"] = 2;
            var meta = state["meta"] as JsonObject ?? new JsonObject();
            meta["format"] = "promptbrain-state";
            meta["revision"] = revision;
            meta["createdAt"] ??= state["savedAt"]?.DeepClone() ?? JsonValue.Create(savedAt);
            meta["updatedAt"] = savedAt;
            meta["lastWriter"] = "desktop-wrapper";
            state["meta"] = meta;
            state["savedAt"] = savedAt;

            var normalizedPayload = state.ToJsonString(new JsonSerializerOptions { WriteIndented = false });
            await WriteStateAtomicallyAsync(stateFilePath, normalizedPayload);
            SendJson(context.Response, new { ok = true, path = stateFilePath, revision, savedAt });
        }
        catch (PayloadTooLargeException)
        {
            SendText(context.Response, 413, "State payload is too large");
        }
        catch (JsonException)
        {
            SendText(context.Response, 400, "Invalid state payload");
        }
        finally
        {
            stateGate.Release();
        }
    }

    private async Task HandleAssetAsync(HttpListenerContext context, string requestPath)
    {
        Directory.CreateDirectory(assetDirectory);

        if (context.Request.HttpMethod.Equals("GET", StringComparison.OrdinalIgnoreCase))
        {
            var fileName = requestPath["api/assets".Length..].Trim('/');
            if (fileName.Length == 0 || fileName != Path.GetFileName(fileName) || !Regex.IsMatch(fileName, "^[a-zA-Z0-9._-]+$"))
            {
                SendText(context.Response, 404, "Asset not found");
                return;
            }

            var path = Path.Combine(assetDirectory, fileName);
            if (!File.Exists(path))
            {
                SendText(context.Response, 404, "Asset not found");
                return;
            }

            var bytes = await File.ReadAllBytesAsync(path);
            context.Response.StatusCode = 200;
            context.Response.ContentType = GetMimeType(path);
            context.Response.ContentLength64 = bytes.Length;
            context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
            await context.Response.OutputStream.WriteAsync(bytes);
            return;
        }

        if (!context.Request.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase) ||
            !requestPath.Equals("api/assets", StringComparison.OrdinalIgnoreCase))
        {
            SendText(context.Response, 405, "Method not allowed");
            return;
        }

        if (!AuthorizeApiRequest(context, requireJson: true)) return;

        try
        {
            var payload = await ReadBoundedBodyAsync(context.Request, AssetBodyLimit);
            var document = JsonNode.Parse(payload) as JsonObject;
            var dataUrl = document?["dataUrl"]?.GetValue<string>() ?? "";
            var match = Regex.Match(dataUrl, "^data:image/(?<type>png|jpe?g|webp|gif);base64,(?<data>[A-Za-z0-9+/=\\r\\n]+)$", RegexOptions.IgnoreCase);
            if (!match.Success)
            {
                SendText(context.Response, 400, "Unsupported image data");
                return;
            }

            var bytes = Convert.FromBase64String(match.Groups["data"].Value);
            if (bytes.Length > 32 * 1024 * 1024)
            {
                SendText(context.Response, 413, "Image is larger than 32 MB");
                return;
            }

            var imageType = match.Groups["type"].Value.ToLowerInvariant();
            var extension = imageType is "jpeg" or "jpg" ? ".jpg" : $".{imageType}";
            var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
            var id = $"img-{hash}";
            var fileName = id + extension;
            var path = Path.Combine(assetDirectory, fileName);

            await assetGate.WaitAsync();
            try
            {
                if (!File.Exists(path))
                {
                    var tempPath = path + $".{Guid.NewGuid():N}.tmp";
                    await File.WriteAllBytesAsync(tempPath, bytes);
                    File.Move(tempPath, path, true);
                }
            }
            finally
            {
                assetGate.Release();
            }

            SendJson(context.Response, new { ok = true, id, url = $"/api/assets/{fileName}", bytes = bytes.Length });
        }
        catch (Exception ex) when (ex is JsonException or FormatException)
        {
            SendText(context.Response, 400, "Invalid asset payload");
        }
        catch (PayloadTooLargeException)
        {
            SendText(context.Response, 413, "Asset payload is too large");
        }
    }

    private async Task HandleOllamaAsync(HttpListenerContext context)
    {
        if (!context.Request.HttpMethod.Equals("POST", StringComparison.OrdinalIgnoreCase))
        {
            SendText(context.Response, 405, "Method not allowed");
            return;
        }

        string payload;
        try
        {
            payload = await ReadBoundedBodyAsync(context.Request, OllamaBodyLimit);
        }
        catch (PayloadTooLargeException)
        {
            SendText(context.Response, 413, "Ollama payload is too large");
            return;
        }
        if (string.IsNullOrWhiteSpace(payload))
        {
            SendText(context.Response, 400, "Missing payload");
            return;
        }

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        using var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:11434/api/generate");
        request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
        request.Headers.UserAgent.ParseAdd("PromptBrain/1.0");

        try
        {
            using var response = await Http.SendAsync(request, timeout.Token);
            var body = await response.Content.ReadAsByteArrayAsync();
            context.Response.StatusCode = (int)response.StatusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.ContentLength64 = body.Length;
            context.Response.OutputStream.Write(body, 0, body.Length);
        }
        catch
        {
            SendJson(context.Response, new
            {
                error = "Ollama is not reachable or took too long at http://127.0.0.1:11434. Start Ollama or turn Local AI off."
            });
        }
    }

    private bool AuthorizeApiRequest(HttpListenerContext context, bool requireJson)
    {
        if (!string.Equals(context.Request.Headers[ApiClientHeader], ApiClientValue, StringComparison.Ordinal))
        {
            SendText(context.Response, 403, "Missing PromptBrain client authorization");
            return false;
        }

        var origin = context.Request.Headers["Origin"];
        if (!string.IsNullOrWhiteSpace(origin))
        {
            var expected = new Uri(Url).GetLeftPart(UriPartial.Authority);
            if (!Uri.TryCreate(origin, UriKind.Absolute, out var supplied) ||
                !string.Equals(supplied.GetLeftPart(UriPartial.Authority), expected, StringComparison.OrdinalIgnoreCase))
            {
                SendText(context.Response, 403, "Cross-origin API request rejected");
                return false;
            }
        }

        if (requireJson && !(context.Request.ContentType ?? "").StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
        {
            SendText(context.Response, 415, "Content-Type must be application/json");
            return false;
        }

        return true;
    }

    private static async Task<string> ReadBoundedBodyAsync(HttpListenerRequest request, int maximumBytes)
    {
        if (request.ContentLength64 > maximumBytes)
        {
            throw new PayloadTooLargeException();
        }

        await using var memory = new MemoryStream(Math.Min(maximumBytes, request.ContentLength64 > 0 ? (int)request.ContentLength64 : 16 * 1024));
        var buffer = new byte[64 * 1024];
        var total = 0;
        while (true)
        {
            var read = await request.InputStream.ReadAsync(buffer);
            if (read == 0) break;
            total += read;
            if (total > maximumBytes) throw new PayloadTooLargeException();
            await memory.WriteAsync(buffer.AsMemory(0, read));
        }

        return Encoding.UTF8.GetString(memory.GetBuffer(), 0, (int)memory.Length);
    }

    private static string ResolveDataDirectory()
    {
        var configured = Environment.GetEnvironmentVariable("PROMPTBRAIN_DATA_DIR");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            var absolute = Path.GetFullPath(configured);
            Directory.CreateDirectory(absolute);
            return absolute;
        }

        var preferred = Path.Combine("E:\\", "PromptBrain", "data");
        try
        {
            Directory.CreateDirectory(preferred);
            return preferred;
        }
        catch
        {
            var fallback = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PromptBrain",
                "data");
            Directory.CreateDirectory(fallback);
            return fallback;
        }
    }

    private static bool IsValidStateObject(JsonObject state, out string error)
    {
        error = "";
        if (state["schemaVersion"] is JsonValue schemaValue &&
            schemaValue.TryGetValue<int>(out var schemaVersion) &&
            schemaVersion is < 1 or > 2)
        {
            error = "Unsupported schemaVersion.";
            return false;
        }

        if (state["chats"] is not JsonArray chats || chats.Count == 0 || chats.Count > 10_000)
        {
            error = "State must contain between 1 and 10,000 chats.";
            return false;
        }

        var chatIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in chats)
        {
            if (node is not JsonObject chat || chat["id"] is not JsonValue idValue ||
                !idValue.TryGetValue<string>(out var id) || string.IsNullOrWhiteSpace(id) || id.Length > 256)
            {
                error = "Every chat must have a non-empty stable id.";
                return false;
            }

            if (!chatIds.Add(id))
            {
                error = "Chat ids must be unique.";
                return false;
            }

            if (chat["messages"] is not null && chat["messages"] is not JsonArray)
            {
                error = "Chat messages must be an array.";
                return false;
            }
        }

        if (state["activeChatId"] is not JsonValue activeValue ||
            !activeValue.TryGetValue<string>(out var activeChatId) ||
            !chatIds.Contains(activeChatId))
        {
            error = "activeChatId must reference an existing chat.";
            return false;
        }

        foreach (var name in new[] { "liked", "references", "profiles", "loras", "versions", "gallery", "trainingRules", "researchNotes" })
        {
            if (state[name] is not null && state[name] is not JsonArray)
            {
                error = $"{name} must be an array.";
                return false;
            }
        }

        foreach (var name in new[] { "builder", "settings", "usageStats", "meta" })
        {
            if (state[name] is not null && state[name] is not JsonObject)
            {
                error = $"{name} must be an object.";
                return false;
            }
        }

        return true;
    }

    private static async Task<byte[]?> ReadValidStateBytesAsync(string statePath)
    {
        if (File.Exists(statePath))
        {
            var primary = await File.ReadAllBytesAsync(statePath);
            if (IsValidStateJson(primary))
            {
                return primary;
            }
        }

        var backupPath = GetStateBackupPath(statePath);
        if (!File.Exists(backupPath))
        {
            return null;
        }

        var backup = await File.ReadAllBytesAsync(backupPath);
        if (!IsValidStateJson(backup))
        {
            return null;
        }

        await RestoreStateAtomicallyAsync(statePath, backup);
        return backup;
    }

    private static bool IsValidStateJson(byte[] bytes)
    {
        try
        {
            var state = JsonNode.Parse(bytes) as JsonObject;
            return state is not null && IsValidStateObject(state, out _);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static async Task<long> ReadStateRevisionAsync(string statePath)
    {
        var bytes = await ReadValidStateBytesAsync(statePath);
        if (bytes is null)
        {
            return 0;
        }

        try
        {
            using var document = JsonDocument.Parse(bytes);
            if (document.RootElement.TryGetProperty("meta", out var meta) &&
                meta.TryGetProperty("revision", out var revision) &&
                revision.TryGetInt64(out var value))
            {
                return Math.Max(0, value);
            }
        }
        catch (JsonException)
        {
            // ReadValidStateBytesAsync already attempted recovery.
        }

        return 0;
    }

    private static async Task WriteStateAtomicallyAsync(string statePath, string payload)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
        var tempPath = statePath + $".{Guid.NewGuid():N}.tmp";
        var backupPath = GetStateBackupPath(statePath);
        try
        {
            var bytes = new UTF8Encoding(false).GetBytes(payload);
            await using (var stream = new FileStream(
                tempPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                64 * 1024,
                FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(bytes);
                await stream.FlushAsync();
                stream.Flush(true);
            }

            if (File.Exists(statePath))
            {
                var current = await File.ReadAllBytesAsync(statePath);
                PreserveLegacyStateBackup(statePath, current);
                if (IsValidStateJson(current))
                {
                    File.Replace(tempPath, statePath, backupPath, true);
                }
                else
                {
                    File.Move(tempPath, statePath, true);
                }
            }
            else
            {
                File.Move(tempPath, statePath);
                File.Copy(statePath, backupPath, true);
            }
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private static async Task RestoreStateAtomicallyAsync(string statePath, byte[] knownGoodBytes)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
        var tempPath = statePath + $".{Guid.NewGuid():N}.restore.tmp";
        try
        {
            await File.WriteAllBytesAsync(tempPath, knownGoodBytes);
            File.Move(tempPath, statePath, true);
        }
        finally
        {
            if (File.Exists(tempPath)) File.Delete(tempPath);
        }
    }

    private static string GetStateBackupPath(string statePath)
    {
        return Path.Combine(Path.GetDirectoryName(statePath)!, "promptbrain-state.backup.json");
    }

    private static void PreserveLegacyStateBackup(string statePath, byte[] current)
    {
        JsonObject legacyState;
        try
        {
            if (JsonNode.Parse(current) is not JsonObject parsed) return;
            legacyState = parsed;
        }
        catch (JsonException)
        {
            return;
        }

        if (legacyState["schemaVersion"] is JsonValue schemaNode &&
            schemaNode.TryGetValue<int>(out var schemaVersion) &&
            schemaVersion >= 2)
        {
            return;
        }

        var legacyBackupPath = Path.Combine(
            Path.GetDirectoryName(statePath)!,
            "promptbrain-state.legacy-backup.json");
        if (!File.Exists(legacyBackupPath))
        {
            File.WriteAllBytes(legacyBackupPath, current);
        }
    }

    private static IEnumerable<object> ParseDuckDuckGo(string html)
    {
        var rowPattern = new Regex(
            "<a[^>]+class=\"result-link\"[^>]+href=\"(?<url>[^\"]+)\"[^>]*>(?<title>.*?)</a>(?<tail>.*?)</td>",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);

        foreach (Match match in rowPattern.Matches(html))
        {
            var title = CleanHtml(match.Groups["title"].Value);
            var link = WebUtility.HtmlDecode(match.Groups["url"].Value);
            var tail = CleanHtml(match.Groups["tail"].Value);
            var snippet = Regex.Replace(tail, "\\s+", " ").Trim();

            if (title.Length == 0)
            {
                continue;
            }

            yield return new
            {
                title,
                url = link,
                snippet = snippet.Length > 260 ? snippet[..260] : snippet
            };
        }
    }

    private static string CleanHtml(string value)
    {
        var noTags = Regex.Replace(value, "<.*?>", " ");
        return WebUtility.HtmlDecode(Regex.Replace(noTags, "\\s+", " ").Trim());
    }

    // Embedded resource names are a closed set, but requestPath arrives over HTTP, so
    // both helpers whitelist the shape rather than trusting a prefix match. A single
    // path segment of [A-Za-z0-9._-] cannot express traversal.
    private static bool IsSafeSegment(string segment)
    {
        if (segment.Length == 0 || segment.Length > 128) return false;
        if (segment is "." or "..") return false;
        foreach (var character in segment)
        {
            var ok = char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-';
            if (!ok) return false;
        }
        return true;
    }

    private static bool IsEngineScript(string requestPath)
    {
        if (!requestPath.StartsWith("engine/", StringComparison.Ordinal)) return false;
        var file = requestPath["engine/".Length..];
        return file.EndsWith(".js", StringComparison.Ordinal) && IsSafeSegment(file);
    }

    private static bool IsCatalogAsset(string requestPath)
    {
        if (!requestPath.StartsWith("catalog/", StringComparison.Ordinal)) return false;
        var segments = requestPath.Split('/');
        // catalog/manifest.json | catalog/<concepts|entities|recipes>/<shard>.json
        if (segments.Length is not (2 or 3)) return false;
        if (segments.Length == 3 && segments[1] is not ("concepts" or "entities" or "recipes")) return false;
        for (var index = 1; index < segments.Length; index += 1)
        {
            if (!IsSafeSegment(segments[index])) return false;
        }
        return segments[^1].EndsWith(".json", StringComparison.Ordinal);
    }

    private bool TryReadResource(string requestPath, out byte[] bytes)
    {
        var resourceName = requestPath switch
        {
            "promptbrain.html" or "index.html" => "promptbrain.html",
            "promptbrain.css" => "promptbrain.css",
            "promptbrain.js" => "promptbrain.js",
            "app-icon.png" => "app-icon.png",
            "favicon.ico" => "app-icon.ico",
            // engine/<file>.js -> engine.<file>.js
            _ when IsEngineScript(requestPath) => $"engine.{requestPath["engine/".Length..]}",
            // catalog/** ships under its request path verbatim (113 shards + manifest).
            _ when IsCatalogAsset(requestPath) => requestPath,
            _ => ""
        };

        if (resourceName.Length == 0)
        {
            bytes = [];
            return false;
        }

        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            bytes = [];
            return false;
        }

        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        bytes = memory.ToArray();
        return true;
    }

    private static int GetFreePort()
    {
        using var socket = new TcpListener(IPAddress.Loopback, 0);
        socket.Start();
        return ((IPEndPoint)socket.LocalEndpoint).Port;
    }

    private static string GetMimeType(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".html" => "text/html; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".js" => "text/javascript; charset=utf-8",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".svg" => "image/svg+xml",
            ".webp" => "image/webp",
            ".ico" => "image/x-icon",
            _ => "application/octet-stream"
        };
    }

    private static void SendJson(HttpListenerResponse response, object value, int statusCode = 200)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
        response.StatusCode = statusCode;
        response.ContentType = "application/json; charset=utf-8";
        response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length);
    }

    private static void SendText(HttpListenerResponse response, int statusCode, string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        response.StatusCode = statusCode;
        response.ContentType = "text/plain; charset=utf-8";
        response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length);
    }

    private sealed class PayloadTooLargeException : Exception
    {
    }
}
