"use strict";

const assert = require("node:assert/strict");
const contracts = require("../engine/contracts.js");
const seed = require("../engine/seed-knowledge.js");
const engine = require("../engine/prompt-engine.js");

const subjects = [
  "oni woman",
  "Miqote woman",
  "dragon girl",
  "ice elf",
  "mouse woman",
  "demon woman",
  "fantasy swordswoman",
  "Eren Yeager",
  "Android 18 from Dragon Ball"
];
const actions = ["fighting", "charging with a spear", "flying", "standing", "using ODM gear"];
const environments = ["ancient ruins", "ruined city", "city", "neon hotel room", "moonlit bedroom", "rooftop"];
const styles = ["artistic", "graphic design", "ukiyo-e", "horror", "cinematic action", "fantasy illustration"];
const cameras = ["from above", "low angle", "dutch tilt", "close-up", "wide shot"];
const checkpointIds = Object.keys(seed.CHECKPOINT_PROFILES);

let generated = 0;
for (let index = 0; index < 600; index += 1) {
  const input = [
    styles[index % styles.length],
    subjects[(index * 3) % subjects.length],
    actions[(index * 5 + 1) % actions.length],
    environments[(index * 7 + 2) % environments.length],
    cameras[(index * 11 + 3) % cameras.length]
  ].join(", ");
  const options = {
    checkpointId: checkpointIds[index % checkpointIds.length],
    contentMode: "sfw",
    seed: 1000 + index
  };
  const first = engine.generate(input, options);
  const second = engine.generate(input, options);

  assert.equal(contracts.validatePromptIntent(first.intent).valid, true);
  assert.equal(contracts.validateScenePlan(first.plan).valid, true);
  assert.equal(contracts.validateCompiledPrompt(first.compiled).valid, true);
  assert.equal(first.compiled.positive, second.compiled.positive, `Seed mismatch for: ${input}`);
  assert.ok(first.compiled.positive.length > 20, `Prompt too short for: ${input}`);
  assert.equal(first.compiled.negative, "");

  const lower = first.compiled.positive.toLowerCase();
  assert.ok(!(lower.includes("from above") && lower.includes("from below")), `Vertical camera conflict: ${lower}`);
  assert.ok(!(lower.includes("close-up") && lower.includes("wide establishing shot")), `Distance conflict: ${lower}`);
  if (input.toLowerCase().includes("dragon girl")) {
    assert.ok(!lower.includes("tohru"), `Generic dragon girl became a named character: ${lower}`);
  }
  if (input.toLowerCase().includes("dragon ball")) {
    assert.ok(!lower.includes("dragon horns") && !lower.includes("dragon tail"), `Dragon Ball namespace leaked: ${lower}`);
  }
  first.plan.decisions.forEach((decision) => {
    const result = contracts.validateDecision(decision);
    assert.equal(result.valid, true, `${decision.conceptId}: ${result.errors.join("; ")}`);
  });
  generated += 1;
}

const variants = new Set();
for (let seedValue = 1; seedValue <= 24; seedValue += 1) {
  variants.add(engine.generate("artistic fantasy swordswoman on a rooftop", {
    checkpointId: "waiIllustriousXL",
    seed: seedValue
  }).compiled.positive);
}
assert.ok(variants.size >= 3, `Expected seeded optional choices to vary, received ${variants.size} variants.`);

console.log(`PromptBrain stress tests passed (${generated} generations, ${variants.size} seeded variants).`);
