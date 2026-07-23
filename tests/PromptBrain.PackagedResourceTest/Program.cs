using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text.Json;
using PromptBrain;

// Proves the packaged application actually serves the offline engine and the accepted
// Phase 8 catalog over its own loopback server. Embedding a resource is not the same as
// the runtime being able to route and return it, which is what this exercises.

var workspace = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
var dataRoot = Path.Combine(workspace, "output", "packaged-resource-test", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(dataRoot);

using var portProbe = new TcpListener(IPAddress.Loopback, 0);
portProbe.Start();
var port = ((IPEndPoint)portProbe.LocalEndpoint).Port;
portProbe.Stop();

Environment.SetEnvironmentVariable("PROMPTBRAIN_DATA_DIR", dataRoot);
Environment.SetEnvironmentVariable("PROMPTBRAIN_PORT", port.ToString());

using var server = new EmbeddedAppServer();
var transport = "loopback-http";
try
{
    server.Start();
}
catch (InvalidOperationException ex) when (ex.InnerException is HttpListenerException { ErrorCode: 6 })
{
    // Some restricted Windows test hosts cannot create HttpListener handles. The
    // fallback invokes the same closed resource dispatcher so package completeness,
    // route whitelisting, and stale-catalog detection remain testable there.
    transport = "direct-resource-dispatch";
}

using var http = server.Url.Length > 0
    ? new HttpClient { BaseAddress = new Uri(server.Url), Timeout = TimeSpan.FromSeconds(30) }
    : null;
var directResourceReader = typeof(EmbeddedAppServer).GetMethod(
    "TryReadResource",
    BindingFlags.Instance | BindingFlags.NonPublic);
Require(directResourceReader is not null, "The packaged resource dispatcher is unavailable.");

// 1. The shipping page must load every engine module, in dependency order.
var appHtml = await ReadTextAsync("promptbrain.html");
string[] engineScripts =
[
    "engine/state-store.js",
    "engine/contracts.js",
    "engine/seed-knowledge.js",
    "engine/curated-knowledge.js",
    "engine/art-director.js",
    "engine/prompt-engine.js",
    "engine/catalog-store.js"
];
var lastIndex = -1;
foreach (var script in engineScripts)
{
    var index = appHtml.IndexOf($"./{script}", StringComparison.Ordinal);
    Require(index >= 0, $"promptbrain.html does not load {script}.");
    Require(index > lastIndex, $"{script} is loaded out of dependency order.");
    lastIndex = index;
}

// 2. Every engine module must be served, and be the real module.
var globals = new Dictionary<string, string>
{
    ["engine/contracts.js"] = "PromptBrainContracts",
    ["engine/seed-knowledge.js"] = "PromptBrainSeedKnowledge",
    ["engine/curated-knowledge.js"] = "PromptBrainCuratedKnowledge",
    ["engine/art-director.js"] = "PromptBrainArtDirector",
    ["engine/prompt-engine.js"] = "PromptBrainEngine",
    ["engine/catalog-store.js"] = "PromptBrainCatalogStore"
};
foreach (var (script, global) in globals)
{
    var source = await ReadTextAsync(script);
    Require(source.Contains(global, StringComparison.Ordinal), $"{script} did not expose {global}.");
}

// The engine must be able to take the catalog, or shipping it is pointless.
var engineSource = await ReadTextAsync("engine/prompt-engine.js");
Require(engineSource.Contains("registerCatalog", StringComparison.Ordinal), "The packaged engine cannot register a catalog.");

// 3. The catalog manifest must be served, and must be a valid build.
using var manifest = JsonDocument.Parse(await ReadTextAsync("catalog/manifest.json"));
var manifestRoot = manifest.RootElement;
var effectiveFingerprint = manifestRoot.GetProperty("effectiveFingerprint").GetString();
Require(!string.IsNullOrWhiteSpace(effectiveFingerprint), "Packaged catalog has no effectiveFingerprint.");
Require(manifestRoot.GetProperty("valid").GetBoolean(), "Packaged catalog manifest reports an invalid build.");

// The packaged catalog must be the one currently on disk. Pinning a literal
// fingerprint here would just have to be edited every time a pack is authored;
// what matters is that the build shipped inside the exe is not a stale copy.
var diskManifestPath = Path.Combine(workspace, "knowledge", "generated", "phase-8", "manifest.json");
using var diskManifest = JsonDocument.Parse(File.ReadAllText(diskManifestPath).TrimStart('﻿'));
var diskFingerprint = diskManifest.RootElement.GetProperty("effectiveFingerprint").GetString();
Require(
    effectiveFingerprint == diskFingerprint,
    $"Packaged catalog is stale: exe has {effectiveFingerprint}, working tree has {diskFingerprint}. Rebuild the project after rebuilding the catalog.");

var diskDelta = diskManifest.RootElement.GetProperty("stats").GetProperty("delta");
var expectedConcepts = diskDelta.GetProperty("concepts").GetInt32();
var expectedEntities = diskDelta.GetProperty("entities").GetInt32();
var expectedRecipes = diskDelta.GetProperty("recipes").GetInt32();

// 4. Every shard the manifest indexes must be routable, and the payload must add up.
var shardPaths = manifestRoot.GetProperty("files")
    .EnumerateArray()
    .Select(entry => entry.GetProperty("path").GetString()!.Replace('\\', '/'))
    .Where(path => path.EndsWith(".json", StringComparison.Ordinal))
    .Where(path => path.StartsWith("concepts/", StringComparison.Ordinal)
                || path.StartsWith("entities/", StringComparison.Ordinal)
                || path.StartsWith("recipes/", StringComparison.Ordinal))
    .OrderBy(path => path, StringComparer.Ordinal)
    .ToList();

// One shard per concept kind, per entity namespace, and per recipe family. The count
// grows as packs are authored, so the floor is asserted rather than a literal: what
// matters is that every shard the manifest indexes is actually routable.
Require(shardPaths.Count >= 107, $"Catalog has shrunk: manifest indexes only {shardPaths.Count} shards.");
Require(
    shardPaths.Count(p => p.StartsWith("concepts/", StringComparison.Ordinal)) == 17,
    "Expected exactly 17 concept-kind shards.");

var totals = new Dictionary<string, int> { ["concepts"] = 0, ["entities"] = 0, ["recipes"] = 0 };
var bytesServed = 0L;
foreach (var shardPath in shardPaths)
{
    var payload = await ReadTextAsync($"catalog/{shardPath}");
    bytesServed += payload.Length;
    var collection = shardPath.Split('/')[0];
    using var shard = JsonDocument.Parse(payload);
    Require(shard.RootElement.TryGetProperty(collection, out var items),
        $"Shard {shardPath} has no {collection} array.");
    totals[collection] += items.GetArrayLength();
}

Require(totals["concepts"] == expectedConcepts, $"Served {totals["concepts"]} concepts, manifest says {expectedConcepts}.");
Require(totals["entities"] == expectedEntities, $"Served {totals["entities"]} entities, manifest says {expectedEntities}.");
Require(totals["recipes"] == expectedRecipes, $"Served {totals["recipes"]} recipes, manifest says {expectedRecipes}.");

// Floors from the accepted eight-pack Phase 8 baseline. Authored packs may extend
// the catalog; nothing may shrink it below what was accepted.
Require(totals["concepts"] >= 23200, $"Concept catalog shrank below the accepted baseline: {totals["concepts"]}.");
Require(totals["entities"] == 324, $"Named entities must remain 324, served {totals["entities"]}.");
Require(totals["recipes"] >= 1008, $"Recipe catalog shrank below the accepted baseline: {totals["recipes"]}.");

// 5. Routing must serve only the whitelisted shapes.
// Note: dot-segment traversal is not probed here because it cannot reach this code.
// Program.cs reads Url.AbsolutePath, which Uri normalizes before dispatch, and lookups
// go to GetManifestResourceStream against a closed set of names rather than the disk.
foreach (var probe in new[]
{
    "catalog/concepts/does-not-exist.json",  // unknown shard
    "catalog/secrets/keys.json",             // bucket outside the whitelist
    "catalog/manifest.json.bak",             // not a .json leaf
    "engine/does-not-exist.js",              // unknown engine module
    "engine/state-store.js.map"              // not a .js leaf
})
{
    var response = await ReadResourceAsync(probe);
    Require(response.StatusCode == HttpStatusCode.NotFound, $"Probe {probe} should 404 (got {response.StatusCode}).");
}

Console.WriteLine(JsonSerializer.Serialize(new
{
    result = "PASS",
    engineModules = engineScripts.Length,
    shards = shardPaths.Count,
    concepts = totals["concepts"],
    entities = totals["entities"],
    recipes = totals["recipes"],
    catalogBytesServed = bytesServed,
    effectiveFingerprint,
    transport
}));

async Task<(HttpStatusCode StatusCode, byte[] Bytes)> ReadResourceAsync(string requestPath)
{
    if (http is not null)
    {
        using var response = await http.GetAsync(requestPath);
        return (response.StatusCode, await response.Content.ReadAsByteArrayAsync());
    }

    object?[] arguments = [requestPath, null];
    var found = (bool)(directResourceReader!.Invoke(server, arguments) ?? false);
    return found
        ? (HttpStatusCode.OK, (byte[])(arguments[1] ?? Array.Empty<byte>()))
        : (HttpStatusCode.NotFound, Array.Empty<byte>());
}

async Task<string> ReadTextAsync(string requestPath)
{
    var response = await ReadResourceAsync(requestPath);
    Require(response.StatusCode == HttpStatusCode.OK, $"Packaged route {requestPath} returned {response.StatusCode}.");
    return System.Text.Encoding.UTF8.GetString(response.Bytes);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}
