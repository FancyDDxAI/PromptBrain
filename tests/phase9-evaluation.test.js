"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const phase9 = require("../tools/run-phase9-evaluation.js");

test("Phase 9 deterministic campaign meets every production gate", { timeout: 10 * 60 * 1000 }, () => {
  const report = phase9.runCampaign();
  assert.ok(
    report.counters.deterministicInvocations >= phase9.MINIMUM_DETERMINISTIC_INVOCATIONS,
    `only ${report.counters.deterministicInvocations} deterministic invocations ran`
  );
  assert.equal(report.coverage.checkpointProfiles.length, 17, "all checkpoint profiles must be exercised");
  assert.deepEqual(report.coverage.contentModes, ["adult", "sfw"]);
  assert.ok(fs.existsSync(phase9.REPORT_PATH), "checked-in Phase 9 JSON report is missing");
  const checkedIn = JSON.parse(fs.readFileSync(phase9.REPORT_PATH, "utf8").replace(/^\uFEFF/, ""));
  assert.equal(
    report.reproducibleDigest,
    checkedIn.reproducibleDigest,
    "checked-in Phase 9 report is stale; run tools/run-phase9-evaluation.js"
  );
  const failures = report.gates.filter((gate) => !gate.passed);
  assert.deepEqual(
    failures.map((gate) => ({ id: gate.id, actual: gate.actual })),
    [],
    `Phase 9 gate failures:\n${failures.map((gate) => `${gate.id}: ${JSON.stringify(gate.actual)}`).join("\n")}`
  );
});
