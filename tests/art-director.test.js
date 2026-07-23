"use strict";

const assert = require("node:assert/strict");
const contracts = require("../engine/contracts.js");
const seed = require("../engine/seed-knowledge.js");
const curated = require("../engine/curated-knowledge.js");
const artDirector = require("../engine/art-director.js");
const engine = require("../engine/prompt-engine.js");

assert.ok(curated.CONCEPTS.length >= 2000 && curated.CONCEPTS.length <= 4000);
assert.ok(artDirector.ART_RECIPES.length >= 200 && artDirector.ART_RECIPES.length <= 400);
assert.equal(artDirector.FAMILIES.length, 12);

const allIds = new Set([...seed.CONCEPTS, ...curated.CONCEPTS].map((item) => item.id));
curated.CONCEPTS.forEach((item) => {
  const validation = contracts.validateKnowledgeEntry(item);
  assert.equal(validation.valid, true, `${item.id}: ${validation.errors.join("; ")}`);
});
artDirector.ART_RECIPES.forEach((recipe) => {
  const validation = contracts.validateArtRecipe(recipe);
  assert.equal(validation.valid, true, `${recipe.id}: ${validation.errors.join("; ")}`);
  Object.values(recipe.ingredients).flat().forEach((id) => assert.ok(allIds.has(id), `${recipe.id} -> ${id}`));
});

const golden = [
  ["graphic oni portrait, black white and red poster design", "graphic-poster"],
  ["kitsune woman in a kimono, ukiyo-e woodblock print", "ukiyoe"],
  ["sumi-e swordsman crossing a misty mountain path", "sumi-ink"],
  ["ornamental art nouveau elf portrait", "art-nouveau"],
  ["gothic vampire knight inside a stained glass cathedral", "gothic-glass"],
  ["opulent baroque royal angel in a palace", "baroque-fantasy"],
  ["swordswoman charging through a battlefield, dynamic action", "cinematic-action"],
  ["cyberpunk android in a neon rain-soaked city", "cyberpunk-neon"],
  ["epic fantasy dragon woman in an enchanted castle", "epic-fantasy"],
  ["psychological horror oni inside a ritual blood circle", "symbolic-horror"],
  ["surreal dreamlike woman floating above impossible clouds", "surreal-dream"],
  ["luxury fashion editorial portrait in a hotel", "fashion-editorial"]
];

golden.forEach(([input, familyId], index) => {
  const result = engine.generate(input, { checkpointId: "waiIllustriousXL", seed: 9000 + index });
  assert.equal(result.plan.artRecipe.familyId, familyId, input);
  ["style", "composition", "palette", "lighting"].forEach((block) => {
    assert.ok(result.plan.blocks[block].length > 0, `${input} missing ${block}`);
  });
  assert.equal(result.compiled.negative, "");
  assert.ok(result.plan.artRecipe.rationale.length >= 2);
});

const explicitPalette = engine.generate(
  "graphic oni poster with black white and red palette",
  { checkpointId: "waiIllustriousXL", seed: 10 }
);
assert.equal(explicitPalette.plan.blocks.palette.length, 1);

const plain = engine.generate("adult woman standing in a room", { checkpointId: "waiIllustriousXL", seed: 15 });
assert.equal(plain.plan.artRecipe, null);

const genericOni = engine.generate("artistic oni woman portrait", { checkpointId: "waiIllustriousXL", seed: 16 });
assert.notEqual(genericOni.plan.artRecipe.familyId, "symbolic-horror");
assert.ok(!genericOni.compiled.positive.includes("ritual blood circle"));

const variants = new Set();
for (let seedValue = 1; seedValue <= 80; seedValue += 1) {
  const result = engine.generate("artistic oni woman portrait", {
    checkpointId: "waiIllustriousXL",
    seed: seedValue
  });
  variants.add(result.plan.artRecipe.id);
}
assert.ok(variants.size >= 8, `Expected broad controlled variety, got ${variants.size} variants.`);

console.log(`Art Director tests passed (${curated.CONCEPTS.length} curated concepts, ${artDirector.ART_RECIPES.length} recipes, ${variants.size} seeded variants).`);
