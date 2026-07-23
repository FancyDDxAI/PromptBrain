"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "tools", "knowledge-cli.js");
const FIXTURES = path.join(ROOT, "tests", "fixtures", "phase-7");
const EXAMPLE_PACK = path.join(ROOT, "knowledge", "packs", "phase-7-example-art-direction.json");
const POLICY = path.join(ROOT, "knowledge", "catalog-policy.json");
const BASELINE = path.join(ROOT, "knowledge", "catalog-baseline.json");

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true
  });
}

const help = run(["help"]);
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /PromptBrain Knowledge CLI/);

const audit = run(["audit", "current", "--policy", POLICY, "--baseline", BASELINE, "--json"]);
assert.equal(audit.status, 0, audit.stderr);
const auditReport = JSON.parse(audit.stdout);
assert.equal(auditReport.valid, true);
assert.equal(auditReport.summary.error, 0);
assert.equal(auditReport.policy.minimums.concepts, 2800);
assert.equal(auditReport.analysis.nearDuplicates.matches, 2);
assert.equal(auditReport.baselineComparison.valid, true);

const validation = run(["validate", EXAMPLE_PACK, "--against", "none", "--no-near", "--json"]);
assert.equal(validation.status, 0, validation.stderr);
assert.equal(JSON.parse(validation.stdout).output.stats.generatedConcepts, 7);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "promptbrain-phase7-cli-"));
try {
  const firstOutput = path.join(tempRoot, "compiled-one.json");
  const secondOutput = path.join(tempRoot, "compiled-two.json");
  const first = run(["compile", EXAMPLE_PACK, "--out", firstOutput, "--no-near"]);
  const second = run(["compile", EXAMPLE_PACK, "--out", secondOutput, "--no-near"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(firstOutput, "utf8"), fs.readFileSync(secondOutput, "utf8"));

  const rejectedOutput = path.join(tempRoot, "must-not-exist.json");
  const rejected = run([
    "compile",
    path.join(FIXTURES, "invalid-pack.json"),
    "--out",
    rejectedOutput,
    "--against",
    "none",
    "--no-near",
    "--json"
  ]);
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.equal(fs.existsSync(rejectedOutput), false);

  const stricterBaseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  stricterBaseline.knownDiagnostics["concept.duplicate-prompt"] = 28;
  const stricterBaselinePath = path.join(tempRoot, "stricter-baseline.json");
  fs.writeFileSync(stricterBaselinePath, JSON.stringify(stricterBaseline), "utf8");
  const regression = run(["audit", "current", "--no-near", "--baseline", stricterBaselinePath, "--json"]);
  assert.equal(regression.status, 1, regression.stderr);
  assert.equal(JSON.parse(regression.stdout).baselineComparison.valid, false);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const diff = run([
  "diff",
  path.join(FIXTURES, "diff-before.json"),
  path.join(FIXTURES, "diff-after.json"),
  "--json"
]);
assert.equal(diff.status, 1, diff.stderr);
assert.deepEqual(JSON.parse(diff.stdout).summary, { added: 1, changed: 1, removed: 1, unchanged: 1 });

const usage = run(["audit", "--against", "none"]);
assert.equal(usage.status, 2);
assert.match(usage.stderr, /not supported by audit/);

console.log("Knowledge CLI Phase 7 tests passed.");
