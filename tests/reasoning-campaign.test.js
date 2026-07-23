"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const seed = require("../engine/seed-knowledge.js");
const engine = require("../engine/prompt-engine.js");

const requests = [
  "artistic oni warrior fighting inside a ruined shrine, low angle",
  "quiet mouse woman reading beside a rain-covered window",
  "cinematic dragon girl flying above a neon city",
  "ice elf charging through frozen ruins with a crystal spear",
  "Android 18 from Dragon Ball fighting in a ruined city",
  "Eren Yeager using ODM gear over city rooftops at sunset",
  "editorial anime portrait with strong negative space",
  "two fantasy knights fighting back to back in a burning courtyard",
  "cute witch preparing tea inside a cozy cottage",
  "gothic vampire woman walking through a candlelit cathedral",
  "science fiction android repairing a spacecraft engine",
  "surreal character standing beneath an impossible floating ocean"
];

test("reasoning campaign stays coherent across every checkpoint dialect", () => {
  let generations = 0;
  Object.keys(seed.CHECKPOINT_PROFILES).forEach((checkpointId, checkpointIndex) => {
    requests.forEach((request, requestIndex) => {
      const options = {
        checkpointId,
        contentMode: "sfw",
        seed: 510000 + checkpointIndex * 100 + requestIndex
      };
      const first = engine.generate(request, options);
      const second = engine.generate(request, options);

      assert.equal(first.compiled.positive, second.compiled.positive, `${checkpointId}: deterministic output drifted`);
      assert.deepEqual(first.reasoning, second.reasoning, `${checkpointId}: reasoning trace drifted`);
      assert.equal(first.reasoning.constraints.remainingConflicts.length, 0, `${checkpointId}: unresolved semantic conflict`);
      assert.ok(first.reasoning.critic.score >= 80, `${checkpointId}: critic ${first.reasoning.critic.score} for ${request}`);
      assert.ok(first.reasoning.sceneGraph.nodes.some((item) => item.type === "actor"), `${checkpointId}: scene graph has no actor`);
      assert.ok(first.reasoning.intentModel.archetype, `${checkpointId}: intent has no archetype`);
      generations += 1;
    });
  });
  assert.ok(generations >= 100);
});

test("explicitly contradictory directions are repaired deterministically", () => {
  const result = engine.generate(
    "anime swordswoman standing in a courtyard, from above, from below, close-up, wide establishing shot",
    { checkpointId: "waiIllustriousXL", contentMode: "sfw", seed: 520001 }
  );
  const lower = result.compiled.positive.toLowerCase();

  assert.equal(lower.includes("from above") && lower.includes("from below"), false);
  assert.equal(lower.includes("close-up") && lower.includes("wide establishing shot"), false);
  assert.equal(result.reasoning.constraints.remainingConflicts.length, 0);
  assert.ok(result.reasoning.constraints.changes.length >= 1);
  assert.ok(result.compiled.warnings.some((warning) => warning.includes("Conflicting explicit directions")));
});

test("scene archetypes change optional direction while preserving explicit content", () => {
  const kinetic = engine.generate("fantasy warrior fighting on a bridge", {
    checkpointId: "waiIllustriousXL",
    seed: 530001
  });
  const quiet = engine.generate("fantasy warrior quietly reading on a bridge", {
    checkpointId: "waiIllustriousXL",
    seed: 530001
  });

  assert.equal(kinetic.reasoning.intentModel.archetype, "kinetic");
  assert.equal(quiet.reasoning.intentModel.archetype, "quiet");
  assert.notEqual(kinetic.compiled.positive, quiet.compiled.positive);
  assert.ok(kinetic.compiled.positive.toLowerCase().includes("warrior"));
  assert.ok(quiet.compiled.positive.toLowerCase().includes("warrior"));
});
