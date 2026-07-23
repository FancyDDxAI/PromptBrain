"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const knowledge = require("../tools/knowledge-toolchain.js");
const phase8 = require("../tools/phase8-catalog-builder.js");

const ROOT = path.resolve(__dirname, "..");
const GENERATED = path.join(ROOT, "knowledge", "generated", "phase-8");
const STAGING_PACK_ID = "phase8.character-staging-recipes";

function concept(id, kind, prompt) {
  return { id, kind, promptForms: { default: prompt } };
}

function issueCodes(slots, prompts, options = {}) {
  const concepts = [];
  const ingredients = {};
  Object.entries(prompts).forEach(([slot, prompt]) => {
    const id = `test.${slot}`;
    concepts.push(concept(id, slot === "effects" ? "effect" : slot, prompt));
    ingredients[slot] = [id];
  });
  const recipe = {
    id: options.id || "test.staging.recipe",
    familyId: options.familyId || "phase9.staging.test",
    familyTriggers: options.familyTriggers || [],
    ingredients,
    provenance: { packId: STAGING_PACK_ID }
  };
  return phase8.recipeSemanticIssues(recipe, knowledge.normalizeCatalog({ concepts })).map((issue) => issue.code);
}

test("builder rejects weapon modality contradictions", () => {
  assert.ok(issueCodes({}, { pose: "unarmed guard stance", action: "drawing a bowstring" })
    .includes("recipe.pose-action-weapon-modality"));
});

test("builder rejects climate and time/palette contradictions", () => {
  assert.ok(issueCodes({}, { environment: "mangrove wetlands", wardrobe: "insulated winter parka" })
    .includes("recipe.climate-slot-conflict"));
  assert.ok(issueCodes({}, { lighting: "window daylight", palette: "midnight neon-night palette" })
    .includes("recipe.time-palette-conflict"));
});

test("builder rejects unrelated character quality and broad mood overrides", () => {
  assert.ok(issueCodes({}, { pose: "standing portrait", quality: "automotive vehicle surface fidelity" })
    .includes("recipe.character-quality-domain"));
  assert.ok(issueCodes({}, { expression: "playful smile" }, {
    familyId: "phase9.staging.grounded-portrait",
    familyTriggers: ["portrait of"]
  }).includes("recipe.broad-trigger-mood-override"));
});

test("a coherent user-driven staging recipe passes the new gates", () => {
  assert.deepEqual(issueCodes({}, {
    pose: "balanced standing pose",
    environment: "quiet gallery interior",
    lighting: "soft window spill",
    palette: "muted neutral palette"
  }), []);
});

test("authored traits separate optional anatomy from costume language", () => {
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, "knowledge", "packs", "phase-8", "character-traits.json"), "utf8"));
  const entries = new Map(pack.entries.map((entry) => [entry.id, entry]));
  assert.deepEqual(entries.get("phase8.traits.subject.cat-girl").requires, ["phase8.traits.anatomy.cat-ears"]);
  assert.equal(entries.get("phase8.traits.subject.cat-girl").requires.includes("phase8.traits.anatomy.cat-tail"), false);
  assert.equal(entries.get("phase8.traits.subject.cat-girl").requires.includes("phase8.traits.anatomy.slit-pupils"), false);
  assert.equal(entries.get("phase8.traits.subject.bunny-girl").requires, undefined);
  assert.deepEqual(entries.get("phase8.traits.subject.rabbit-woman").requires, [
    "phase8.traits.anatomy.rabbit-ears",
    "phase8.traits.anatomy.rabbit-tail"
  ]);
  assert.equal(entries.get("phase8.traits.environment.photo-studio").aliases.includes("studio"), false);
});

test("all generated staging recipes pass semantic gates and preserve 24 variants", () => {
  const delta = JSON.parse(fs.readFileSync(path.join(GENERATED, "catalog-delta.json"), "utf8"));
  const catalog = knowledge.normalizeCatalog({
    ...knowledge.currentCatalog(),
    concepts: [...knowledge.currentCatalog().concepts, ...delta.concepts],
    entities: [...knowledge.currentCatalog().entities, ...delta.entities],
    recipes: [...knowledge.currentCatalog().recipes, ...delta.recipes]
  });
  const staged = delta.recipes.filter((recipe) => recipe.provenance?.packId === STAGING_PACK_ID);
  assert.equal(staged.length, 144);
  const counts = staged.reduce((map, recipe) => map.set(recipe.familyId, (map.get(recipe.familyId) || 0) + 1), new Map());
  assert.equal(counts.size, 6);
  counts.forEach((count, familyId) => assert.equal(count, 24, `${familyId} contribution changed`));
  staged.forEach((recipe) => {
    assert.deepEqual(phase8.recipeSemanticIssues(recipe, catalog), [], `${recipe.id} is semantically contradictory`);
  });
});

test("artistic richness introduces no duplicate normalized alias warning", () => {
  const audit = JSON.parse(fs.readFileSync(path.join(GENERATED, "audit.json"), "utf8"));
  const richnessIds = new Set(JSON.parse(fs.readFileSync(
    path.join(ROOT, "knowledge", "packs", "phase-8", "artistic-richness.json"), "utf8"
  )).entries.map((entry) => entry.id));
  const duplicate = audit.issues.filter((issue) => issue.code === "concept.duplicate-array-value"
    && (richnessIds.has(issue.id) || issue.relatedIds?.some((id) => richnessIds.has(id))));
  assert.deepEqual(duplicate, []);
});

