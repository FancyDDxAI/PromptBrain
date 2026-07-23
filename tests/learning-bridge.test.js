"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const bridge = require(path.join(root, "engine", "learning-bridge.js"));
const engine = require(path.join(root, "engine", "prompt-engine.js"));

// Mirrors how promptbrain.js splits rule text into terms.
const extractTerms = (value) => String(value || "").split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);

function conceptResolver() {
  const index = new Map();
  engine.ALL_CONCEPTS.forEach((concept) => {
    (concept.aliases || []).forEach((alias) => {
      const key = engine.normalizeForMatch(alias);
      if (key && !index.has(key)) index.set(key, concept.id);
    });
  });
  return (term) => index.get(engine.normalizeForMatch(term)) || "";
}

const resolveConceptId = conceptResolver();

function intentWith(required = []) {
  return { directives: { required: required.map((conceptId) => ({ conceptId })), forbidden: [] } };
}

test("prefer only boosts ranking and never forbids", () => {
  const intent = intentWith();
  const scores = {};
  const applied = bridge.applyTraining(
    [{ trigger: "x", prefer: "from below", avoid: "" }],
    intent,
    scores,
    { extractTerms, resolveConceptId }
  );
  assert.equal(applied.preferred, 1);
  assert.equal(applied.forbidden, 0);
  assert.equal(intent.directives.forbidden.length, 0);
  assert.equal(scores["camera.from-below"], bridge.PREFER_BOOST, "prefer resolves to a concept id and boosts it");
});

test("avoid forbids a concept the user did not ask for", () => {
  const intent = intentWith();
  const applied = bridge.applyTraining(
    [{ trigger: "x", prefer: "", avoid: "from below" }],
    intent,
    {},
    { extractTerms, resolveConceptId }
  );
  assert.equal(applied.forbidden, 1);
  assert.deepEqual(intent.directives.forbidden, [{ conceptId: "camera.from-below" }]);
});

test("avoid stands down when the user explicitly asked for that concept", () => {
  // The engine rejects forbidden ids even when locked, so the bridge must not add
  // the forbid at all. Learning may never override an explicit request.
  const intent = intentWith(["camera.from-below"]);
  const applied = bridge.applyTraining(
    [{ trigger: "x", prefer: "", avoid: "from below" }],
    intent,
    {},
    { extractTerms, resolveConceptId }
  );
  assert.equal(applied.forbidden, 0);
  assert.deepEqual(applied.skippedBecauseExplicit, ["camera.from-below"]);
  assert.equal(intent.directives.forbidden.length, 0, "explicit request survives a conflicting trained avoid");
});

test("training actually changes generated output, and explicit intent still wins", () => {
  const request = "artistic oni woman portrait";
  const base = engine.parseIntent(request, { checkpointId: "waiIllustriousXL", contentMode: "sfw" });
  const basePlan = engine.planScene(base, { checkpointId: "waiIllustriousXL", contentMode: "sfw" });
  const baseLighting = (basePlan.blocks.lighting || []).slice();
  assert.ok(baseLighting.length > 0, "baseline produced lighting to train against");

  // Forbid whatever the baseline chose for lighting.
  const targetPrompt = baseLighting[0];
  const targetId = resolveConceptId(targetPrompt);
  assert.ok(targetId, `expected to resolve baseline lighting "${targetPrompt}"`);

  const trained = engine.parseIntent(request, { checkpointId: "waiIllustriousXL", contentMode: "sfw" });
  const scores = {};
  bridge.applyTraining([{ trigger: "oni", prefer: "", avoid: targetPrompt }], trained, scores, { extractTerms, resolveConceptId });
  const trainedPlan = engine.planScene(trained, { checkpointId: "waiIllustriousXL", contentMode: "sfw", memoryScores: scores });
  assert.ok(
    !(trainedPlan.blocks.lighting || []).includes(targetPrompt),
    `trained avoid did not remove "${targetPrompt}" from the plan`
  );

  // Same avoid, but now the user explicitly requests it: it must come back.
  const explicit = engine.parseIntent(`${request}, ${targetPrompt}`, { checkpointId: "waiIllustriousXL", contentMode: "sfw" });
  const explicitScores = {};
  const applied = bridge.applyTraining([{ trigger: "oni", prefer: "", avoid: targetPrompt }], explicit, explicitScores, { extractTerms, resolveConceptId });
  assert.deepEqual(applied.skippedBecauseExplicit, [targetId]);
  const explicitPlan = engine.planScene(explicit, { checkpointId: "waiIllustriousXL", contentMode: "sfw", memoryScores: explicitScores });
  assert.ok(
    (explicitPlan.blocks.lighting || []).includes(targetPrompt),
    `explicit request for "${targetPrompt}" was overridden by training`
  );
});

test("memoryScoresFrom records terms under both label and concept id", () => {
  const scores = bridge.memoryScoresFrom([{ term: "from below", score: 3 }], { pull: 2, resolveConceptId });
  assert.equal(scores["from below"], 6);
  assert.equal(scores["camera.from-below"], 6);
});

test("context memory reinforces matching scenes without leaking into unrelated archetypes", () => {
  const buckets = {};
  const writes = bridge.recordContextFeedback(
    buckets,
    {
      checkpointId: "waiIllustriousXL",
      archetype: "kinetic",
      themes: ["fantasy"],
      vibe: "Action",
      contentMode: "sfw"
    },
    ["from below"],
    4
  );
  assert.ok(writes >= 5);

  const matching = {};
  bridge.applyContextScores(
    matching,
    buckets,
    {
      checkpointId: "waiIllustriousXL",
      archetype: "kinetic",
      themes: ["fantasy"],
      vibe: "Action",
      contentMode: "sfw"
    },
    { resolveConceptId }
  );
  assert.ok(matching["camera.from-below"] > 10);

  const unrelated = {};
  bridge.applyContextScores(
    unrelated,
    buckets,
    {
      checkpointId: "fluxDev",
      archetype: "quiet",
      themes: ["realistic"],
      vibe: "Portrait",
      contentMode: "sfw"
    },
    { resolveConceptId }
  );
  assert.ok((unrelated["camera.from-below"] || 0) < matching["camera.from-below"]);
});

console.log("PromptBrain learning bridge tests passed.");
