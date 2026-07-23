"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const scanner = require("../tools/lora-metadata-scanner.js");

function encodeHeader(header) {
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const padding = (8 - (json.length % 8)) % 8;
  return padding === 0 ? json : Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
}

function writeRawSafetensors(filename, headerBuffer, payload = Buffer.alloc(0)) {
  const prefix = Buffer.alloc(scanner.HEADER_PREFIX_BYTES);
  prefix.writeBigUInt64LE(BigInt(headerBuffer.length));
  const contents = Buffer.concat([prefix, headerBuffer, payload]);
  fs.writeFileSync(filename, contents);
  return contents;
}

function writeFixture(directory, filename, metadata = {}, payload = Buffer.from([1, 2, 3, 4])) {
  const header = {
    __metadata__: metadata,
    "lora_unet_test.lora_down.weight": {
      dtype: "U8",
      shape: [payload.length],
      data_offsets: [0, payload.length]
    }
  };
  const fullPath = path.join(directory, filename);
  return {
    fullPath,
    contents: writeRawSafetensors(fullPath, encodeHeader(header), payload)
  };
}

function testLengthAndHeaderValidation(root) {
  const prefix = Buffer.alloc(scanner.HEADER_PREFIX_BYTES);
  prefix.writeBigUInt64LE(64n);
  assert.equal(scanner.parseHeaderLength(prefix, 72), 64);
  assert.throws(() => scanner.parseHeaderLength(Buffer.alloc(7), 72), /exactly 8 bytes/);
  assert.throws(() => scanner.parseHeaderLength(prefix, 40), /exceeds the 32 bytes available/);

  const malformed = path.join(root, "malformed.safetensors");
  writeRawSafetensors(malformed, Buffer.from("{broken}", "utf8"));
  assert.throws(() => scanner.readSafetensorsHeader(malformed), /not valid JSON/);

  const oversized = path.join(root, "oversized.safetensors");
  const oversizedPrefix = Buffer.alloc(scanner.HEADER_PREFIX_BYTES);
  oversizedPrefix.writeBigUInt64LE(BigInt(scanner.MAX_HEADER_BYTES) + 1n);
  fs.writeFileSync(oversized, Buffer.concat([oversizedPrefix, Buffer.from("{}", "utf8")]));
  assert.throws(() => scanner.readSafetensorsHeader(oversized), /exceeds the 16777216-byte limit/);

  const truncated = path.join(root, "truncated.safetensors");
  const truncatedPrefix = Buffer.alloc(scanner.HEADER_PREFIX_BYTES);
  truncatedPrefix.writeBigUInt64LE(100n);
  fs.writeFileSync(truncated, Buffer.concat([truncatedPrefix, Buffer.from("{}", "utf8")]));
  assert.throws(() => scanner.readSafetensorsHeader(truncated), /exceeds the 2 bytes available/);
}

async function testMetadataExtractionAndStreamingHash(root) {
  const metadata = {
    "modelspec.architecture": "stable-diffusion-xl-v1-base/lora",
    "modelspec.title": "Tiny Illustrious Style",
    "modelspec.trigger_phrase": "[\"tiny style\",\"alternate style\"]",
    ss_base_model_version: "sdxl_base_v1-0",
    ss_sd_model_name: "illustriousXL_v01.safetensors",
    ss_output_name: "tiny_illustrious_style",
    ss_tag_frequency: JSON.stringify({
      "10_images": { "1girl": 4, solo: 2, zeta: 3 },
      "20_images": { "1girl": 5, solo: "2", alpha: 3, ignored: 0 }
    })
  };
  const fixture = writeFixture(root, "metadata.safetensors", metadata, Buffer.from("tensor payload"));
  const withoutHash = await scanner.inspectSafetensorsFile(fixture.fullPath);

  assert.equal(withoutHash.filename, "metadata.safetensors");
  assert.equal(withoutHash.bytes, fixture.contents.length);
  assert.equal(Object.prototype.hasOwnProperty.call(withoutHash, "sha256"), false);
  assert.equal(withoutHash.architecture, "stable-diffusion-xl-v1-base/lora");
  assert.equal(withoutHash.baseModel, "illustriousXL_v01.safetensors");
  assert.equal(withoutHash.baseModelVersion, "sdxl_base_v1-0");
  assert.equal(withoutHash.outputName, "tiny_illustrious_style");
  assert.equal(withoutHash.title, "Tiny Illustrious Style");
  assert.equal(withoutHash.triggerPhrase, "tiny style");
  assert.equal(withoutHash.imageBase, "Illustrious");
  assert.deepEqual(withoutHash.topTrainingTags, {
    "1girl": 9,
    solo: 4,
    alpha: 3,
    zeta: 3
  });

  const parsed = scanner.readSafetensorsHeader(fixture.fullPath);
  assert.equal(parsed.headerLength, encodeHeader(parsed.header).length);
  assert.deepEqual(parsed.metadata, metadata);
  assert.deepEqual(parsed.tensorKeys, ["lora_unet_test.lora_down.weight"]);

  const expectedHash = crypto.createHash("sha256").update(fixture.contents).digest("hex");
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = () => {
    throw new Error("scanner attempted a whole-file read");
  };
  try {
    const withHash = await scanner.inspectSafetensorsFile(fixture.fullPath, { hash: true });
    assert.equal(withHash.sha256, expectedHash);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
}

function testPureExtractionAndClassification() {
  assert.deepEqual(scanner.extractTopTrainingTags({
    first: { beta: 2, alpha: 2 },
    second: { beta: 1, gamma: 3 }
  }, 3), { beta: 3, gamma: 3, alpha: 2 });
  assert.deepEqual(scanner.extractTopTrainingTags("not JSON"), {});

  assert.equal(scanner.classifyImageBase({ ss_base_model_version: "sdxl_base_v1-0" }), "SDXL");
  assert.equal(scanner.classifyImageBase({ ss_base_model_version: "sd_v1-5" }), "SD1.5");
  assert.equal(scanner.classifyImageBase({ ss_sd_model_name: "PonyDiffusion V6 XL" }), "Pony");
  assert.equal(scanner.classifyImageBase({ ss_sd_model_name: "NoobAI XL epsilon" }), "NoobAI");
  assert.equal(scanner.classifyImageBase({ ss_sd_model_name: "Illustrious XL v1" }), "Illustrious");
  assert.equal(scanner.classifyImageBase({}, ["lora_unet_double_blocks_0_img_attn_qkv.lora_A.weight"]), "FLUX");
  assert.equal(scanner.classifyImageBase({ ss_sd_model_name: "Anima v2" }), "Anima");
  assert.equal(scanner.classifyImageBase({}), "unknown");
  assert.equal(scanner.classifyImageBase({
    "modelspec.architecture": "flux/lora",
    ss_base_model_version: "sdxl_base_v1-0"
  }), "unknown");
}

async function testOrderingExclusionAndDeterminism(root) {
  const scanRoot = path.join(root, "ordering");
  fs.mkdirSync(scanRoot);
  writeFixture(scanRoot, "a.safetensors", { ss_output_name: "lower-a" });
  writeFixture(scanRoot, "B.safetensors", { ss_output_name: "upper-b" });
  writeFixture(scanRoot, "skip-me.safetensors", { ss_output_name: "skip" });
  fs.writeFileSync(path.join(scanRoot, "notes.txt"), "not a model", "utf8");

  const options = { exclude: ["skip-*.safetensors"] };
  const first = await scanner.scanDirectory(scanRoot, options);
  const second = await scanner.scanDirectory(scanRoot, options);
  assert.deepEqual(first.map((file) => file.filename), ["B.safetensors", "a.safetensors"]);
  assert.deepEqual(first, second);
  assert.ok(first.every((file) => !Object.prototype.hasOwnProperty.call(file, "sha256")));

  const firstJson = scanner.formatJsonReport(first);
  const secondJson = scanner.formatJsonReport(second);
  assert.equal(firstJson, secondJson);
  assert.deepEqual(JSON.parse(firstJson), { schemaVersion: 1, files: first });
  assert.equal(scanner.isExcluded("folder/skip-me.safetensors", ["skip-*.safetensors"]), true);
  assert.equal(scanner.isExcluded("folder/keep.safetensors", ["**/skip-*.safetensors"]), false);

  const hashed = await scanner.scanDirectory(scanRoot, { hash: true, exclude: options.exclude });
  assert.deepEqual(hashed.map((file) => file.filename), ["B.safetensors", "a.safetensors"]);
  for (const file of hashed) assert.match(file.sha256, /^[a-f0-9]{64}$/);

  await assert.rejects(() => scanner.scanDirectory(path.join(root, "missing")), /Cannot access scan directory/);
  await assert.rejects(() => scanner.scanDirectory(path.join(scanRoot, "notes.txt")), /not a directory/);
}

async function testCliHelpers(root) {
  const scanRoot = path.join(root, "cli");
  fs.mkdirSync(scanRoot);
  writeFixture(scanRoot, "cli.safetensors", { ss_base_model_version: "sdxl_base_v1-0" });

  const parsed = scanner.parseArguments([scanRoot, "--hash", "--json", "--exclude", "draft-*"]);
  assert.equal(parsed.directory, path.resolve(scanRoot));
  assert.equal(parsed.hash, true);
  assert.equal(parsed.json, true);
  assert.deepEqual(parsed.exclude, ["draft-*"]);
  assert.throws(() => scanner.parseArguments([]), /directory is required/);
  assert.throws(() => scanner.parseArguments([scanRoot, "--wat"]), /Unknown option/);
  assert.throws(() => scanner.parseArguments([scanRoot, "--exclude"]), /requires a non-empty pattern/);

  let output = "";
  const exitCode = await scanner.run([scanRoot, "--json"], {
    stdout: { write(chunk) { output += chunk; } }
  });
  assert.equal(exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.files.map((file) => file.filename), ["cli.safetensors"]);
  assert.equal(Object.prototype.hasOwnProperty.call(report.files[0], "sha256"), false);
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lora-metadata-scanner-"));
  try {
    testLengthAndHeaderValidation(root);
    await testMetadataExtractionAndStreamingHash(root);
    testPureExtractionAndClassification();
    await testOrderingExclusionAndDeterminism(root);
    await testCliHelpers(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("LoRA metadata scanner tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
