"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const knowledge = require("../tools/knowledge-toolchain.js");
const phase8 = require("../tools/phase8-catalog-builder.js");
const cli = require("../tools/build-phase8-catalog.js");

const ROOT = path.resolve(__dirname, "..");
const PACK_DIR = path.join(ROOT, "knowledge", "packs", "phase-8");
const GENERATED_MANIFEST = path.join(ROOT, "knowledge", "generated", "phase-8", "manifest.json");

const ACCEPTED_PACKS = Object.freeze({
  "phase8.adult-fantasy": {
    type: "concepts", count: 2480,
    source: "df307e061397f3c10ecc680694bac946f1663a5a4f9d3c54c3d14ecdaed2588d",
    compilerOutput: "753fda37a043be2be5a8990a6ddfa7dbfb0d1c54a93ec8cebf0060185d08d849",
    output: "11291ff006ad4af6010071813833a1d590cfdc5204f29f48429c71c21c467734"
  },
  "phase8.anime-entities": {
    type: "entities", count: 324,
    source: "407063f26918887681b24fcbdcc3cee09557cf9761a3d0958508ebd976b844e6",
    output: "916f1b30f5b903c0ad3b42067f280ac02ede265694746c888162c1f22d3e1eac"
  },
  "phase8.art-recipes": {
    type: "recipes", count: 1008,
    source: "2158de24681d3a585ad750fa08a034c74b14f92f92ac31d91c3a597367be1ac4",
    output: "110eae0e18327461584e5c0d2311eddde0aadd97fd8a2d62c47b784ee768e577"
  },
  "phase8.character-performance": {
    type: "concepts", count: 4800,
    source: "3d79ae64c35ff19cc0bbedf7c310c5d5b1e5201cb2b9871647f3065c976ec901",
    compilerOutput: "fbdc672bb765436b36b0671c3170299be5b7add99eb07cd5771cee586a837ad1",
    output: "2237ab16d133c3400ca98542caed8b84c8f59480096a6d723cf445a3f7900747"
  },
  "phase8.installed-loras": {
    type: "concepts", count: 34,
    source: "7e1975f58bf00fea786a2eebb77fe94a0ed8e4ea465caa3a92e4de08a08e6e02",
    compilerOutput: "2076c858ea13e0c2129b403f709c38e51e1523e888c6f0f7f9ac1da025bb1968",
    output: "c773c86ffd073bee3f4a21c4b2f0859106df134f720779b59874ee65bb5e7a03"
  },
  "phase8.scene-craft": {
    type: "concepts", count: 5291,
    source: "ddf84245055f32f1b47c4c96e7b08d2c8d8297823d244365eb259a57d56f0081",
    compilerOutput: "587f3198d8b2bdd54b7d74e963fd8a56df59c8c5a557c33c3d329da51941c732",
    output: "8142e9755ce94c9ba1b2cd98f295834e8c92c0fab303764ac99c0219f46df9f4"
  },
  "phase8.visual-language": {
    type: "concepts", count: 5793,
    source: "c1b20dca1337a236efd4b25957438b8be80fa5cf9c92a88f39078e5ec0f83e2e",
    compilerOutput: "5789782209081163b6f02866862823cf8333e6bc6ab7d55cab3f199251a35ad7",
    output: "ff3da89cc24d3729d819e58b6872fb097acf2856c5ec38bfc4b04417b5d60666"
  },
  "phase8.wardrobe": {
    type: "concepts", count: 4802,
    source: "feeb8b5aac4ba4a490d2a58b87ac92d3da4710507cd4fb4bfd1e88be4b9a7693",
    compilerOutput: "ded1b8c4d8f8550c0f39a049d32aac40ec653bc90cefab862851bd950dd9742e",
    output: "9c0991d5a9680797a17c16473e030606eb8dd7536214a3e5be1fc2d9ce2d965b"
  }
});

const EXTENSION_PACK_IDS = Object.freeze([
  "phase8.artistic-richness",
  "phase8.character-staging-recipes",
  "phase8.character-traits"
]);

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""));
}

function baselineBuild() {
  const acceptedIds = new Set(Object.keys(ACCEPTED_PACKS));
  const packs = cli.readPacks(PACK_DIR).map(({ pack }) => pack).filter((pack) => acceptedIds.has(pack.packId));
  const policy = readJson(path.join(ROOT, "knowledge", "phase-8-policy.json"));
  return {
    packs,
    build: phase8.buildPhase8Catalog(packs, {
      currentCatalog: knowledge.currentCatalog(),
      baseline: readJson(path.join(ROOT, "knowledge", "catalog-baseline.json")),
      policy,
      targets: policy.phase8Targets,
      enforceTargets: true,
      nearDuplicates: true,
      nearDuplicateThreshold: 0.9,
      maxNearDuplicatePairs: 5000000,
      maxNearDuplicateIssues: 10000,
      maxIssues: 100000
    })
  };
}

test("accepted eight-pack Phase 8 baseline is byte-for-byte reproducible", () => {
  const { packs, build } = baselineBuild();
  const expectedIds = Object.keys(ACCEPTED_PACKS).sort();
  assert.deepEqual(packs.map((pack) => pack.packId).sort(), expectedIds);
  assert.equal(build.valid, true, build.errors.join("\n"));
  assert.equal(build.lineage, null, "baseline-only build must remain the historical build");

  const reports = new Map(build.packs.map((report) => [report.packId, report]));
  expectedIds.forEach((packId) => {
    const expected = ACCEPTED_PACKS[packId];
    const pack = packs.find((item) => item.packId === packId);
    const report = reports.get(packId);
    assert.equal(knowledge.fingerprint(pack), expected.source, `${packId} source changed`);
    assert.equal(report.sourceFingerprint, expected.source, `${packId} report source changed`);
    assert.equal(report[expected.type], expected.count, `${packId} contribution count changed`);
    if (expected.compilerOutput) assert.equal(report.outputFingerprint, expected.compilerOutput, `${packId} compiler output changed`);
    const contribution = build.delta[expected.type].filter((item) => item.provenance?.packId === packId);
    assert.equal(knowledge.fingerprint(contribution), expected.output, `${packId} compiled contribution changed`);
  });

  assert.deepEqual(build.stats.delta, {
    concepts: 23200,
    entities: 324,
    recipes: 1008,
    conceptsByKind: build.stats.delta.conceptsByKind,
    adultConcepts: 2484,
    adultAllowedEntities: 0
  });
  assert.equal(build.sourceFingerprint, phase8.ACCEPTED_PHASE8_BASELINE.fingerprints.source);
  assert.equal(build.deltaFingerprint, phase8.ACCEPTED_PHASE8_BASELINE.fingerprints.delta);
  assert.equal(build.effectiveFingerprint, phase8.ACCEPTED_PHASE8_BASELINE.fingerprints.effective);
  const manifest = JSON.parse(phase8.renderArtifacts(build).get("manifest.json"));
  assert.equal(manifest.fingerprint, phase8.ACCEPTED_PHASE8_BASELINE.fingerprints.manifest);
});

test("combined generated manifest names the accepted parent and authored extensions", () => {
  const manifest = readJson(GENERATED_MANIFEST);
  assert.equal(manifest.buildId, "promptbrain-phase-8-with-authored-extensions");
  assert.deepEqual(manifest.lineage?.parent, {
    buildId: phase8.ACCEPTED_PHASE8_BASELINE.buildId,
    packIds: [...phase8.ACCEPTED_PHASE8_BASELINE.packIds],
    fingerprints: { ...phase8.ACCEPTED_PHASE8_BASELINE.fingerprints }
  });
  assert.deepEqual(manifest.lineage?.extensions?.packIds, [...EXTENSION_PACK_IDS]);
});

