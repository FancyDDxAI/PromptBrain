"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const knowledge = require("../tools/knowledge-toolchain.js");
const phase8 = require("../tools/phase8-catalog-builder.js");
const phase8Cli = require("../tools/build-phase8-catalog.js");

const ROOT = path.resolve(__dirname, "..");
const PACK_DIRECTORY = path.join(ROOT, "knowledge", "packs", "phase-8");
const POLICY_PATH = path.join(ROOT, "knowledge", "phase-8-policy.json");
const BASELINE_PATH = path.join(ROOT, "knowledge", "catalog-baseline.json");

const ACCEPTANCE_MINIMUMS = Object.freeze({
  concepts: 25000,
  entities: 300,
  recipes: 1200,
  adultConcepts: 2000
});
// The accepted eight-pack Phase 8 baseline. Later authored packs extend the catalog
// as a documented Phase 9/10 delta; they must never reduce or replace this.
const BASELINE_RECIPE_PACK_ID = "phase8.art-recipes";
const EXPECTED_RECIPE_FAMILIES = 42;
const EXPECTED_VARIANTS_PER_FAMILY = 24;
const MINIMUM_QUALITY_SCORE = 99.4;
const MAX_NEAR_DUPLICATE_AUDIT_MS = 10 * 60 * 1000;

// Keep these in lockstep with the production Phase 8 CLI's full audit.
const PRODUCTION_NEAR_DUPLICATE_OPTIONS = Object.freeze({
  nearDuplicates: true,
  nearDuplicateThreshold: 0.9,
  maxNearDuplicatePairs: 5000000,
  maxNearDuplicateIssues: 10000,
  maxIssues: 100000
});

const CANONICAL_ALIAS_DEBT_CODES = Object.freeze([...new Set([
  ...phase8.BLOCKING_BASELINE_CODES,
  "recipe.alias-same-family"
])].sort());

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""));
}

function assertAtLeast(actual, minimum, label) {
  assert.ok(
    Number(actual) >= Number(minimum),
    `${label} is ${actual}; expected at least ${minimum}`
  );
}

function buildFailureMessage(build) {
  return [
    ...build.errors,
    ...build.audit.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}: ${issue.message}`),
    ...build.gates.failures.map((failure) => `${failure.code}: ${failure.actual} < ${failure.expected}`),
    ...(build.baselineComparison?.regressions || []).map((regression) => (
      `${regression.code}: ${regression.baseline} -> ${regression.actual}`
    ))
  ].join("\n") || "Phase 8 build was invalid without a reported failure";
}

function effectiveCatalog(currentCatalog, delta) {
  return knowledge.normalizeCatalog({
    schemaVersion: currentCatalog.schemaVersion,
    checkpoints: [...currentCatalog.checkpoints, ...delta.checkpoints],
    entities: [...currentCatalog.entities, ...delta.entities],
    concepts: [...currentCatalog.concepts, ...delta.concepts],
    recipes: [...currentCatalog.recipes, ...delta.recipes]
  });
}

function artifactSnapshot(build) {
  const artifacts = phase8.renderArtifacts(build);
  assert.deepEqual(phase8.verifyArtifacts(artifacts), { valid: true, errors: [] });
  return [...artifacts.entries()].map(([relativePath, contents]) => ({
    path: relativePath,
    bytes: Buffer.byteLength(contents, "utf8"),
    sha256: phase8.rawSha256(contents)
  }));
}

function assertGeneratedProvenance(build, packIds) {
  ["checkpoints", "concepts", "entities", "recipes"].forEach((collection) => {
    build.delta[collection].forEach((item) => {
      assert.ok(item.provenance && typeof item.provenance === "object" && !Array.isArray(item.provenance), (
        `${collection} ${item.id} is missing provenance`
      ));
      assert.ok(String(item.provenance.source || "").trim(), `${collection} ${item.id} has no provenance source`);
      assert.ok(String(item.provenance.packId || "").trim(), `${collection} ${item.id} has no provenance packId`);
      assert.ok(packIds.has(item.provenance.packId), (
        `${collection} ${item.id} references undiscovered provenance pack ${item.provenance.packId}`
      ));
    });
  });
}

function assertRecipeFamilies(build, packFiles, catalog) {
  const recipePacks = packFiles.filter(({ pack }) => phase8.classifyPack(pack) === "recipes");
  const sourceFamilies = recipePacks.flatMap(({ pack }) => Array.isArray(pack.families) ? pack.families : []);
  const sourceFamilyIds = sourceFamilies.map((family) => family.id);

  // The accepted eight-pack baseline is pinned by packId, so later authored
  // extension packs cannot dilute it and cannot hide a regression in it. Every
  // family from every pack must still declare and generate exactly 24 variants.
  const baselinePack = recipePacks.find(({ pack }) => pack.packId === BASELINE_RECIPE_PACK_ID);
  assert.ok(baselinePack, `Accepted recipe pack ${BASELINE_RECIPE_PACK_ID} is missing`);
  const baselineFamilies = baselinePack.pack.families;
  assert.equal(baselineFamilies.length, EXPECTED_RECIPE_FAMILIES, "Unexpected accepted Phase 8 recipe family count");
  assert.equal(
    new Set(baselineFamilies.map((family) => family.id)).size,
    EXPECTED_RECIPE_FAMILIES,
    "Accepted Phase 8 recipe family ids are not unique"
  );

  assert.equal(new Set(sourceFamilyIds).size, sourceFamilies.length, "Recipe family ids are not unique across packs");
  sourceFamilies.forEach((family) => {
    assert.equal(family.variants, EXPECTED_VARIANTS_PER_FAMILY, `${family.id} must declare 24 variants`);
  });

  const generatedByFamily = new Map();
  build.delta.recipes.forEach((recipe) => {
    if (!generatedByFamily.has(recipe.familyId)) generatedByFamily.set(recipe.familyId, []);
    generatedByFamily.get(recipe.familyId).push(recipe);
  });
  assert.equal(generatedByFamily.size, sourceFamilies.length, "Unexpected generated recipe family count");
  assert.deepEqual([...generatedByFamily.keys()].sort(), [...sourceFamilyIds].sort());
  baselineFamilies.forEach((family) => {
    assert.ok(generatedByFamily.has(family.id), `Accepted family ${family.id} disappeared from the build`);
  });

  const conceptById = new Map(catalog.concepts.map((concept) => [concept.id, concept]));
  generatedByFamily.forEach((recipes, familyId) => {
    assert.equal(recipes.length, EXPECTED_VARIANTS_PER_FAMILY, `${familyId} must generate 24 variants`);
    const ingredientSignatures = new Set();
    recipes.forEach((recipe) => {
      assert.ok(Array.isArray(recipe.requiredSlots) && recipe.requiredSlots.length > 0, (
        `${recipe.id} has no required slots`
      ));
      recipe.requiredSlots.forEach((slot) => {
        const selected = recipe.ingredients?.[slot];
        assert.ok(Array.isArray(selected) && selected.length > 0, `${recipe.id} has incomplete required slot ${slot}`);
        assert.equal(recipe.selectionCounts?.[slot], selected.length, `${recipe.id} has stale selection count for ${slot}`);
        selected.forEach((conceptId) => {
          assert.ok(conceptById.has(conceptId), `${recipe.id} required slot ${slot} references missing ${conceptId}`);
        });
      });

      const signature = knowledge.stableStringify(recipe.ingredients);
      assert.ok(!ingredientSignatures.has(signature), `${familyId} repeats ingredient signature ${signature}`);
      ingredientSignatures.add(signature);
    });
  });
}

function assertNoAdultConceptsInSfwRecipes(catalog) {
  const conceptById = new Map(catalog.concepts.map((concept) => [concept.id, concept]));
  catalog.recipes.filter((recipe) => recipe.contentModes?.includes("sfw")).forEach((recipe) => {
    Object.values(recipe.ingredients || {}).flat().forEach((conceptId) => {
      const concept = conceptById.get(conceptId);
      assert.ok(concept, `SFW recipe ${recipe.id} references missing concept ${conceptId}`);
      assert.notEqual(concept.contentMode, "adult", `SFW recipe ${recipe.id} selects adult concept ${conceptId}`);
    });
  });
}

function assertCoverageAndDebt(build, policy, baseline) {
  const coverage = build.audit.coverage;
  Object.entries(ACCEPTANCE_MINIMUMS).forEach(([key, minimum]) => {
    assertAtLeast(coverage.totals[key], minimum, `Effective ${key}`);
  });
  Object.entries(policy.phase8Targets.conceptsByKind).forEach(([kind, minimum]) => {
    assertAtLeast(coverage.concepts.byKind[kind] || 0, minimum, `Effective ${kind} concepts`);
  });
  Object.entries(policy.phase8Targets.effectiveConceptsByBase).forEach(([base, minimum]) => {
    assertAtLeast(coverage.concepts.effectiveByBase[base] || 0, minimum, `Effective ${base} concepts`);
  });

  const minimumQuality = Math.max(
    MINIMUM_QUALITY_SCORE,
    Number(policy.phase8Targets.minimumQualityScore || 0),
    Number(baseline.catalogQualityScore || 0)
  );
  assertAtLeast(build.audit.quality.score, minimumQuality, "Catalog quality score");
  assert.equal(build.audit.quality.ratios.completeRequiredRecipeSlots, 1, "Not all effective recipes have complete required slots");

  const diagnostics = knowledge.countDiagnostics(build.audit);
  CANONICAL_ALIAS_DEBT_CODES.forEach((code) => {
    const allowed = Number(baseline.knownDiagnostics?.[code] || 0);
    const actual = Number(diagnostics[code] || 0);
    assert.ok(actual <= allowed, `${code} debt increased from ${allowed} to ${actual}`);
  });
}

function runPhase8ScaleAcceptance() {
  const packFiles = phase8Cli.readPacks(PACK_DIRECTORY);
  assert.ok(packFiles.length > 0, `No JSON packs discovered in ${PACK_DIRECTORY}`);
  const filenames = packFiles.map(({ filename }) => filename);
  assert.deepEqual(filenames, [...filenames].sort(), "Phase 8 packs were not loaded in stable filename order");

  const packs = packFiles.map(({ pack }) => pack);
  const packIds = new Set(packs.map((pack) => pack.packId));
  const policy = readJson(POLICY_PATH);
  const baseline = readJson(BASELINE_PATH);
  const currentCatalog = knowledge.currentCatalog();
  assert.equal(knowledge.fingerprint(currentCatalog), baseline.catalogFingerprint, "Current catalog no longer matches the Phase 7 baseline");

  const buildOptions = {
    currentCatalog,
    policy,
    baseline,
    enforceTargets: true,
    targets: policy.phase8Targets,
    nearDuplicates: false,
    maxIssues: PRODUCTION_NEAR_DUPLICATE_OPTIONS.maxIssues
  };

  const forwardStarted = performance.now();
  const build = phase8.buildPhase8Catalog(packs, buildOptions);
  const forwardMs = performance.now() - forwardStarted;
  assert.equal(build.valid, true, buildFailureMessage(build));
  assert.deepEqual(build.errors, []);
  assert.equal(build.audit.valid, true, "Phase 8 effective catalog audit failed");
  assert.equal(build.audit.summary.error, 0, "Phase 8 build has structural errors");
  assert.equal(build.audit.summary.truncated, 0, "Phase 8 build audit truncated diagnostics");
  assert.equal(build.gates.valid, true, "Phase 8 target gates failed");
  assert.deepEqual(build.gates.failures, []);
  assert.equal(build.baselineComparison?.valid, true, "Phase 8 baseline comparison failed");
  assert.deepEqual(build.baselineComparison?.regressions, []);

  const catalog = effectiveCatalog(currentCatalog, build.delta);
  assert.equal(knowledge.fingerprint(catalog), build.effectiveFingerprint, "Reconstructed effective catalog fingerprint differs");
  assertCoverageAndDebt(build, policy, baseline);
  assertGeneratedProvenance(build, packIds);
  assertRecipeFamilies(build, packFiles, catalog);
  assertNoAdultConceptsInSfwRecipes(catalog);

  const forwardArtifacts = artifactSnapshot(build);
  const reverseStarted = performance.now();
  let reversedBuild = phase8.buildPhase8Catalog([...packs].reverse(), buildOptions);
  const reverseMs = performance.now() - reverseStarted;
  assert.equal(reversedBuild.valid, true, buildFailureMessage(reversedBuild));
  assert.equal(reversedBuild.deltaFingerprint, build.deltaFingerprint, "Delta fingerprint changed with reversed pack order");
  assert.equal(reversedBuild.effectiveFingerprint, build.effectiveFingerprint, "Effective fingerprint changed with reversed pack order");
  assert.equal(reversedBuild.sourceFingerprint, build.sourceFingerprint, "Source fingerprint changed with reversed pack order");
  assert.deepEqual(reversedBuild.delta, build.delta, "Catalog delta changed with reversed pack order");
  assert.deepEqual(artifactSnapshot(reversedBuild), forwardArtifacts, "Rendered artifacts changed with reversed pack order");
  reversedBuild = null;

  const nearStarted = performance.now();
  const nearAudit = knowledge.auditCatalog(catalog, {
    policy,
    ...PRODUCTION_NEAR_DUPLICATE_OPTIONS
  });
  const nearMs = performance.now() - nearStarted;
  const nearAnalysis = nearAudit.analysis.nearDuplicates;
  assert.equal(nearAudit.valid, true, "Full near-duplicate audit introduced structural errors");
  assert.equal(nearAudit.summary.error, 0, "Full near-duplicate audit found structural errors");
  assert.equal(nearAudit.summary.truncated, 0, "Full near-duplicate audit truncated diagnostics");
  assert.notEqual(nearAnalysis.skipped, true, "Full near-duplicate audit was skipped");
  assert.equal(nearAnalysis.threshold, PRODUCTION_NEAR_DUPLICATE_OPTIONS.nearDuplicateThreshold);
  assert.ok(nearAnalysis.candidatePairs > 0, "Full near-duplicate audit examined no candidate pairs");
  assert.ok(
    nearAnalysis.candidatePairs <= PRODUCTION_NEAR_DUPLICATE_OPTIONS.maxNearDuplicatePairs,
    `Near-duplicate audit exceeded its ${PRODUCTION_NEAR_DUPLICATE_OPTIONS.maxNearDuplicatePairs}-pair budget`
  );
  assert.equal(nearAnalysis.budgetExceeded, false, "Full near-duplicate audit exhausted its pair budget");
  assert.ok(!nearAudit.issues.some((issue) => issue.code === "analysis.near-duplicate-budget"));
  assert.ok(!nearAudit.issues.some((issue) => issue.code === "analysis.near-duplicate-results-truncated"));
  assert.ok(nearMs <= MAX_NEAR_DUPLICATE_AUDIT_MS, (
    `Full near-duplicate audit took ${(nearMs / 1000).toFixed(2)}s; limit is ${MAX_NEAR_DUPLICATE_AUDIT_MS / 1000}s`
  ));

  console.log(
    `Phase 8 near-duplicate audit: ${(nearMs / 1000).toFixed(2)}s, `
    + `${nearAnalysis.candidatePairs} candidate pairs, ${nearAnalysis.matches} matches.`
  );
  console.log(
    `Phase 8 scale acceptance passed: ${packFiles.length} packs; `
    + `${build.stats.effective.concepts} concepts, ${build.stats.effective.entities} entities, `
    + `${build.stats.effective.recipes} recipes; quality ${build.audit.quality.score}; `
    + `builds ${(forwardMs / 1000).toFixed(2)}s/${(reverseMs / 1000).toFixed(2)}s.`
  );
}

runPhase8ScaleAcceptance();
