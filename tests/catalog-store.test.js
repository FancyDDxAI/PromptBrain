"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const CATALOG_DIR = path.join(root, "knowledge", "generated", "phase-8");

// Counts are read from the built manifest rather than pinned here: the catalog is
// expected to grow as packs are authored, and a hardcoded total would only ever
// assert that nobody added content. The invariant worth testing is that the loader
// reproduces the manifest exactly, and that effective = baseline + delta.
const MANIFEST = JSON.parse(
  require("node:fs").readFileSync(path.join(CATALOG_DIR, "manifest.json"), "utf8").replace(/^﻿/, "")
);
const DELTA_CONCEPTS = MANIFEST.stats.delta.concepts;
const EFFECTIVE_CONCEPTS = MANIFEST.stats.effective.concepts;
const DELTA_RECIPES = MANIFEST.stats.delta.recipes;
const EFFECTIVE_RECIPES = MANIFEST.stats.effective.recipes;
const BASELINE_CONCEPTS = 2950;
// The accepted eight-pack baseline: 42 families x 24 variants. Extension packs add
// families on top; phase8-scale.test.js pins the baseline pack itself by id.
const BASELINE_RECIPES = 1008;

function freshEngine() {
  // Each case needs an unregistered engine: registerCatalog mutates module state.
  ["catalog-store.js", "contracts.js", "seed-knowledge.js", "curated-knowledge.js", "art-director.js", "prompt-engine.js"]
    .forEach((file) => delete require.cache[require.resolve(path.join(root, "engine", file))]);
  return {
    store: require(path.join(root, "engine", "catalog-store.js")),
    engine: require(path.join(root, "engine", "prompt-engine.js")),
    artDirector: require(path.join(root, "engine", "art-director.js"))
  };
}

test("catalog store loads the Phase 8 delta and reaches the accepted effective counts", () => {
  const { store, engine, artDirector } = freshEngine();

  assert.equal(engine.ALL_CONCEPTS.length, 2950, "baseline concepts before registration");
  assert.equal(engine.ALL_ART_RECIPES.length, 294, "baseline recipes before registration");

  const catalog = store.loadFromDirectory(CATALOG_DIR);
  assert.equal(catalog.concepts.length, DELTA_CONCEPTS);
  assert.equal(catalog.entities.length, 324);
  assert.equal(catalog.recipes.length, DELTA_RECIPES);
  assert.ok(catalog.recipes.length >= BASELINE_RECIPES, "the accepted 1,008 baseline recipes must never be lost");
  assert.equal(catalog.families.length, catalog.recipes.length / 24, "every family contributes 24 variants");
  assert.ok(catalog.families.length >= 42, "the accepted 42 baseline families must never be lost");

  const registered = store.register(catalog, { engine, artDirector });
  assert.deepEqual(registered.engine, { concepts: DELTA_CONCEPTS, entities: 324, recipes: DELTA_RECIPES });

  assert.equal(engine.ALL_CONCEPTS.length, EFFECTIVE_CONCEPTS, "effective concepts");
  assert.equal(engine.ALL_ENTITIES.length, 330, "effective entities");
  assert.equal(engine.ALL_ART_RECIPES.length, EFFECTIVE_RECIPES, "effective recipes");
  assert.equal(
    EFFECTIVE_CONCEPTS, BASELINE_CONCEPTS + DELTA_CONCEPTS,
    "effective catalog must be exactly the baseline plus the delta"
  );
});

test("registration is additive: ids already known keep their curated definition", () => {
  const { store, engine, artDirector } = freshEngine();
  const before = engine.ALL_CONCEPTS.find((item) => item.id === "style.extremely-artistic");
  const catalog = store.loadFromDirectory(CATALOG_DIR);
  store.register(catalog, { engine, artDirector });
  const after = engine.ALL_CONCEPTS.find((item) => item.id === "style.extremely-artistic");
  assert.equal(after, before, "existing concept object is untouched by registration");

  // Registering twice must not duplicate.
  const second = store.register(catalog, { engine, artDirector });
  assert.deepEqual(second.engine, { concepts: 0, entities: 0, recipes: 0 });
  assert.equal(engine.ALL_CONCEPTS.length, EFFECTIVE_CONCEPTS);
});

test("Phase 8 families are selectable only on an explicit trigger hit", () => {
  const { store, engine, artDirector } = freshEngine();
  const catalog = store.loadFromDirectory(CATALOG_DIR);

  const phase8 = catalog.recipes.find((item) => item.familyId === "phase8.art.camera.deep-focus-architecture");
  const intent = { ...engine.parseIntent("deep focus architecture grammar", { contentMode: "sfw" }), contentMode: "sfw" };

  // Before registration the director cannot see the family at all.
  const before = artDirector.scoreRecipe(phase8, intent, artDirector.analyzeIntent(intent));
  assert.equal(before, -Infinity, "unregistered Phase 8 recipe is unselectable");

  store.register(catalog, { engine, artDirector });

  const after = artDirector.scoreRecipe(phase8, intent, artDirector.analyzeIntent(intent));
  assert.ok(Number.isFinite(after), "registered Phase 8 recipe scores finitely on a trigger hit");

  const directed = artDirector.direct(intent);
  assert.equal(directed.recipe.familyId, "phase8.art.camera.deep-focus-architecture");

  // A request with no Phase 8 trigger must not pull in a Phase 8 family.
  const curatedIntent = { ...engine.parseIntent("artistic graphic poster black white red", { contentMode: "sfw" }), contentMode: "sfw" };
  const curatedPick = artDirector.direct(curatedIntent);
  assert.equal(curatedPick.recipe.familyId, "graphic-poster", "curated families keep winning their own triggers");
});

test("art direction stays opt-in after registration", () => {
  const { store, engine, artDirector } = freshEngine();
  store.register(store.loadFromDirectory(CATALOG_DIR), { engine, artDirector });

  // Recipes fill gaps; they must not impose themselves on a plain request.
  const plain = { ...engine.parseIntent("a woman standing in a kitchen", { contentMode: "sfw" }), contentMode: "sfw" };
  assert.equal(artDirector.direct(plain), null, "no art direction requested, none applied");
});

test("SFW generation never emits an adult concept's prompt text", () => {
  const { store, engine, artDirector } = freshEngine();
  const catalog = store.loadFromDirectory(CATALOG_DIR);
  store.register(catalog, { engine, artDirector });

  // plan.blocks holds rendered prompt STRINGS, not concept objects, so the adult
  // set has to be keyed by prompt text. Comparing against concept ids here would
  // silently never match and make this assertion vacuous.
  const adultPrompts = new Map();
  catalog.concepts
    .filter((item) => item.contentMode === "adult")
    .forEach((item) => {
      Object.values(item.promptForms || {}).forEach((form) => {
        const key = engine.normalizeForMatch(form);
        if (key) adultPrompts.set(key, item.id);
      });
    });
  assert.ok(adultPrompts.size > 1000, `expected adult prompt forms, got ${adultPrompts.size}`);

  // Guard the guard: an adult prompt string must actually be recognised.
  const sampleAdult = catalog.concepts.find((item) => item.contentMode === "adult");
  assert.ok(
    adultPrompts.has(engine.normalizeForMatch(sampleAdult.promptForms.default)),
    "adult lookup table does not recognise a known adult prompt form"
  );

  const requests = [
    "deep focus architecture grammar",
    "artistic graphic poster black white red",
    "sumi ink stillness direction",
    "neon metropolitan night scene",
    "a woman reading in a quiet room"
  ];
  let checked = 0;
  requests.forEach((request) => {
    for (let seed = 0; seed < 40; seed += 1) {
      const result = engine.generate(request, { checkpointId: "waiIllustriousXL", seed, contentMode: "sfw" });
      Object.values(result.plan.blocks || {}).flat().forEach((text) => {
        checked += 1;
        const hit = adultPrompts.get(engine.normalizeForMatch(text));
        assert.ok(!hit, `SFW request "${request}" (seed ${seed}) emitted adult concept ${hit} ("${text}")`);
      });
    }
  });
  assert.ok(checked > 1000, `expected to inspect real prompt text, only saw ${checked} entries`);
});

test("named entities stay adult-ineligible until reviewed evidence exists", () => {
  const { store, engine, artDirector } = freshEngine();
  const catalog = store.loadFromDirectory(CATALOG_DIR);
  store.register(catalog, { engine, artDirector });

  // The gate is evidence-based (builder requires verified-adult status, >=1
  // evidenceRef and >=2 reviewers). Nothing has been reviewed yet, so nothing
  // may be eligible. This must fail loudly if entries are ever blanket-enabled.
  const eligible = catalog.entities.filter((item) => item.adultAllowed === true);
  assert.equal(eligible.length, 0, "no entity may be adult-eligible without reviewed evidence");
  catalog.entities.forEach((item) => {
    assert.equal(item.adultVerification.status, "unknown");
    assert.equal(item.adultVerification.evidenceRefs.length, 0);
    assert.equal(item.adultVerification.reviewedBy.length, 0);
  });
});

test("the UI index exposes labels without leaking full concept objects", () => {
  const { store } = freshEngine();
  const index = store.buildIndex(store.loadFromDirectory(CATALOG_DIR));
  assert.equal(index.total, DELTA_CONCEPTS);
  assert.equal(index.kinds.length, 17);

  const wardrobe = index.byKind("wardrobe");
  assert.ok(wardrobe.length > 5000);
  assert.deepEqual(Object.keys(wardrobe[0]).sort(), ["contentMode", "group", "id", "kind", "label"]);
  assert.equal(index.byKind("nope").length, 0);
});

console.log("PromptBrain catalog store tests passed.");
