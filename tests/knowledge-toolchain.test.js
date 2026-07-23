"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const contracts = require("../engine/contracts.js");
const toolchain = require("../tools/knowledge-toolchain.js");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "phase-7");
const SCALE_ENTRY_COUNT = 30000;

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

function errorsFrom(report) {
  return report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join("\n");
}

function testCurrentCatalogStructuralValidity() {
  const catalog = toolchain.currentCatalog();
  const report = toolchain.auditCatalog(catalog, { nearDuplicates: false });

  assert.equal(report.valid, true, errorsFrom(report));
  assert.equal(report.summary.error, 0);
  assert.match(report.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.catalog, report.coverage.totals);
  assert.equal(report.catalog.checkpoints, catalog.checkpoints.length);
  assert.equal(report.catalog.entities, catalog.entities.length);
  assert.equal(report.catalog.concepts, catalog.concepts.length);
  assert.equal(report.catalog.recipes, catalog.recipes.length);
  assert.equal(report.analysis.nearDuplicates.skipped, true);
}

function testDuplicateAndDanglingReferenceFailures() {
  const report = toolchain.auditCatalog(loadFixture("invalid-catalog.json"), {
    nearDuplicates: false,
    applyPolicy: false
  });
  const codes = new Set(report.issues.map((issue) => issue.code));

  assert.equal(report.valid, false);
  assert.ok(report.summary.error >= 5);
  [
    "concept.duplicate-id",
    "concept.dangling-requirement",
    "concept.dangling-conflict",
    "recipe.dangling-ingredient",
    "recipe.dangling-conflict"
  ].forEach((code) => assert.ok(codes.has(code), `Missing deliberate diagnostic ${code}`));

  const duplicate = report.issues.find((issue) => issue.code === "concept.duplicate-id");
  assert.equal(duplicate.id, "phase7.duplicate");
  assert.equal(duplicate.data.count, 2);

  const dangling = report.issues.find((issue) => issue.code === "concept.dangling-requirement");
  assert.equal(dangling.id, "phase7.references");
  assert.deepEqual(dangling.relatedIds, ["phase7.missing-requirement"]);
}

function testRequirementCycleAndContentLeakFailures() {
  const makeConcept = (id, contentMode, requires) => ({
    schemaVersion: contracts.SCHEMA_VERSION,
    id,
    kind: "style",
    label: id,
    aliases: [id],
    promptForms: { default: id },
    compatibility: { bases: [], checkpointIds: [] },
    requires,
    conflicts: [],
    contentMode,
    group: "",
    priority: 0,
    traits: []
  });
  const report = toolchain.auditCatalog({
    schemaVersion: contracts.SCHEMA_VERSION,
    checkpoints: [],
    entities: [],
    concepts: [
      makeConcept("phase7.cycle-a", "sfw", ["phase7.cycle-b"]),
      makeConcept("phase7.cycle-b", "adult", ["phase7.cycle-a"])
    ],
    recipes: []
  }, { nearDuplicates: false, applyPolicy: false });
  const codes = new Set(report.issues.map((issue) => issue.code));

  assert.equal(report.valid, false);
  assert.ok(codes.has("concept.requirement-cycle"));
  assert.ok(codes.has("concept.content-mode-requirement"));
}

function testControlledMatrixCompilationIsDeterministic() {
  const pack = loadFixture("controlled-matrix-pack.json");
  const options = { existingCatalog: false, nearDuplicates: false };
  const first = toolchain.compilePack(pack, options);
  const second = toolchain.compilePack(pack, options);

  assert.equal(first.valid, true, first.errors.join("\n"));
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.output, second.output);
  assert.equal(first.output.fingerprint, second.output.fingerprint);
  assert.deepEqual(first.output.stats, {
    directEntries: 0,
    matrices: 1,
    generatedConcepts: 5,
    byKind: { lighting: 5 }
  });

  const prompts = first.output.concepts.map((concept) => concept.promptForms.default);
  assert.deepEqual(prompts, [
    "amber light over forest at dawn",
    "blue light over city at night",
    "blue light over forest at dawn",
    "blue light over forest at night",
    "blue light over studio at dawn"
  ]);
  assert.ok(!prompts.some((prompt) => prompt.includes("amber light over studio")));
  assert.ok(!prompts.some((prompt) => prompt.includes("amber light over city")));
  assert.ok(!prompts.includes("amber light over forest at night"));
  assert.ok(!prompts.includes("blue light over city at dawn"));
  assert.ok(!prompts.includes("blue light over studio at night"));

  const amberForest = first.output.concepts.find((concept) => concept.promptForms.default.startsWith("amber"));
  assert.deepEqual(amberForest.compatibility, { bases: ["SDXL"], checkpointIds: [] });
  assert.deepEqual(amberForest.traits, ["outdoor"]);
  assert.ok(amberForest.aliases.includes("phase seven amber forest dawn"));
}

function testInvalidPackIsRejected() {
  const result = toolchain.compilePack(loadFixture("invalid-pack.json"), {
    existingCatalog: false,
    nearDuplicates: false
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("Pack repeats concept id phase7.invalid-pack.duplicate")));
  assert.ok(result.errors.some((message) => message.startsWith("concept.schema:")));
  assert.ok(result.errors.some((message) => message.startsWith("concept.dangling-requirement:")));
  assert.ok(result.audit.summary.error > 0);
}

function testInvalidMatrixSelectorsAndLimitsAreRejected() {
  const badSelector = loadFixture("controlled-matrix-pack.json");
  badSelector.packId = "phase7.bad-selector";
  badSelector.matrices[0].include = [{ setting: "ocean" }];
  const selectorResult = toolchain.compilePack(badSelector, { existingCatalog: false, nearDuplicates: false });
  assert.equal(selectorResult.valid, false);
  assert.ok(selectorResult.errors.some((message) => message.includes("references unknown value ocean")));

  const oversized = loadFixture("controlled-matrix-pack.json");
  oversized.packId = "phase7.oversized-matrix";
  oversized.matrices[0].maxCombinations = 11;
  const sizeResult = toolchain.compilePack(oversized, { existingCatalog: false, nearDuplicates: false });
  assert.equal(sizeResult.valid, false);
  assert.ok(sizeResult.errors.some((message) => message.includes("expands to 12 combinations; limit is 11")));
}

function testSemanticDiff() {
  const diff = toolchain.diffCatalog(
    loadFixture("diff-before.json"),
    loadFixture("diff-after.json")
  );

  assert.notEqual(diff.beforeFingerprint, diff.afterFingerprint);
  assert.deepEqual(diff.summary, { added: 1, removed: 1, changed: 1, unchanged: 1 });
  assert.deepEqual(diff.collections.concepts, {
    added: ["phase7.diff.add"],
    removed: ["phase7.diff.remove"],
    changed: [{ id: "phase7.diff.change", fields: ["label", "priority"] }],
    unchanged: 1
  });
  ["checkpoints", "entities", "recipes"].forEach((collection) => {
    assert.deepEqual(diff.collections[collection], {
      added: [],
      removed: [],
      changed: [],
      unchanged: 0
    });
  });
}

function createScaleCatalog() {
  const empty = Object.freeze([]);
  const universal = Object.freeze({ bases: empty, checkpointIds: empty });
  const sdxl = Object.freeze({ bases: Object.freeze(["SDXL"]), checkpointIds: empty });
  const provenanceByKind = Object.freeze({
    style: Object.freeze({ source: "phase-7-scale", family: "style" }),
    lighting: Object.freeze({ source: "phase-7-scale", family: "lighting" })
  });

  return {
    schemaVersion: contracts.SCHEMA_VERSION,
    checkpoints: [],
    entities: [],
    concepts: Array.from({ length: SCALE_ENTRY_COUNT }, (_unused, index) => {
      const serial = String(index).padStart(5, "0");
      const kind = index % 2 === 0 ? "style" : "lighting";
      const prompt = `phase seven scale ${kind} ${serial}`;
      return {
        schemaVersion: contracts.SCHEMA_VERSION,
        id: `phase7.scale.${serial}`,
        kind,
        label: `Phase 7 scale ${kind} ${serial}`,
        aliases: [prompt],
        promptForms: { default: prompt },
        compatibility: index % 2 === 0 ? universal : sdxl,
        requires: empty,
        conflicts: empty,
        contentMode: index % 10 === 0 ? "adult" : "sfw",
        group: "phase-7-scale",
        priority: 0,
        traits: empty,
        provenance: provenanceByKind[kind]
      };
    }),
    recipes: []
  };
}

function testThirtyThousandEntryAuditAndCoverage() {
  const report = toolchain.auditCatalog(createScaleCatalog(), {
    nearDuplicates: false,
    applyPolicy: false
  });

  assert.equal(report.valid, true, errorsFrom(report));
  assert.deepEqual(report.summary, {
    error: 0,
    warning: 0,
    info: 0,
    total: 0,
    retained: 0,
    truncated: 0
  });
  assert.deepEqual(report.analysis.nearDuplicates, {
    skipped: true,
    candidatePairs: 0,
    matches: 0
  });
  assert.equal(report.policy, null);
  assert.equal(report.catalog.concepts, SCALE_ENTRY_COUNT);
  assert.equal(report.coverage.totals.concepts, SCALE_ENTRY_COUNT);
  assert.equal(report.coverage.totals.adultConcepts, 3000);
  assert.deepEqual(report.coverage.concepts.byKind, { lighting: 15000, style: 15000 });
  assert.deepEqual(report.coverage.concepts.byContentMode, { adult: 3000, sfw: 27000 });
  assert.deepEqual(report.coverage.concepts.declaredByBase, { SDXL: 15000, universal: 15000 });
  assert.deepEqual(report.coverage.concepts.effectiveByBase, {
    FLUX: 15000,
    Pony: 15000,
    "SD1.5": 15000,
    SDXL: 30000
  });
  assert.deepEqual(report.coverage.concepts.byProvenanceSource, { "phase-7-scale": SCALE_ENTRY_COUNT });
}

testCurrentCatalogStructuralValidity();
testDuplicateAndDanglingReferenceFailures();
testRequirementCycleAndContentLeakFailures();
testControlledMatrixCompilationIsDeterministic();
testInvalidPackIsRejected();
testInvalidMatrixSelectorsAndLimitsAreRejected();
testSemanticDiff();
testThirtyThousandEntryAuditAndCoverage();

console.log("Knowledge toolchain Phase 7 tests passed (30,000-entry scale audit included).");
