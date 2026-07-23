(function attachPromptBrainCatalogStore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainCatalogStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCatalogStore() {
  "use strict";

  const SCHEMA_VERSION = 1;
  const MANIFEST = "manifest.json";
  const SHARD_DIRECTORIES = Object.freeze(["concepts", "entities", "recipes"]);

  function stripBom(text) {
    if (String(text).charCodeAt(0) === 0xFEFF) return String(text).slice(1);
    return String(text).replace(/^﻿/, "");
  }

  function parseJson(text, label) {
    try {
      return JSON.parse(stripBom(text));
    } catch (error) {
      throw new Error(`Catalog shard ${label} is not valid JSON: ${error.message}`);
    }
  }

  // manifest.files is the shard index: every generated artifact with its sha256.
  // Driving loads from it means the store never guesses filenames and fails loudly
  // when the build and the runtime disagree.
  function shardPaths(manifest) {
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    const wanted = files
      .map((entry) => String(entry?.path || "").replace(/\\/g, "/"))
      .filter((path) => SHARD_DIRECTORIES.some((dir) => path.startsWith(`${dir}/`)) && path.endsWith(".json"));
    return Object.freeze(wanted.sort());
  }

  function collectionFor(path) {
    const prefix = path.split("/")[0];
    if (prefix === "concepts") return "concepts";
    if (prefix === "entities") return "entities";
    if (prefix === "recipes") return "recipes";
    return "";
  }

  // Shards wrap their payload as { kind, count, fingerprint, concepts|entities|recipes }.
  function shardItems(shard, collection) {
    const items = shard?.[collection];
    return Array.isArray(items) ? items : [];
  }

  function familyNameFromRecipe(recipe) {
    // Variants are named "<Family Name> <n>"; the family object itself is not emitted
    // into the delta, so the shared prefix is the only available display name.
    const name = String(recipe?.name || "").replace(/\s+\d+$/, "").trim();
    return name || String(recipe?.familyId || "");
  }

  function deriveFamilies(recipes) {
    const families = new Map();
    recipes.forEach((recipe) => {
      const id = recipe?.familyId;
      if (!id || families.has(id)) return;
      families.set(id, Object.freeze({
        id,
        name: familyNameFromRecipe(recipe),
        category: String(recipe.category || ""),
        priority: Number.isFinite(recipe.priority) ? recipe.priority : 0,
        // familyTriggers are the family's own phrases; recipe.triggers are long
        // per-variant descriptions and would never match a real request.
        triggers: Object.freeze([...(recipe.familyTriggers || [])]),
        signals: Object.freeze([...(recipe.signals || [])])
      }));
    });
    return Object.freeze([...families.values()]);
  }

  function emptyCatalog() {
    return { concepts: [], entities: [], recipes: [], families: [], fingerprint: "", shards: 0 };
  }

  function assemble(manifest, shards) {
    const catalog = emptyCatalog();
    shards.forEach(({ path, shard }) => {
      const collection = collectionFor(path);
      if (!collection) return;
      catalog[collection].push(...shardItems(shard, collection));
      catalog.shards += 1;
    });
    catalog.families = deriveFamilies(catalog.recipes);
    catalog.fingerprint = String(manifest?.effectiveFingerprint || manifest?.fingerprint || "");
    return catalog;
  }

  function verifyCounts(catalog, manifest) {
    const expected = manifest?.stats?.delta || {};
    const problems = [];
    const check = (label, actual, want) => {
      if (Number.isFinite(want) && actual !== want) problems.push(`${label}: loaded ${actual}, manifest says ${want}`);
    };
    check("concepts", catalog.concepts.length, expected.concepts);
    check("entities", catalog.entities.length, expected.entities);
    check("recipes", catalog.recipes.length, expected.recipes);
    return problems;
  }

  // --- Node -----------------------------------------------------------------

  function loadFromDirectory(directory) {
    if (typeof require !== "function") throw new Error("loadFromDirectory requires a Node environment.");
    const fs = require("node:fs");
    const path = require("node:path");
    const manifestPath = path.join(directory, MANIFEST);
    if (!fs.existsSync(manifestPath)) throw new Error(`Catalog manifest not found: ${manifestPath}`);
    const manifest = parseJson(fs.readFileSync(manifestPath, "utf8"), MANIFEST);
    const shards = shardPaths(manifest).map((shardPath) => ({
      path: shardPath,
      shard: parseJson(fs.readFileSync(path.join(directory, shardPath), "utf8"), shardPath)
    }));
    const catalog = assemble(manifest, shards);
    const problems = verifyCounts(catalog, manifest);
    if (problems.length) throw new Error(`Catalog load mismatch: ${problems.join("; ")}`);
    return catalog;
  }

  // --- WebView / browser ----------------------------------------------------

  async function fetchJson(baseUrl, relativePath) {
    const url = `${String(baseUrl).replace(/\/+$/, "")}/${relativePath}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Catalog fetch failed (${response.status}): ${url}`);
    return parseJson(await response.text(), relativePath);
  }

  async function loadFromUrl(baseUrl, options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
    const concurrency = Math.max(1, Math.min(16, Number(options.concurrency) || 8));
    const manifest = await fetchJson(baseUrl, MANIFEST);
    const paths = shardPaths(manifest);
    const shards = new Array(paths.length);
    let loaded = 0;
    // A bounded local fetch pool avoids both the 113-request waterfall and an
    // unbounded burst against a cold WebView host. Array position preserves the
    // manifest order regardless of completion order.
    for (let start = 0; start < paths.length; start += concurrency) {
      const batch = paths.slice(start, start + concurrency);
      await Promise.all(batch.map(async (shardPath, offset) => {
        const index = start + offset;
        shards[index] = { path: shardPath, shard: await fetchJson(baseUrl, shardPath) };
        loaded += 1;
        if (onProgress) onProgress({ loaded, total: paths.length, path: shardPath });
      }));
    }
    const catalog = assemble(manifest, shards);
    const problems = verifyCounts(catalog, manifest);
    if (problems.length) throw new Error(`Catalog load mismatch: ${problems.join("; ")}`);
    return catalog;
  }

  // --- Registration ---------------------------------------------------------

  function register(catalog, targets = {}) {
    const engine = targets.engine;
    const artDirector = targets.artDirector;
    const result = { engine: null, artDirector: null, fingerprint: catalog.fingerprint };
    // The director must learn the concepts before the engine can select a Phase 8
    // recipe: validateDirection rejects any recipe whose ingredients are unknown.
    if (artDirector && typeof artDirector.registerCatalog === "function") {
      result.artDirector = artDirector.registerCatalog({
        concepts: catalog.concepts,
        recipes: catalog.recipes,
        families: catalog.families
      });
    }
    if (engine && typeof engine.registerCatalog === "function") {
      result.engine = engine.registerCatalog({
        concepts: catalog.concepts,
        entities: catalog.entities,
        recipes: catalog.recipes
      });
    }
    return result;
  }

  // A compact index for UI pickers: never hand the UI the full concept objects.
  function buildIndex(catalog) {
    const byKind = new Map();
    catalog.concepts.forEach((concept) => {
      const kind = concept.kind || "";
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push({
        id: concept.id,
        label: concept.label || concept.id,
        kind,
        contentMode: concept.contentMode || "sfw",
        group: concept.group || ""
      });
    });
    return Object.freeze({
      kinds: Object.freeze([...byKind.keys()].sort()),
      countByKind: Object.freeze(Object.fromEntries([...byKind].map(([kind, items]) => [kind, items.length]))),
      byKind: (kind) => byKind.get(kind) || [],
      total: catalog.concepts.length
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    MANIFEST,
    shardPaths,
    deriveFamilies,
    loadFromDirectory,
    loadFromUrl,
    register,
    buildIndex
  });
});
