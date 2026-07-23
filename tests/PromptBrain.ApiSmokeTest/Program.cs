using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using PromptBrain;

var workspace = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
var dataRoot = Path.Combine(workspace, "output", "state-api-test", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(dataRoot);
var statePath = Path.Combine(dataRoot, "promptbrain-state.json");
var legacyBackupPath = Path.Combine(dataRoot, "promptbrain-state.legacy-backup.json");
const string legacyDiskState = """
    {"savedAt":42,"activeChatId":"legacy-chat","chats":[{"id":"legacy-chat","title":"Legacy disk state","messages":[]}]}
    """;
await File.WriteAllTextAsync(statePath, legacyDiskState);

using var portProbe = new TcpListener(IPAddress.Loopback, 0);
portProbe.Start();
var port = ((IPEndPoint)portProbe.LocalEndpoint).Port;
portProbe.Stop();

Environment.SetEnvironmentVariable("PROMPTBRAIN_DATA_DIR", dataRoot);
Environment.SetEnvironmentVariable("PROMPTBRAIN_PORT", port.ToString());

using var server = new EmbeddedAppServer();
server.Start();
Console.WriteLine("API smoke: server started");
using var http = new HttpClient { BaseAddress = new Uri(server.Url), Timeout = TimeSpan.FromSeconds(10) };
http.DefaultRequestHeaders.TryAddWithoutValidation("X-PromptBrain-Client", "PromptBrainDesktop");
http.DefaultRequestHeaders.TryAddWithoutValidation("Origin", server.Url.TrimEnd('/'));

using (var unauthorized = new HttpClient { BaseAddress = new Uri(server.Url) })
{
    var denied = await unauthorized.GetAsync("api/state");
    Require(denied.StatusCode == HttpStatusCode.Forbidden, "State API accepted a request without the desktop client header.");
}

var status = await http.GetFromJsonAsync<JsonElement>("api/status");
Require(status.GetProperty("dataRoot").GetString() == Path.GetFullPath(dataRoot), "Status API did not expose the pinned data root.");
Require(status.GetProperty("writerLocked").GetBoolean(), "Status API did not report the active writer lock.");
Environment.SetEnvironmentVariable("PROMPTBRAIN_DATA_DIR", Path.Combine(dataRoot, "must-not-switch"));
var pinnedStatus = await http.GetFromJsonAsync<JsonElement>("api/status");
Require(pinnedStatus.GetProperty("dataRoot").GetString() == Path.GetFullPath(dataRoot), "The running server switched data roots after startup.");
Environment.SetEnvironmentVariable("PROMPTBRAIN_DATA_DIR", dataRoot);

using (var duplicateWriter = new EmbeddedAppServer())
{
    var writerRejected = false;
    try
    {
        duplicateWriter.Start();
    }
    catch (InvalidOperationException ex) when (ex.Message.Contains("another writer", StringComparison.OrdinalIgnoreCase))
    {
        writerRejected = true;
    }
    Require(writerRejected, "A second server acquired the same data writer root.");
}
Console.WriteLine("API smoke: authorization, status, and writer lock passed");

var appHtml = await http.GetStringAsync("promptbrain.html");
Require(appHtml.Contains("./engine/state-store.js", StringComparison.Ordinal), "The app does not load the State V2 browser module.");
var stateStoreScript = await http.GetStringAsync("engine/state-store.js");
Require(stateStoreScript.Contains("createStateStore", StringComparison.Ordinal), "The embedded State V2 module is unavailable.");

var initial = await http.GetFromJsonAsync<JsonElement>("api/state");
Require(
    initial.GetProperty("activeChatId").GetString() == "legacy-chat",
    "The server did not expose the legacy state for browser migration.");

var invalidState = await http.PostAsJsonAsync("api/state", new { settings = new { marker = "invalid" } });
Require(invalidState.StatusCode == HttpStatusCode.BadRequest, "Schema validation accepted a state without chats.");

var legacy = new
{
    savedAt = 100,
    activeChatId = "chat-api",
    chats = new[] { new { id = "chat-api", title = "API test", messages = Array.Empty<object>() } },
    settings = new { marker = "first" }
};
var firstResponse = await http.PostAsJsonAsync("api/state", legacy);
firstResponse.EnsureSuccessStatusCode();
var first = await ReadJsonAsync(firstResponse);
Require(first.RootElement.GetProperty("revision").GetInt64() == 1, "Expected first revision to be 1.");
Require(File.Exists(legacyBackupPath), "The pre-migration legacy state was not preserved.");
Require(
    (await File.ReadAllTextAsync(legacyBackupPath)).Contains("legacy-chat", StringComparison.Ordinal),
    "The legacy migration backup does not contain the original state.");
Console.WriteLine("API smoke: legacy bootstrap passed");

var unversionedOverwrite = await http.PostAsJsonAsync("api/state", legacy);
Require((int)unversionedOverwrite.StatusCode == 428, "An unversioned raw write overwrote existing state.");

using (var wrongOrigin = new HttpRequestMessage(HttpMethod.Post, "api/state"))
{
    wrongOrigin.Headers.TryAddWithoutValidation("X-PromptBrain-Client", "PromptBrainDesktop");
    wrongOrigin.Headers.TryAddWithoutValidation("Origin", "http://example.invalid");
    wrongOrigin.Content = JsonContent.Create(new { schemaVersion = 2, expectedRevision = 1, state = legacy });
    using var isolatedClient = new HttpClient { BaseAddress = new Uri(server.Url) };
    var wrongOriginResponse = await isolatedClient.SendAsync(wrongOrigin);
    Require(wrongOriginResponse.StatusCode == HttpStatusCode.Forbidden, "State API accepted a cross-origin write.");
}

var serverUri = new Uri(server.Url);
using (var oversizedSocket = new TcpClient())
{
    await oversizedSocket.ConnectAsync(serverUri.Host, serverUri.Port);
    await using var stream = oversizedSocket.GetStream();
    var oversizedHeaders = Encoding.ASCII.GetBytes(
        $"POST /api/state HTTP/1.1\r\nHost: {serverUri.Authority}\r\nOrigin: {server.Url.TrimEnd('/')}\r\n" +
        "X-PromptBrain-Client: PromptBrainDesktop\r\nContent-Type: application/json\r\n" +
        $"Content-Length: {32L * 1024 * 1024 + 1}\r\nConnection: close\r\n\r\n");
    await stream.WriteAsync(oversizedHeaders);
    await stream.FlushAsync();
    using var responseReader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
    var statusLine = await responseReader.ReadLineAsync();
    Require(statusLine?.Contains(" 413 ", StringComparison.Ordinal) == true, "Oversized state payload was not rejected before buffering.");
}
Console.WriteLine("API smoke: API rejection cases passed");

var envelope = new
{
    schemaVersion = 2,
    expectedRevision = 1,
    state = new
    {
        schemaVersion = 2,
        activeChatId = "chat-api",
        chats = new[] { new { id = "chat-api", title = "API test", messages = Array.Empty<object>() } },
        settings = new { marker = "second" },
        meta = new { revision = 1 }
    }
};
var secondResponse = await http.PostAsJsonAsync("api/state", envelope);
secondResponse.EnsureSuccessStatusCode();
var second = await ReadJsonAsync(secondResponse);
Require(second.RootElement.GetProperty("revision").GetInt64() == 2, "Expected second revision to be 2.");
Console.WriteLine("API smoke: revisioned save passed");

var conflict = new
{
    schemaVersion = 2,
    expectedRevision = 0,
    state = envelope.state
};
var conflictResponse = await http.PostAsJsonAsync("api/state", conflict);
Require(conflictResponse.StatusCode == HttpStatusCode.Conflict, "Expected HTTP 409 for a stale revision.");

var fakeImage = Convert.ToBase64String(Encoding.UTF8.GetBytes("promptbrain-test-image"));
var assetResponse = await http.PostAsJsonAsync("api/assets", new
{
    id = "test-image",
    dataUrl = $"data:image/png;base64,{fakeImage}"
});
assetResponse.EnsureSuccessStatusCode();
var asset = await ReadJsonAsync(assetResponse);
var assetUrl = asset.RootElement.GetProperty("url").GetString() ?? "";
var assetBytes = await http.GetByteArrayAsync(assetUrl.TrimStart('/'));
Require(assetBytes.Length > 0, "Stored asset was empty.");
Console.WriteLine("API smoke: asset save passed");

var backupPath = Path.Combine(dataRoot, "promptbrain-state.backup.json");
Require(File.Exists(statePath), "Primary state file was not written.");
Require(File.Exists(backupPath), "Known-good state backup was not written.");

var loaded = await http.GetFromJsonAsync<JsonElement>("api/state");
Require(loaded.GetProperty("meta").GetProperty("revision").GetInt64() == 2, "State revision did not round-trip.");
Require(loaded.GetProperty("settings").GetProperty("marker").GetString() == "second", "Latest state did not round-trip.");

await File.WriteAllTextAsync(statePath, "{broken-json");
var recovered = await http.GetFromJsonAsync<JsonElement>("api/state");
Require(recovered.GetProperty("meta").GetProperty("revision").GetInt64() == 1, "Corrupt state was not recovered from backup.");
Require(recovered.GetProperty("settings").GetProperty("marker").GetString() == "first", "Recovered backup did not contain the known-good state.");
Console.WriteLine("API smoke: backup recovery passed");

Console.WriteLine(JsonSerializer.Serialize(new
{
    result = "PASS",
    revision = 2,
    recoveredRevision = 1,
    statePath,
    backupPath,
    assetUrl
}));

static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response)
{
    await using var stream = await response.Content.ReadAsStreamAsync();
    return await JsonDocument.ParseAsync(stream);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
