"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const store = require("../engine/catalog-store.js");
const engine = require("../engine/prompt-engine.js");
const artDirector = require("../engine/art-director.js");

const catalog = store.loadFromDirectory(path.join(root, "knowledge", "generated", "phase-8"));
store.register(catalog, { engine, artDirector });

function generate(request, seed = 1) {
  return engine.generate(request, {
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    vibe: "Free",
    seed,
    useBreak: true
  });
}

const forbiddenInBrief = [
  "book-cover",
  "polishing a pair of shoes",
  "packing a day bag",
  "river oracle",
  "colossal ceremonial arches",
  "floating weapon fragments",
  "glowing magical glyphs",
  "panoramic environmental emphasis"
];

test("brief fantasy subjects stay focused across random seeds", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const result = generate("cute elf girl", seed);
    const positive = result.compiled.positive.toLowerCase();
    assert.equal(result.intent.reasoning.intentModel.scope, "brief");
    assert.equal(result.plan.artRecipe, null);
    assert.ok(positive.includes("cute elf girl"), positive);
    assert.ok(positive.includes("pointed elf ears"), positive);
    assert.ok(positive.includes("gentle") || positive.includes("soft") || positive.includes("warm"), positive);
    forbiddenInBrief.forEach((phrase) => assert.equal(positive.includes(phrase), false, `${phrase}\n${positive}`));
    ["action", "interaction", "pose", "wardrobe", "environment", "camera", "palette", "motifs", "effects"]
      .forEach((block) => assert.deepEqual(result.plan.blocks[block], [], `${block} should remain open`));
    assert.ok(result.compiled.estimatedTokens < 80, positive);
  }
});

test("other short subjects use the same restrained completion policy", () => {
  ["cute catgirl", "dark elf woman", "anime boy", "witch girl", "cute elf girl in a forest"].forEach((request, index) => {
    const result = generate(request, 100 + index);
    assert.equal(result.intent.reasoning.intentModel.scope, "brief", request);
    assert.equal(result.plan.artRecipe, null, request);
    assert.equal(result.plan.blocks.action.length, 0, request);
    if (!request.includes("forest")) assert.equal(result.plan.blocks.environment.length, 0, request);
    assert.equal(result.plan.blocks.wardrobe.length, 0, request);
  });
  const darkElf = generate("dark elf woman", 180);
  assert.ok(darkElf.compiled.positive.includes("dark elf woman"));
  assert.equal(darkElf.compiled.positive.includes("dark elf mage"), false);

  const forestElf = generate("cute elf girl in a forest", 181);
  assert.ok(forestElf.compiled.positive.includes("cute elf girl"));
  assert.ok(forestElf.compiled.positive.includes("forest"));
  assert.equal(forestElf.compiled.positive.includes("forest elf ranger"), false);
});

test("explicit scene direction still enables rich planning", () => {
  const result = generate("artistic elf warrior charging through ancient ruins at sunset", 501);
  assert.notEqual(result.intent.reasoning.intentModel.scope, "brief");
  assert.ok(result.plan.blocks.action.length > 0);
  assert.ok(result.plan.blocks.environment.length > 0);
  assert.ok(result.plan.blocks.lighting.length > 0);
  assert.ok(result.compiled.positive.toLowerCase().includes("elf"));
});
