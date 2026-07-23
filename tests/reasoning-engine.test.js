"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const contracts = require("../engine/contracts.js");
const reasoning = require("../engine/reasoning-engine.js");
const engine = require("../engine/prompt-engine.js");

function mockPlan() {
  return {
    schemaVersion: contracts.SCHEMA_VERSION,
    requestId: "reasoning-test",
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    seed: 77,
    participants: [],
    artRecipe: null,
    blocks: {
      ...contracts.emptyBlocks(),
      subject: ["anime swordswoman"],
      camera: ["from above", "low angle", "from below"],
      pose: ["standing pose", "lying on side"]
    },
    locked: ["camera.above"],
    rejected: [],
    warnings: [],
    decisions: [
      {
        conceptId: "subject.test",
        source: "explicit",
        block: "subject",
        prompt: "anime swordswoman",
        reason: "test",
        score: 900,
        locked: true,
        group: ""
      },
      {
        conceptId: "camera.above",
        source: "explicit",
        block: "camera",
        prompt: "from above",
        reason: "test",
        score: 900,
        locked: true,
        group: ""
      },
      {
        conceptId: "camera.low",
        source: "inferred",
        block: "camera",
        prompt: "low angle",
        reason: "test",
        score: 20,
        locked: false,
        group: ""
      },
      {
        conceptId: "camera.below",
        source: "inferred",
        block: "camera",
        prompt: "from below",
        reason: "test",
        score: 18,
        locked: false,
        group: ""
      },
      {
        conceptId: "pose.standing",
        source: "explicit",
        block: "pose",
        prompt: "standing pose",
        reason: "test",
        score: 900,
        locked: true,
        group: ""
      },
      {
        conceptId: "pose.lying",
        source: "inferred",
        block: "pose",
        prompt: "lying on side",
        reason: "test",
        score: 20,
        locked: false,
        group: ""
      }
    ]
  };
}

test("intent compiler produces semantic goals instead of a flat keyword list", () => {
  const intent = engine.parseIntent("Eren Yeager fighting through a ruined city at sunset", {
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    seed: 41001
  });
  const model = reasoning.compileIntent(intent);
  const graph = reasoning.buildSceneGraph(intent, model);

  assert.ok(model.goals.includes("action"));
  assert.ok(model.themes.includes("anime"));
  assert.equal(model.archetype, "kinetic");
  assert.ok(model.entityIds.includes("character.eren-yeager"));
  assert.ok(graph.nodes.some((item) => item.type === "actor" && item.identity === "Eren Yeager"));
  assert.ok(graph.edges.some((item) => item.type === "combat"));
});

test("generic fantasy subjects remain generic in the semantic model", () => {
  const intent = engine.parseIntent("dragon girl fighting in ancient ruins", {
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    seed: 41002
  });
  const model = reasoning.compileIntent(intent);

  assert.equal(model.entityIds.some((id) => /tohru|maid/i.test(id)), false);
  assert.ok(model.themes.includes("fantasy"));
  assert.equal(model.archetype, "kinetic");
});

test("scene graph creates relationship roles without inventing named identities", () => {
  const intent = engine.parseIntent("two women fighting on a rooftop", {
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    seed: 41003
  });
  const model = reasoning.compileIntent(intent);
  const graph = reasoning.buildSceneGraph(intent, model);
  const actors = graph.nodes.filter((item) => item.type === "actor");

  assert.equal(model.requestedParticipants, 2);
  assert.equal(actors.length, 2);
  assert.equal(actors.every((item) => !item.identity), true);
  assert.equal(graph.edges[0].from, actors[0].id);
  assert.equal(graph.edges[0].to, actors[1].id);
});

test("constraint resolver keeps stronger explicit directions and removes contradictions", () => {
  const plan = mockPlan();
  const result = reasoning.resolvePlan(plan, {
    model: { text: "anime swordswoman from above standing" }
  });

  assert.deepEqual(plan.blocks.camera, ["from above"]);
  assert.deepEqual(plan.blocks.pose, ["standing pose"]);
  assert.equal(result.remainingConflicts.length, 0);
  assert.ok(result.changes.some((item) => item.conceptId === "camera.below"));
  assert.ok(result.changes.some((item) => item.conceptId === "pose.lying"));
});

test("coherence ranking favors scene-compatible optional choices", () => {
  const model = { archetype: "kinetic", themes: ["fantasy"] };
  const variation = { axis: "camera", energy: "high" };
  const dynamic = reasoning.scoreCandidate({
    kind: "camera",
    group: "camera.angle",
    label: "dynamic foreshortened action angle",
    promptForms: {}
  }, { model, variation });
  const passive = reasoning.scoreCandidate({
    kind: "pose",
    group: "pose.standing",
    label: "still standing passport pose",
    promptForms: {}
  }, { model, variation });

  assert.ok(dynamic > passive);
});

test("variation plans are seeded, reproducible, and protect explicit slots", () => {
  const model = {
    seed: 41004,
    archetype: "portrait",
    explicitSlots: { camera: ["camera.from-above"], style: ["style.anime"] }
  };
  const first = reasoning.createVariationProfile(model);
  const second = reasoning.createVariationProfile(model);
  const alternate = reasoning.createVariationProfile(model, { seed: 41005 });

  assert.deepEqual(first, second);
  assert.ok(first.protectedBlocks.includes("camera"));
  assert.notEqual(first.axis, "camera");
  assert.ok(first.axis !== alternate.axis || first.choiceIndex !== alternate.choiceIndex);
});

test("integrated engine exposes scene reasoning and a passing prompt critic", () => {
  const result = engine.generate("artistic ice elf charging with a spear through frozen ruins", {
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    seed: 41006
  });

  assert.equal(result.reasoning.intentModel.archetype, "kinetic");
  assert.ok(result.reasoning.sceneGraph.nodes.some((item) => item.type === "actor"));
  assert.equal(result.reasoning.constraints.remainingConflicts.length, 0);
  assert.ok(result.reasoning.critic.score >= 80, JSON.stringify(result.reasoning.critic.issues));
  assert.equal(result.compiled.critic.score, result.reasoning.critic.score);
});
