"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const store = require("../engine/catalog-store.js");
const seed = require("../engine/seed-knowledge.js");
const engine = require("../engine/prompt-engine.js");
const artDirector = require("../engine/art-director.js");
const fixture = require("./fixtures/phase-9-scenarios.json");

const catalog = store.loadFromDirectory(path.join(ROOT, "knowledge", "generated", "phase-8"));
store.register(catalog, { engine, artDirector });

function selectedConceptIds(plan) {
  return new Set(plan.decisions.map((decision) => decision.conceptId));
}

function contains(text, phrase) {
  const haystack = ` ${engine.normalizeForMatch(text)} `;
  const needle = engine.normalizeForMatch(phrase);
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

test("every authored recipe family is reachable through its exact trigger", () => {
  catalog.families.forEach((family, index) => {
    const trigger = family.triggers?.[0];
    assert.ok(trigger, `${family.id} has no trigger`);
    const result = engine.generate(`${trigger}, person`, {
      checkpointId: "waiIllustriousXL",
      contentMode: "sfw",
      seed: 2100000 + index
    });
    assert.equal(result.plan.artRecipe?.familyId, family.id, `${family.id} lost to a broader trigger`);
  });
});

test("campaign scenarios keep requested blocks and fit every checkpoint budget", () => {
  fixture.scenarios.forEach((scenario, scenarioIndex) => {
    Object.values(seed.CHECKPOINT_PROFILES).forEach((profile, profileIndex) => {
      const result = engine.generate(scenario.request, {
        checkpointId: profile.id,
        contentMode: scenario.contentMode,
        seed: 2200000 + scenarioIndex * 100 + profileIndex,
        useBreak: true
      });
      scenario.requiredBlocks.forEach((block) => {
        assert.ok(result.plan.blocks[block]?.length, `${scenario.id}/${profile.id} is missing ${block}`);
      });
      assert.ok(
        result.compiled.estimatedTokens <= profile.maxEstimatedTokens,
        `${scenario.id}/${profile.id} uses ${result.compiled.estimatedTokens}/${profile.maxEstimatedTokens} tokens`
      );
    });
  });
});

test("adult eligibility remains internal while output age scaffolding stays clean", () => {
  const generic = engine.generate("artistic adult woman in an intimate bedroom portrait", {
    checkpointId: "waiIllustriousXL",
    contentMode: "adult",
    seed: 2300001
  });
  assert.ok(generic.plan.participants.some((participant) => participant.adultVerified === true));
  assert.equal(contains(generic.compiled.positive, "adult woman"), false);

  const rejected = engine.generate("artistic adult portrait of Eren Yeager in a private room", {
    checkpointId: "waiIllustriousXL",
    contentMode: "adult",
    seed: 2300002
  });
  assert.equal(rejected.plan.participants.some((participant) => participant.adultVerified === true), false);
  assert.equal(contains(rejected.compiled.positive, "eren yeager"), false);
});

test("installed LoRAs are either exercised compatibly or explicitly incompatible", () => {
  const installed = catalog.concepts.filter((concept) => concept.kind === "lora" && concept.traits.includes("installed"));
  let mapped = 0;
  let incompatible = 0;
  installed.forEach((lora, index) => {
    const profiles = Object.values(seed.CHECKPOINT_PROFILES)
      .filter((profile) => engine.conceptCompatibility(lora, profile.id).compatible);
    if (!profiles.length) {
      incompatible += 1;
      Object.values(seed.CHECKPOINT_PROFILES).forEach((profile) => {
        const decision = engine.conceptCompatibility(lora, profile.id);
        assert.equal(decision.compatible, false);
        assert.ok(decision.reason);
      });
      return;
    }
    mapped += 1;
    const profile = profiles[0];
    const form = lora.promptForms[profile.id] || lora.promptForms[profile.base] || lora.promptForms.default;
    const result = engine.generate("artistic character portrait", {
      checkpointId: profile.id,
      contentMode: lora.contentMode === "adult" ? "adult" : "sfw",
      seed: 2400000 + index,
      loras: [form]
    });
    assert.ok(result.compiled.positive.includes(form), `${lora.id} was not emitted on ${profile.id}`);
  });
  assert.equal(mapped + incompatible, installed.length);
  assert.ok(mapped > 0);
  assert.ok(incompatible > 0);
});

test("positive memory changes an under-specified variant but never an explicit camera", () => {
  const request = "artistic character portrait";
  const options = { checkpointId: "waiIllustriousXL", contentMode: "sfw", seed: 2500001 };
  const baseline = engine.generate(request, options);
  const selected = selectedConceptIds(baseline.plan);
  const candidate = engine.ALL_ART_RECIPES.find((recipe) => (
    recipe.id !== baseline.plan.artRecipe?.id
    && recipe.familyId === baseline.plan.artRecipe?.familyId
    && recipe.contentModes.includes("sfw")
    && Object.entries(recipe.ingredients).some(([slot, ids]) => (
      Number(recipe.selectionCounts?.[slot] || 0) >= ids.length
      && ids.some((id) => !selected.has(id))
    ))
  ));
  assert.ok(candidate, "no alternate recipe candidate was available");
  const target = Object.entries(candidate.ingredients).flatMap(([slot, ids]) => (
    Number(candidate.selectionCounts?.[slot] || 0) >= ids.length ? ids : []
  )).find((id) => !selected.has(id));
  assert.ok(target, "no memory target was available");
  const learned = engine.generate(request, { ...options, memoryScores: { [target]: 100000 } });
  assert.notEqual(learned.plan.artRecipe?.id, baseline.plan.artRecipe?.id);
  assert.ok(selectedConceptIds(learned.plan).has(target));

  const explicit = engine.generate("artistic oni woman portrait from above", {
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    seed: 2500002,
    memoryScores: { "camera.from-below": 100000 }
  });
  assert.equal(contains(explicit.compiled.positive, "from above"), true);
  assert.equal(contains(explicit.compiled.positive, "from below"), false);
});
