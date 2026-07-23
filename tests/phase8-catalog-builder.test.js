"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const contracts = require("../engine/contracts.js");
const phase8 = require("../tools/phase8-catalog-builder.js");

function emptyCatalog() {
  return {
    schemaVersion: contracts.SCHEMA_VERSION,
    checkpoints: [],
    entities: [],
    concepts: [],
    recipes: []
  };
}

function conceptPack() {
  return {
    schemaVersion: 1,
    packType: "concepts",
    packId: "phase8.test-concepts",
    source: "phase-8-test",
    defaults: { contentMode: "sfw", traits: ["phase-8-test"] },
    entries: [
      { id: "p8.test.quality", kind: "quality", prompt: "meticulous production finish" },
      { id: "p8.test.style", kind: "style", prompt: "layered editorial illustration" },
      { id: "p8.test.environment", kind: "environment", prompt: "glass-roofed winter conservatory" },
      { id: "p8.test.lighting", kind: "lighting", prompt: "soft north-window illumination" },
      { id: "p8.test.camera.eye", kind: "camera", prompt: "eye-level medium portrait" },
      { id: "p8.test.camera.low", kind: "camera", prompt: "low-angle medium portrait" },
      { id: "p8.test.camera.high", kind: "camera", prompt: "high-angle medium portrait" },
      { id: "p8.test.camera.profile", kind: "camera", prompt: "profile medium portrait" },
      { id: "p8.test.adult-pose", kind: "pose", prompt: "adults-only intimate reclining pose", contentMode: "adult" }
    ]
  };
}

function entityPack() {
  return {
    schemaVersion: 1,
    packType: "entities",
    packId: "phase8.test-entities",
    source: "phase-8-test",
    groups: [{
      id: "original-cast",
      namespace: "Phase Eight Originals",
      traits: ["fictional"],
      entries: [{
        id: "character.phase-eight.astra-vale",
        name: "Astra Vale",
        aliases: ["astra vale from phase eight"],
        promptTags: ["astra vale", "silver-haired cartographer"],
        traits: ["female"],
        adultAllowed: false
      }]
    }]
  };
}

function recipePack() {
  return {
    schemaVersion: 1,
    packType: "recipes",
    packId: "phase8.test-recipes",
    source: "phase-8-test",
    families: [{
      id: "p8.recipe.editorial",
      name: "Phase Eight Editorial",
      variants: 4,
      contentModes: ["sfw"],
      bases: [],
      ingredientSelectors: {
        quality: { ids: ["p8.test.quality"] },
        style: { ids: ["p8.test.style"] },
        environment: { ids: ["p8.test.environment"] },
        lighting: { ids: ["p8.test.lighting"] },
        camera: { ids: ["p8.test.camera.eye", "p8.test.camera.low", "p8.test.camera.high", "p8.test.camera.profile"] }
      },
      requiredSlots: ["quality", "style", "environment", "lighting", "camera"],
      signals: ["editorial scene"],
      triggers: ["phase eight editorial direction"]
    }]
  };
}

function testMultiPackBuildAndDeterminism() {
  const packs = [recipePack(), entityPack(), conceptPack()];
  const options = { currentCatalog: emptyCatalog(), nearDuplicates: false };
  const first = phase8.buildPhase8Catalog(packs, options);
  const second = phase8.buildPhase8Catalog([...packs].reverse(), options);

  assert.equal(first.valid, true, first.errors.join("\n"));
  assert.deepEqual(first.errors, []);
  assert.equal(first.stats.delta.concepts, 9);
  assert.equal(first.stats.delta.entities, 1);
  assert.equal(first.stats.delta.recipes, 4);
  assert.equal(first.deltaFingerprint, second.deltaFingerprint);
  assert.equal(first.effectiveFingerprint, second.effectiveFingerprint);
  assert.deepEqual(first.delta, second.delta);

  const recipeSignatures = new Set(first.delta.recipes.map((item) => JSON.stringify(item.ingredients)));
  assert.equal(recipeSignatures.size, 4);
  first.delta.recipes.forEach((recipe) => {
    assert.ok(recipe.ingredients.camera.length === 1);
    assert.ok(recipe.contentModes.includes("sfw"));
    assert.ok(!recipe.ingredients.pose);
  });

  const firstArtifacts = phase8.renderArtifacts(first);
  const secondArtifacts = phase8.renderArtifacts(second);
  assert.deepEqual([...firstArtifacts.entries()], [...secondArtifacts.entries()]);
  assert.deepEqual(phase8.verifyArtifacts(firstArtifacts), { valid: true, errors: [] });
  const manifest = JSON.parse(firstArtifacts.get("manifest.json"));
  manifest.files.forEach((file) => {
    const expected = crypto.createHash("sha256").update(firstArtifacts.get(file.path), "utf8").digest("hex");
    assert.equal(file.sha256, expected);
  });
}

function testArtifactTamperAndTraversalDetection() {
  const build = phase8.buildPhase8Catalog([conceptPack(), entityPack(), recipePack()], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  const artifacts = phase8.renderArtifacts(build);
  const missing = new Map(artifacts);
  missing.delete("concepts/style.json");
  const missingReport = phase8.verifyArtifacts(missing);
  assert.equal(missingReport.valid, false);
  assert.ok(missingReport.errors.some((message) => message === "Missing artifact: concepts/style.json"));

  const tampered = new Map(artifacts);
  tampered.set("concepts/style.json", tampered.get("concepts/style.json").replace("layered editorial", "altered editorial"));
  const tamperReport = phase8.verifyArtifacts(tampered);
  assert.equal(tamperReport.valid, false);
  assert.ok(tamperReport.errors.some((message) => message === "Artifact SHA-256 mismatch: concepts/style.json"));

  const traversal = new Map(artifacts);
  const manifest = JSON.parse(traversal.get("manifest.json"));
  manifest.files[0].path = "../escape.json";
  traversal.set("manifest.json", `${JSON.stringify(manifest)}\n`);
  const traversalReport = phase8.verifyArtifacts(traversal);
  assert.equal(traversalReport.valid, false);
  assert.ok(traversalReport.errors.some((message) => message === "Unsafe artifact path: ../escape.json"));
}

function testArtifactWriteAndDriftDetection() {
  const build = phase8.buildPhase8Catalog([conceptPack(), entityPack(), recipePack()], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  const artifacts = phase8.renderArtifacts(build);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "promptbrain-phase8-"));
  try {
    phase8.writeArtifacts(root, artifacts);
    assert.deepEqual(phase8.compareArtifacts(root, artifacts), { valid: true, mismatches: [] });

    fs.writeFileSync(path.join(root, "stale.json"), "{}\n", "utf8");
    const stale = phase8.compareArtifacts(root, artifacts);
    assert.equal(stale.valid, false);
    assert.deepEqual(stale.mismatches, [{ path: "stale.json", reason: "stale" }]);

    fs.rmSync(path.join(root, "stale.json"));
    fs.writeFileSync(path.join(root, "coverage.json"), "changed\n", "utf8");
    const changed = phase8.compareArtifacts(root, artifacts);
    assert.equal(changed.valid, false);
    assert.deepEqual(changed.mismatches, [{ path: "coverage.json", reason: "changed" }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testDuplicateEntityAliasesFail() {
  const badEntities = entityPack();
  badEntities.groups[0].entries.push({
    id: "character.phase-eight.astra-impostor",
    name: "Astra Vale",
    aliases: ["astra vale duplicate"],
    promptTags: ["astra impostor"],
    traits: ["fictional"]
  });
  const build = phase8.buildPhase8Catalog([conceptPack(), badEntities], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(build.valid, false);
  assert.ok(build.errors.some((message) => message.startsWith("entity.alias-collision:")));
}

function testAdultEntityVerificationGate() {
  const unverified = entityPack();
  unverified.groups[0].entries[0].adultAllowed = true;
  const rejected = phase8.buildPhase8Catalog([unverified], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.some((message) => message.includes("requests adultAllowed without verified-adult evidence and two reviewers")));
  assert.equal(rejected.delta.entities[0].adultAllowed, false);

  const verified = entityPack();
  verified.groups[0].entries[0].adultAllowed = true;
  verified.groups[0].entries[0].adultVerification = {
    status: "verified-adult",
    evidenceRefs: ["phase8-test-canonical-source"],
    reviewedBy: ["phase8-author", "phase8-auditor"]
  };
  const accepted = phase8.buildPhase8Catalog([verified], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(accepted.valid, true, accepted.errors.join("\n"));
  assert.equal(accepted.delta.entities[0].adultAllowed, true);
}

function testDanglingAndAdultRecipeSelectorsFail() {
  const dangling = recipePack();
  dangling.families[0].ingredientSelectors.style.ids = ["p8.test.missing-style"];
  const missing = phase8.buildPhase8Catalog([conceptPack(), dangling], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((message) => message.includes("references missing concept p8.test.missing-style")));

  const leak = recipePack();
  leak.families[0].ingredientSelectors.pose = { ids: ["p8.test.adult-pose"] };
  leak.families[0].requiredSlots.push("pose");
  const adultLeak = phase8.buildPhase8Catalog([conceptPack(), leak], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(adultLeak.valid, false);
  assert.ok(adultLeak.errors.some((message) => message.includes("selector pose found 0 concepts; needs 1")));
}

function testForwardReferencesAndStableRecipeIds() {
  const firstPack = {
    schemaVersion: 1,
    packType: "concepts",
    packId: "phase8.forward-a",
    entries: [{
      id: "p8.forward.a",
      kind: "style",
      prompt: "forward-linked ink treatment",
      requires: ["p8.forward.b"]
    }]
  };
  const secondPack = {
    schemaVersion: 1,
    packType: "concepts",
    packId: "phase8.forward-b",
    entries: [{
      id: "p8.forward.b",
      kind: "effect",
      prompt: "forward-linked paper texture"
    }]
  };
  const forward = phase8.buildPhase8Catalog([firstPack, secondPack], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(forward.valid, true, forward.errors.join("\n"));

  const smallRecipes = recipePack();
  smallRecipes.families[0].variants = 2;
  const small = phase8.buildPhase8Catalog([conceptPack(), smallRecipes], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  const large = phase8.buildPhase8Catalog([conceptPack(), recipePack()], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  const largeIds = new Set(large.delta.recipes.map((item) => item.id));
  small.delta.recipes.forEach((item) => assert.ok(largeIds.has(item.id), `Recipe id changed after family growth: ${item.id}`));
}

function testDuplicatePackIdsAndTargetGatesFail() {
  const duplicate = phase8.buildPhase8Catalog([conceptPack(), conceptPack()], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some((message) => message === "Pack id phase8.test-concepts is repeated"));

  const gated = phase8.buildPhase8Catalog([conceptPack()], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false,
    enforceTargets: true,
    targets: { concepts: 10, entities: 2, recipes: 1, adultConcepts: 2 }
  });
  assert.equal(gated.valid, false);
  assert.deepEqual(gated.gates.failures.map((item) => item.code), [
    "target.concepts",
    "target.recipes",
    "target.entities",
    "target.adultConcepts"
  ]);
}

function testRecipeSemanticContradictionsFail() {
  const concepts = conceptPack();
  concepts.entries.push(
    { id: "p8.test.composition.close", kind: "composition", prompt: "extreme close-up face composition" },
    { id: "p8.test.camera.full", kind: "camera", prompt: "full-body shot with neutral framing" },
    { id: "p8.test.environment.outdoor", kind: "environment", prompt: "highland village under falling snow" },
    { id: "p8.test.lighting.softbox", kind: "lighting", prompt: "softbox array with gentle diffusion" }
  );
  const recipes = recipePack();
  const family = recipes.families[0];
  family.variants = 1;
  family.ingredientSelectors.composition = { ids: ["p8.test.composition.close"] };
  family.ingredientSelectors.camera = { ids: ["p8.test.camera.full"] };
  family.ingredientSelectors.environment = { ids: ["p8.test.environment.outdoor"] };
  family.ingredientSelectors.lighting = { ids: ["p8.test.lighting.softbox"] };
  family.requiredSlots.push("composition");
  const build = phase8.buildPhase8Catalog([concepts, recipes], {
    currentCatalog: emptyCatalog(),
    nearDuplicates: false
  });
  assert.equal(build.valid, false);
  assert.ok(build.errors.some((message) => message.startsWith("recipe.camera-composition-scale:")));
  assert.ok(build.errors.some((message) => message.startsWith("recipe.environment-lighting-source:")));
}

testMultiPackBuildAndDeterminism();
testArtifactTamperAndTraversalDetection();
testArtifactWriteAndDriftDetection();
testDuplicateEntityAliasesFail();
testAdultEntityVerificationGate();
testDanglingAndAdultRecipeSelectorsFail();
testForwardReferencesAndStableRecipeIds();
testDuplicatePackIdsAndTargetGatesFail();
testRecipeSemanticContradictionsFail();

console.log("Phase 8 catalog builder tests passed.");
