"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { console };
context.globalThis = context;
vm.createContext(context);

["contracts.js", "seed-knowledge.js", "curated-knowledge.js", "art-director.js", "prompt-engine.js"].forEach((file) => {
  const source = fs.readFileSync(path.join(root, "engine", file), "utf8");
  vm.runInContext(source, context, { filename: file });
});

assert.ok(context.PromptBrainContracts);
assert.ok(context.PromptBrainSeedKnowledge);
assert.ok(context.PromptBrainCuratedKnowledge);
assert.ok(context.PromptBrainArtDirector);
assert.ok(context.PromptBrainEngine);

const result = context.PromptBrainEngine.generate(
  "artistic oni woman with black white and red graphic design",
  { checkpointId: "waiIllustriousXL", seed: 77 }
);

assert.equal(result.plan.artRecipe.familyId, "graphic-poster");
assert.ok(result.plan.blocks.style.some((entry) => /graphic anime/i.test(entry)));
assert.ok(result.compiled.positive.includes(result.plan.blocks.style[0]));
assert.ok(result.compiled.positive.includes("oni woman"));
assert.equal(result.compiled.negative, "");

console.log("PromptBrain browser/WebView engine loading test passed.");
