#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const knowledge = require("./knowledge-toolchain.js");
const phase8 = require("./phase8-catalog-builder.js");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PACK_DIRECTORY = path.join(ROOT, "knowledge", "packs", "phase-8");
const DEFAULT_OUTPUT_DIRECTORY = path.join(ROOT, "knowledge", "generated", "phase-8");
const DEFAULT_POLICY = path.join(ROOT, "knowledge", "phase-8-policy.json");
const DEFAULT_BASELINE = path.join(ROOT, "knowledge", "catalog-baseline.json");

function usage() {
  return [
    "PromptBrain Phase 8 catalog builder",
    "",
    "Usage:",
    "  node tools/build-phase8-catalog.js [options]",
    "",
    "Options:",
    "  --check               Compare generated files without writing",
    "  --no-near             Skip near-duplicate analysis",
    "  --allow-incomplete    Do not enforce Phase 8 size/coverage targets",
    "  --pack-dir <path>     Read pack JSON files from this directory",
    "  --out-dir <path>      Write deterministic artifacts here",
    "  --policy <path>       Use a different Phase 8 policy",
    "  --baseline <path>     Use a different Phase 7 baseline",
    "  --json                Print a machine-readable summary",
    "  -h, --help            Show this help"
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    check: false,
    nearDuplicates: true,
    enforceTargets: true,
    json: false,
    packDirectory: DEFAULT_PACK_DIRECTORY,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    policyPath: DEFAULT_POLICY,
    baselinePath: DEFAULT_BASELINE
  };
  const args = [...argv];
  const readValue = (index, flag) => {
    const value = args[index + 1];
    if (!value || value.startsWith("-")) throw new Error(`${flag} requires a path`);
    return value;
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--no-near") options.nearDuplicates = false;
    else if (argument === "--allow-incomplete") options.enforceTargets = false;
    else if (argument === "--json") options.json = true;
    else if (argument === "-h" || argument === "--help") options.help = true;
    else if (["--pack-dir", "--out-dir", "--policy", "--baseline"].includes(argument)) {
      const value = path.resolve(process.cwd(), readValue(index, argument));
      if (argument === "--pack-dir") options.packDirectory = value;
      if (argument === "--out-dir") options.outputDirectory = value;
      if (argument === "--policy") options.policyPath = value;
      if (argument === "--baseline") options.baselinePath = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""));
}

function readPacks(directory) {
  if (!fs.existsSync(directory)) throw new Error(`Pack directory does not exist: ${directory}`);
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => ({ filename: entry.name, pack: readJson(path.join(directory, entry.name)) }))
    .sort((left, right) => left.filename < right.filename ? -1 : left.filename > right.filename ? 1 : 0);
}

function removeStaleFiles(outputDirectory, mismatches) {
  const root = path.resolve(outputDirectory);
  const prefix = `${root}${path.sep}`;
  mismatches.filter((item) => item.reason === "stale").forEach((item) => {
    const target = path.resolve(root, item.path);
    if (!target.startsWith(prefix)) throw new Error(`Refusing to remove path outside output directory: ${item.path}`);
    if (fs.existsSync(target) && fs.statSync(target).isFile()) fs.unlinkSync(target);
  });
  if (!fs.existsSync(root)) return;
  const directories = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    directories.push(directory);
    fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => pending.push(path.join(directory, entry.name)));
  }
  directories.sort((left, right) => right.length - left.length).forEach((directory) => {
    if (directory !== root && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  });
}

function summaryFor(build, packFiles, verification = null) {
  return {
    valid: build.valid && verification?.valid !== false,
    buildId: build.lineage ? "promptbrain-phase-8-with-authored-extensions" : "promptbrain-phase-8",
    packs: packFiles.map((item) => item.filename),
    lineage: build.lineage,
    sourceFingerprint: build.sourceFingerprint,
    deltaFingerprint: build.deltaFingerprint,
    effectiveFingerprint: build.effectiveFingerprint,
    delta: build.stats.delta,
    effective: build.stats.effective,
    qualityScore: build.audit.quality.score,
    audit: build.audit.summary,
    baselineRegressions: build.baselineComparison?.regressions || [],
    gateFailures: build.gates.failures,
    errors: build.errors,
    verification
  };
}

function formatSummary(summary, mode, outputDirectory) {
  const lines = [
    "PromptBrain Phase 8 Catalog Build",
    `Build: ${summary.buildId}`,
    `Mode: ${mode}`,
    `Packs: ${summary.packs.length}`,
    `Delta: ${summary.delta.concepts} concepts, ${summary.delta.entities} entities, ${summary.delta.recipes} recipes`,
    `Effective: ${summary.effective.concepts} concepts, ${summary.effective.entities} entities, ${summary.effective.recipes} recipes`,
    `Adult concepts: ${summary.effective.adultConcepts}`,
    `Quality: ${summary.qualityScore}/100`,
    `Diagnostics: ${summary.audit.error} errors, ${summary.audit.warning} warnings, ${summary.audit.info} info`,
    `Output: ${outputDirectory}`,
    `Result: ${summary.valid ? "PASS" : "FAIL"}`
  ];
  if (summary.lineage) {
    lines.splice(4, 0, `Parent: ${summary.lineage.parent.buildId} (${summary.lineage.parent.packIds.length} accepted packs)`);
    lines.splice(5, 0, `Extensions: ${summary.lineage.extensions.packIds.join(", ")}`);
  }
  if (summary.errors.length) lines.push("", "Build errors:", ...summary.errors.slice(0, 100).map((item) => `  - ${item}`));
  if (summary.baselineRegressions.length) lines.push("", "Baseline regressions:", ...summary.baselineRegressions.map((item) => `  - ${item.code}: ${item.baseline} -> ${item.actual}`));
  if (summary.gateFailures.length) lines.push("", "Gate failures:", ...summary.gateFailures.map((item) => `  - ${item.code}: ${item.actual} < ${item.expected}`));
  if (summary.verification && !summary.verification.valid) lines.push("", "Artifact mismatches:", ...summary.verification.mismatches.slice(0, 100).map((item) => `  - ${item.path}: ${item.reason}`));
  return lines.join("\n");
}

function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const packFiles = readPacks(options.packDirectory);
  if (!packFiles.length) throw new Error(`No JSON packs found in ${options.packDirectory}`);
  const policy = readJson(options.policyPath);
  const baseline = readJson(options.baselinePath);
  const build = phase8.buildPhase8Catalog(packFiles.map((item) => item.pack), {
    currentCatalog: knowledge.currentCatalog(),
    policy,
    baseline,
    enforceTargets: options.enforceTargets,
    targets: policy.phase8Targets,
    nearDuplicates: options.nearDuplicates,
    nearDuplicateThreshold: 0.9,
    maxNearDuplicatePairs: 5000000,
    maxNearDuplicateIssues: 10000,
    maxIssues: 100000
  });
  let verification = null;
  if (build.valid) {
    const artifacts = phase8.renderArtifacts(build);
    const integrity = phase8.verifyArtifacts(artifacts);
    if (!integrity.valid) {
      verification = {
        valid: false,
        mismatches: integrity.errors.map((reason) => ({ path: "<rendered-artifacts>", reason }))
      };
    } else if (options.check) {
      verification = phase8.compareArtifacts(options.outputDirectory, artifacts);
    } else {
      phase8.writeArtifacts(options.outputDirectory, artifacts);
      const firstVerification = phase8.compareArtifacts(options.outputDirectory, artifacts);
      removeStaleFiles(options.outputDirectory, firstVerification.mismatches);
      verification = phase8.compareArtifacts(options.outputDirectory, artifacts);
    }
  }
  const summary = summaryFor(build, packFiles, verification);
  process.stdout.write(options.json
    ? `${knowledge.stableStringify(summary, 2)}\n`
    : `${formatSummary(summary, options.check ? "check" : "build", options.outputDirectory)}\n`);
  return summary.valid ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = run();
  } catch (error) {
    process.stderr.write(`Phase 8 build failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = Object.freeze({
  parseArguments,
  readPacks,
  removeStaleFiles,
  summaryFor,
  formatSummary,
  run
});
