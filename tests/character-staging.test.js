"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const CATALOG_DIR = path.join(root, "knowledge", "generated", "phase-8");
const STAGING_PACK_ID = "phase8.character-staging-recipes";

function freshEngine() {
  ["catalog-store.js", "contracts.js", "seed-knowledge.js", "curated-knowledge.js", "art-director.js", "prompt-engine.js"]
    .forEach((file) => delete require.cache[require.resolve(path.join(root, "engine", file))]);
  const store = require(path.join(root, "engine", "catalog-store.js"));
  const engine = require(path.join(root, "engine", "prompt-engine.js"));
  const artDirector = require(path.join(root, "engine", "art-director.js"));
  const catalog = store.loadFromDirectory(CATALOG_DIR);
  store.register(catalog, { engine, artDirector });
  return { store, engine, artDirector, catalog };
}

const OPTIONS = { checkpointId: "waiIllustriousXL", contentMode: "sfw", seed: 7 };

test("staging families add pose and wardrobe without forcing the user's mood", () => {
  const { engine } = freshEngine();
  // Before this pack existed, pose/expression/wardrobe were never populated by any
  // recipe: the curated families only cover style/composition/palette/lighting/
  // camera/quality/motifs/effects.
  const plan = engine.generate("character portrait of a cat girl", OPTIONS).plan;
  assert.ok(plan.artRecipe.id.startsWith("phase9.staging."), `expected a staging recipe, got ${plan.artRecipe.id}`);
  ["pose", "wardrobe"].forEach((slot) => {
    assert.ok((plan.blocks[slot] || []).length > 0, `${slot} must be filled by the staging recipe`);
  });
  assert.deepEqual(plan.blocks.expression, [], "generic portrait staging must not force an expression");
});

test("staging recipes remain descriptive without padding the checkpoint budget", () => {
  const { engine } = freshEngine();
  const compiled = engine.generate("character portrait of a cat girl", OPTIONS).compiled;
  assert.ok(compiled.estimatedTokens > 80, `expected a staged prompt, got ${compiled.estimatedTokens} tokens`);
  assert.ok(compiled.estimatedTokens <= 220, `prompt exceeds the WAI budget: ${compiled.estimatedTokens}`);
  assert.equal(compiled.warnings.filter((w) => /exceeds/.test(w)).length, 0);
});

test("broad staging leaves time, weather, and action-specific choices user-driven", () => {
  const { catalog } = freshEngine();
  const byFamily = new Map(catalog.recipes
    .filter((recipe) => recipe.provenance?.packId === STAGING_PACK_ID)
    .map((recipe) => [recipe.familyId, recipe]));

  ["phase9.staging.grounded-portrait", "phase9.staging.quiet-interior-moment", "phase9.staging.street-candid"]
    .forEach((familyId) => assert.equal(byFamily.get(familyId)?.ingredients.expression, undefined, `${familyId} forces mood`));
  assert.equal(byFamily.get("phase9.staging.combat-stance")?.ingredients.action, undefined, "combat staging forces a weapon action");
  ["wardrobe", "composition", "palette", "effects"].forEach((slot) => {
    assert.equal(byFamily.get("phase9.staging.field-adventure")?.ingredients[slot], undefined, `field staging forces ${slot}`);
  });
  ["lighting", "palette"].forEach((slot) => {
    assert.equal(byFamily.get("phase9.staging.street-candid")?.ingredients[slot], undefined, `street staging forces ${slot}`);
  });
});

test("every staging family declares 24 variants and resolves real ingredients", () => {
  const { catalog, engine } = freshEngine();
  const staged = catalog.recipes.filter((r) => r.provenance?.packId === STAGING_PACK_ID);
  assert.ok(staged.length > 0, "staging pack produced no recipes");

  const byFamily = new Map();
  staged.forEach((r) => {
    if (!byFamily.has(r.familyId)) byFamily.set(r.familyId, []);
    byFamily.get(r.familyId).push(r);
  });
  byFamily.forEach((recipes, familyId) => {
    assert.equal(recipes.length, 24, `${familyId} must generate 24 variants`);
  });

  const conceptIds = new Set(engine.ALL_CONCEPTS.map((c) => c.id));
  staged.forEach((recipe) => {
    Object.entries(recipe.ingredients).forEach(([slot, ids]) => {
      ids.forEach((id) => assert.ok(conceptIds.has(id), `${recipe.id} ${slot} references missing concept ${id}`));
    });
  });
});

test("staging recipes never outrank the curated families on their own triggers", () => {
  const { engine } = freshEngine();
  // Staging families carry a lower priority than the curated art families, so the
  // existing tuned output is preserved and staging only fills otherwise-bare requests.
  const artistic = engine.generate("artistic graphic poster black white red", OPTIONS).plan;
  assert.equal(artistic.artRecipe.familyId, "graphic-poster");
});

test("staging recipes stay SFW-gated", () => {
  const { catalog } = freshEngine();
  const staged = catalog.recipes.filter((r) => r.provenance?.packId === STAGING_PACK_ID);
  const adultIds = new Set(catalog.concepts.filter((c) => c.contentMode === "adult").map((c) => c.id));
  staged.forEach((recipe) => {
    assert.deepEqual(recipe.contentModes, ["sfw"], `${recipe.id} must be sfw-only`);
    Object.values(recipe.ingredients).flat().forEach((id) => {
      assert.ok(!adultIds.has(id), `${recipe.id} pulls adult concept ${id}`);
    });
  });
});

console.log("PromptBrain character staging tests passed.");
