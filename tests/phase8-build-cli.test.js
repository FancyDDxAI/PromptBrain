"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cli = require("../tools/build-phase8-catalog.js");

function testArgumentParsing() {
  const cwd = process.cwd();
  const options = cli.parseArguments([
    "--check",
    "--no-near",
    "--allow-incomplete",
    "--json",
    "--pack-dir", "packs",
    "--out-dir", "generated",
    "--policy", "policy.json",
    "--baseline", "baseline.json"
  ]);
  assert.equal(options.check, true);
  assert.equal(options.nearDuplicates, false);
  assert.equal(options.enforceTargets, false);
  assert.equal(options.json, true);
  assert.equal(options.packDirectory, path.resolve(cwd, "packs"));
  assert.equal(options.outputDirectory, path.resolve(cwd, "generated"));
  assert.equal(options.policyPath, path.resolve(cwd, "policy.json"));
  assert.equal(options.baselinePath, path.resolve(cwd, "baseline.json"));
  assert.throws(() => cli.parseArguments(["--unknown"]), /Unknown option/);
  assert.throws(() => cli.parseArguments(["--pack-dir"]), /requires a path/);
}

function testPackOrdering() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "promptbrain-packs-"));
  try {
    fs.writeFileSync(path.join(root, "z.json"), JSON.stringify({ schemaVersion: 1, packId: "z" }), "utf8");
    fs.writeFileSync(path.join(root, "a.json"), JSON.stringify({ schemaVersion: 1, packId: "a" }), "utf8");
    fs.writeFileSync(path.join(root, "ignore.txt"), "ignored", "utf8");
    assert.deepEqual(cli.readPacks(root).map((item) => item.filename), ["a.json", "z.json"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testScopedStaleFileRemoval() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "promptbrain-output-"));
  try {
    const nested = path.join(root, "concepts");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(root, "keep.json"), "keep", "utf8");
    fs.writeFileSync(path.join(nested, "stale.json"), "stale", "utf8");
    cli.removeStaleFiles(root, [
      { path: "concepts/stale.json", reason: "stale" },
      { path: "keep.json", reason: "changed" }
    ]);
    assert.equal(fs.existsSync(path.join(nested, "stale.json")), false);
    assert.equal(fs.existsSync(nested), false);
    assert.equal(fs.readFileSync(path.join(root, "keep.json"), "utf8"), "keep");
    assert.throws(() => cli.removeStaleFiles(root, [{ path: "../escape.json", reason: "stale" }]), /outside output directory/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testArgumentParsing();
testPackOrdering();
testScopedStaleFileRemoval();

console.log("Phase 8 build CLI tests passed.");
