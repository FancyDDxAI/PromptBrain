#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const HEADER_PREFIX_BYTES = 8;
const MIN_HEADER_BYTES = 2;
const MAX_HEADER_BYTES = 16 * 1024 * 1024;
const MAX_FILE_BYTES = BigInt(Number.MAX_SAFE_INTEGER);
const HASH_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_TOP_TAG_LIMIT = 8;
const MAX_TOP_TAG_LIMIT = 100;

const ARCHITECTURE_KEYS = [
  "modelspec.architecture",
  "modelspec.architecture_name",
  "ss_architecture",
  "architecture"
];
const BASE_MODEL_KEYS = [
  "modelspec.base_model",
  "modelspec.base_model_name",
  "ss_sd_model_name",
  "ss_base_model_name",
  "ss_base_model",
  "base_model"
];
const BASE_VERSION_KEYS = [
  "modelspec.base_model_version",
  "ss_base_model_version",
  "base_model_version"
];
const OUTPUT_NAME_KEYS = ["ss_output_name", "modelspec.name", "output_name"];
const TITLE_KEYS = ["modelspec.title", "ss_title", "title"];
const TRIGGER_KEYS = [
  "modelspec.trigger_phrase",
  "modelspec.trigger_phrases",
  "ss_trigger_phrase",
  "ss_trigger_phrases",
  "trigger_phrase"
];

function compareCodeUnits(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateHeaderCap(maxHeaderBytes) {
  if (!Number.isSafeInteger(maxHeaderBytes) || maxHeaderBytes < MIN_HEADER_BYTES) {
    throw new Error(`Header limit must be an integer between ${MIN_HEADER_BYTES} and ${MAX_HEADER_BYTES} bytes`);
  }
  if (maxHeaderBytes > MAX_HEADER_BYTES) {
    throw new Error(`Header limit cannot exceed the hard cap of ${MAX_HEADER_BYTES} bytes`);
  }
  return maxHeaderBytes;
}

function toFileSizeBigInt(fileBytes) {
  if (typeof fileBytes === "bigint") {
    if (fileBytes < 0n) throw new Error("File size cannot be negative");
    return fileBytes;
  }
  if (!Number.isSafeInteger(fileBytes) || fileBytes < 0) {
    throw new Error("File size must be a non-negative safe integer");
  }
  return BigInt(fileBytes);
}

function parseHeaderLength(prefix, fileBytes, maxHeaderBytes = MAX_HEADER_BYTES) {
  validateHeaderCap(maxHeaderBytes);
  if (!Buffer.isBuffer(prefix) || prefix.length !== HEADER_PREFIX_BYTES) {
    throw new Error(`Safetensors length prefix must be exactly ${HEADER_PREFIX_BYTES} bytes`);
  }

  const headerLength = prefix.readBigUInt64LE(0);
  if (headerLength < BigInt(MIN_HEADER_BYTES)) {
    throw new Error(`Safetensors header length must be at least ${MIN_HEADER_BYTES} bytes`);
  }
  if (headerLength > BigInt(maxHeaderBytes)) {
    throw new Error(`Safetensors header length ${headerLength} exceeds the ${maxHeaderBytes}-byte limit`);
  }

  if (fileBytes !== undefined) {
    const size = toFileSizeBigInt(fileBytes);
    if (size < BigInt(HEADER_PREFIX_BYTES)) {
      throw new Error(`Safetensors file is too small: ${size} bytes`);
    }
    const available = size - BigInt(HEADER_PREFIX_BYTES);
    if (headerLength > available) {
      throw new Error(`Safetensors header length ${headerLength} exceeds the ${available} bytes available in the file`);
    }
  }

  return Number(headerLength);
}

function parseSafetensorsHeader(headerBuffer, label = "safetensors input") {
  if (!Buffer.isBuffer(headerBuffer)) throw new Error("Safetensors header must be a Buffer");
  if (headerBuffer.length < MIN_HEADER_BYTES) {
    throw new Error(`Safetensors header in ${label} is shorter than ${MIN_HEADER_BYTES} bytes`);
  }
  if (headerBuffer.length > MAX_HEADER_BYTES) {
    throw new Error(`Safetensors header in ${label} exceeds the ${MAX_HEADER_BYTES}-byte hard cap`);
  }

  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(headerBuffer);
  } catch (error) {
    throw new Error(`Safetensors header in ${label} is not valid UTF-8: ${error.message}`);
  }

  let header;
  try {
    header = JSON.parse(source);
  } catch (error) {
    throw new Error(`Safetensors header in ${label} is not valid JSON: ${error.message}`);
  }
  if (!isPlainObject(header)) throw new Error(`Safetensors header in ${label} must be a JSON object`);
  if (header.__metadata__ !== undefined && !isPlainObject(header.__metadata__)) {
    throw new Error(`Safetensors __metadata__ in ${label} must be a JSON object`);
  }
  return header;
}

function readExactly(fd, buffer, position, label) {
  let offset = 0;
  while (offset < buffer.length) {
    const bytesRead = fs.readSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (bytesRead === 0) throw new Error(`Unexpected end of file while reading ${label}`);
    offset += bytesRead;
  }
}

function readSafetensorsHeader(filename, options = {}) {
  if (typeof filename !== "string" || filename.trim() === "") {
    throw new Error("Safetensors file path must be a non-empty string");
  }
  const maxHeaderBytes = validateHeaderCap(options.maxHeaderBytes ?? MAX_HEADER_BYTES);
  const resolved = path.resolve(filename);
  let fd;
  try {
    fd = fs.openSync(resolved, "r");
  } catch (error) {
    throw new Error(`Cannot open safetensors file "${resolved}": ${error.message}`);
  }

  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    if (!stat.isFile()) throw new Error(`Safetensors path is not a regular file: ${resolved}`);
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`Safetensors file is too large to report exactly: ${stat.size} bytes`);
    }
    if (stat.size < BigInt(HEADER_PREFIX_BYTES + MIN_HEADER_BYTES)) {
      throw new Error(`Safetensors file is too small: ${stat.size} bytes`);
    }

    const prefix = Buffer.allocUnsafe(HEADER_PREFIX_BYTES);
    readExactly(fd, prefix, 0, `the length prefix from "${resolved}"`);
    const headerLength = parseHeaderLength(prefix, stat.size, maxHeaderBytes);
    const headerBuffer = Buffer.allocUnsafe(headerLength);
    readExactly(fd, headerBuffer, HEADER_PREFIX_BYTES, `the JSON header from "${resolved}"`);
    const header = parseSafetensorsHeader(headerBuffer, `"${resolved}"`);
    const metadata = header.__metadata__ || {};
    const tensorKeys = Object.keys(header)
      .filter((key) => key !== "__metadata__")
      .sort(compareCodeUnits);

    return {
      filename: resolved,
      bytes: Number(stat.size),
      headerLength,
      header,
      metadata,
      tensorKeys
    };
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function metadataValue(metadata, keys) {
  if (!isPlainObject(metadata)) return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      const value = normalizeText(metadata[key]);
      if (value !== null) return value;
    }
  }

  const actualKeys = Object.keys(metadata).sort(compareCodeUnits);
  for (const wanted of keys) {
    const match = actualKeys.find((key) => key.toLowerCase() === wanted.toLowerCase());
    if (match !== undefined) {
      const value = normalizeText(metadata[match]);
      if (value !== null) return value;
    }
  }
  return null;
}

function normalizeTriggerPhrase(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeText(item);
      if (normalized !== null) return normalized;
    }
    return null;
  }

  const normalized = normalizeText(value);
  if (normalized === null) return null;
  if (normalized.startsWith("[") || normalized.startsWith("\"")) {
    try {
      const parsed = JSON.parse(normalized);
      if (parsed !== value) return normalizeTriggerPhrase(parsed);
    } catch {
      // Some trainers store a plain trigger that happens to start with a bracket.
    }
  }
  return normalized;
}

function tagCount(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function parseTagFrequency(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return isPlainObject(value) || Array.isArray(value) ? value : null;
}

function extractTopTrainingTags(tagFrequency, limit = DEFAULT_TOP_TAG_LIMIT) {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_TOP_TAG_LIMIT) {
    throw new Error(`Tag limit must be an integer between 0 and ${MAX_TOP_TAG_LIMIT}`);
  }
  if (limit === 0) return {};

  const parsed = parseTagFrequency(tagFrequency);
  if (parsed === null) return {};
  const totals = new Map();
  const pending = [parsed];

  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const item = current[index];
        if (isPlainObject(item) || Array.isArray(item)) pending.push(item);
      }
      continue;
    }

    const keys = Object.keys(current).sort(compareCodeUnits);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      const value = current[key];
      const count = tagCount(value);
      if (count !== null && key.trim() !== "") {
        totals.set(key, Math.min(Number.MAX_SAFE_INTEGER, (totals.get(key) || 0) + count));
      } else if (isPlainObject(value) || Array.isArray(value)) {
        pending.push(value);
      }
    }
  }

  const ranked = [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || compareCodeUnits(left[0], right[0]))
    .slice(0, limit);
  return Object.fromEntries(ranked);
}

function classificationText(metadata, filename) {
  const core = [
    metadataValue(metadata, ARCHITECTURE_KEYS),
    metadataValue(metadata, BASE_MODEL_KEYS),
    metadataValue(metadata, BASE_VERSION_KEYS),
    normalizeText(metadata.architecture),
    normalizeText(metadata.baseModel),
    normalizeText(metadata.baseModelVersion)
  ].filter(Boolean).join("\n").toLowerCase();
  const hints = [
    core,
    metadataValue(metadata, OUTPUT_NAME_KEYS),
    metadataValue(metadata, TITLE_KEYS),
    normalizeText(metadata.outputName),
    normalizeText(metadata.title),
    normalizeText(filename),
    normalizeText(metadata.filename)
  ].filter(Boolean).join("\n").toLowerCase();
  return { core, hints };
}

function classifyImageBase(metadata = {}, tensorKeys = [], filename = "") {
  if (!isPlainObject(metadata)) throw new Error("Metadata used for image-base classification must be an object");
  if (!Array.isArray(tensorKeys)) throw new Error("Tensor keys used for image-base classification must be an array");

  const { core, hints } = classificationText(metadata, filename);
  const tensorText = tensorKeys.map(String).join("\n").toLowerCase();
  const hasFlux = /(?:^|[^a-z0-9])flux(?:[^a-z0-9]|$)/.test(hints)
    || /(?:^|[._])(?:double_blocks|single_blocks|single_transformer_blocks)(?:[._]|$)/.test(tensorText);
  const hasAnima = /(?:^|[^a-z0-9])anima(?:[^a-z0-9]|$)/.test(hints);
  const hasPony = /(?:^|[^a-z0-9])pony(?:[ ._-]*diffusion)?(?:[^a-z0-9]|$)/.test(hints);
  const hasNoobAI = /(?:^|[^a-z0-9])noob[ ._-]*ai(?:[^a-z0-9]|$)/.test(hints);
  const hasIllustrious = /(?:^|[^a-z0-9])illustrious(?:[^a-z0-9]|$)/.test(hints);
  const hasSdxl = /(?:^|[^a-z0-9])sdxl(?:[^a-z0-9]|$)/.test(core)
    || /stable[ ._-]*diffusion[ ._-]*xl/.test(core)
    || /(?:^|[^a-z0-9])xl[ ._-]*base[ ._-]*v/.test(core)
    || /(?:^|[._])(?:lora_te2|text_encoder_2|conditioner[._]embedders[._]1)(?:[._]|$)/.test(tensorText);
  const hasSd15 = /stable[ ._-]*diffusion[ ._-]*(?:v[ ._-]*)?1(?:[ ._-]*5)?(?:[^0-9]|$)/.test(core)
    || /(?:^|[^a-z0-9])sd[ ._-]*(?:v[ ._-]*)?1(?:[ ._-]*5)?(?:[^a-z0-9]|$)/.test(core)
    || /(?:^|[^a-z0-9])v1[ ._-]*5[ ._-]*pruned(?:[^a-z0-9]|$)/.test(core);

  let ecosystem = null;
  if (hasPony && (hasNoobAI || hasIllustrious)) ecosystem = "conflict";
  else if (hasNoobAI) ecosystem = "NoobAI";
  else if (hasIllustrious) ecosystem = "Illustrious";
  else if (hasPony) ecosystem = "Pony";

  const hasSdFamily = hasSdxl || hasSd15 || ecosystem !== null;
  if (hasFlux && (hasAnima || hasSdFamily)) return "unknown";
  if (hasAnima && (hasSd15 || ecosystem !== null)) return "unknown";
  if (hasSdxl && hasSd15) return "unknown";
  if (ecosystem === "conflict" || (ecosystem && hasSd15)) return "unknown";
  if (hasFlux) return "FLUX";
  if (hasAnima) return "Anima";
  if (ecosystem) return ecosystem;
  if (hasSdxl) return "SDXL";
  if (hasSd15) return "SD1.5";
  return "unknown";
}

function inferredArchitecture(imageBase) {
  if (["SDXL", "Pony", "NoobAI", "Illustrious"].includes(imageBase)) {
    return "stable-diffusion-xl-v1-base/lora";
  }
  if (imageBase === "SD1.5") return "stable-diffusion-v1/lora";
  if (imageBase === "FLUX") return "flux/lora";
  if (imageBase === "Anima") return "anima/lora";
  return null;
}

function metadataFromHeader(headerOrMetadata) {
  if (!isPlainObject(headerOrMetadata)) throw new Error("Safetensors metadata source must be an object");
  if (Object.prototype.hasOwnProperty.call(headerOrMetadata, "__metadata__")) {
    if (!isPlainObject(headerOrMetadata.__metadata__)) throw new Error("Safetensors __metadata__ must be an object");
    return headerOrMetadata.__metadata__;
  }
  return headerOrMetadata;
}

function extractLoraMetadata(headerOrMetadata, options = {}) {
  const metadata = metadataFromHeader(headerOrMetadata);
  const tensorKeys = options.tensorKeys || (headerOrMetadata === metadata
    ? []
    : Object.keys(headerOrMetadata).filter((key) => key !== "__metadata__").sort(compareCodeUnits));
  const imageBase = classifyImageBase(metadata, tensorKeys, options.filename || "");
  const directArchitecture = metadataValue(metadata, ARCHITECTURE_KEYS);
  const triggerValue = TRIGGER_KEYS
    .map((key) => Object.prototype.hasOwnProperty.call(metadata, key) ? metadata[key] : undefined)
    .find((value) => value !== undefined);

  return {
    architecture: directArchitecture || inferredArchitecture(imageBase),
    baseModel: metadataValue(metadata, BASE_MODEL_KEYS),
    baseModelVersion: metadataValue(metadata, BASE_VERSION_KEYS),
    outputName: metadataValue(metadata, OUTPUT_NAME_KEYS),
    title: metadataValue(metadata, TITLE_KEYS),
    triggerPhrase: normalizeTriggerPhrase(triggerValue),
    topTrainingTags: extractTopTrainingTags(metadata.ss_tag_frequency, options.topTagLimit ?? DEFAULT_TOP_TAG_LIMIT),
    imageBase
  };
}

function validateExpectedBytes(expectedBytes) {
  if (expectedBytes === undefined) return null;
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
    throw new Error("Expected hash byte count must be a non-negative safe integer");
  }
  return expectedBytes;
}

function hashFileSha256(filename, options = {}) {
  if (typeof filename !== "string" || filename.trim() === "") {
    return Promise.reject(new Error("File path to hash must be a non-empty string"));
  }
  const expectedBytes = validateExpectedBytes(options.expectedBytes);
  const resolved = path.resolve(filename);

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    let bytesRead = 0;
    const stream = fs.createReadStream(resolved, { highWaterMark: HASH_CHUNK_BYTES });
    stream.on("data", (chunk) => {
      bytesRead += chunk.length;
      hash.update(chunk);
    });
    stream.on("error", (error) => reject(new Error(`Cannot stream "${resolved}" for SHA-256: ${error.message}`)));
    stream.on("end", () => {
      if (expectedBytes !== null && bytesRead !== expectedBytes) {
        reject(new Error(`File size changed while hashing "${resolved}": expected ${expectedBytes} bytes, read ${bytesRead}`));
        return;
      }
      resolve(hash.digest("hex"));
    });
  });
}

async function inspectSafetensorsFile(filename, options = {}) {
  const parsed = readSafetensorsHeader(filename, options);
  const extracted = extractLoraMetadata(parsed.header, {
    filename: options.reportedFilename || path.basename(parsed.filename),
    tensorKeys: parsed.tensorKeys,
    topTagLimit: options.topTagLimit
  });
  const sha256 = options.hash
    ? await hashFileSha256(parsed.filename, { expectedBytes: parsed.bytes })
    : null;

  const record = {
    filename: options.reportedFilename || path.basename(parsed.filename),
    bytes: parsed.bytes
  };
  if (options.hash) record.sha256 = sha256;
  Object.assign(record, extracted);
  return record;
}

function normalizePattern(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new Error("Exclusion patterns must be non-empty strings");
  }
  if (pattern.includes("\0")) throw new Error("Exclusion patterns cannot contain NUL bytes");
  return pattern.replace(/\\/g, "/");
}

function globToRegExp(pattern) {
  const normalized = normalizePattern(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*") {
      if (normalized[index + 1] === "*") {
        index += 1;
        if (normalized[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`, "u");
}

function compileExclusionPatterns(patterns = []) {
  if (typeof patterns === "string") patterns = [patterns];
  if (!Array.isArray(patterns)) throw new Error("Exclusion patterns must be an array or string");
  return patterns.map((pattern) => {
    const normalized = normalizePattern(pattern);
    return {
      pattern: normalized,
      basenameOnly: !normalized.includes("/"),
      expression: globToRegExp(normalized)
    };
  });
}

function isExcluded(relativeFilename, patterns = []) {
  const normalizedFilename = normalizePattern(relativeFilename);
  const basename = normalizedFilename.slice(normalizedFilename.lastIndexOf("/") + 1);
  const compiled = patterns.every((pattern) => pattern && pattern.expression instanceof RegExp)
    ? patterns
    : compileExclusionPatterns(patterns);
  return compiled.some((pattern) => pattern.expression.test(pattern.basenameOnly ? basename : normalizedFilename));
}

function validateDirectory(directory) {
  if (typeof directory !== "string" || directory.trim() === "") {
    throw new Error("Scan directory must be a non-empty path");
  }
  const resolved = path.resolve(directory);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (error) {
    throw new Error(`Cannot access scan directory "${resolved}": ${error.message}`);
  }
  if (!stat.isDirectory()) throw new Error(`Scan path is not a directory: ${resolved}`);
  return resolved;
}

async function scanDirectory(directory, options = {}) {
  const resolved = validateDirectory(directory);
  const exclusions = compileExclusionPatterns(options.exclude || options.exclusions || []);
  let entries;
  try {
    entries = fs.readdirSync(resolved, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot read scan directory "${resolved}": ${error.message}`);
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".safetensors")
    .map((entry) => entry.name)
    .sort(compareCodeUnits)
    .filter((filename) => !isExcluded(filename, exclusions));
  const records = [];
  for (const filename of filenames) {
    records.push(await inspectSafetensorsFile(path.join(resolved, filename), {
      hash: Boolean(options.hash),
      maxHeaderBytes: options.maxHeaderBytes,
      topTagLimit: options.topTagLimit,
      reportedFilename: filename
    }));
  }
  return records;
}

function createReport(files) {
  if (!Array.isArray(files)) throw new Error("Report files must be an array");
  return {
    schemaVersion: 1,
    files: [...files].sort((left, right) => compareCodeUnits(left.filename, right.filename))
  };
}

function formatJsonReport(files) {
  return JSON.stringify(createReport(files), null, 2);
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "unknown" : String(value);
}

function formatReport(files) {
  const report = createReport(files);
  const lines = ["Safetensors LoRA report", `Files: ${report.files.length}`];
  for (const file of report.files) {
    lines.push(
      "",
      file.filename,
      `  Bytes: ${file.bytes}`
    );
    if (Object.prototype.hasOwnProperty.call(file, "sha256")) lines.push(`  SHA-256: ${file.sha256}`);
    lines.push(
      `  Image base: ${displayValue(file.imageBase)}`,
      `  Architecture: ${displayValue(file.architecture)}`,
      `  Base model: ${displayValue(file.baseModel)}`,
      `  Base model version: ${displayValue(file.baseModelVersion)}`,
      `  Output name: ${displayValue(file.outputName)}`,
      `  Title: ${displayValue(file.title)}`,
      `  Trigger phrase: ${displayValue(file.triggerPhrase)}`,
      `  Top training tags: ${JSON.stringify(file.topTrainingTags || {})}`
    );
  }
  return lines.join("\n");
}

function usage() {
  return [
    "Safetensors LoRA metadata scanner",
    "",
    "Usage:",
    "  node tools/lora-metadata-scanner.js <dir> [--hash] [--json] [--exclude pattern]",
    "",
    "Options:",
    "  --hash                 Stream each complete file through SHA-256",
    "  --json                 Print deterministic machine-readable JSON",
    "  --exclude <pattern>    Exclude a filename using case-sensitive *, ?, or ** globs",
    "  -h, --help             Show this help"
  ].join("\n");
}

function parseArguments(argv, cwd = process.cwd()) {
  if (!Array.isArray(argv)) throw new Error("CLI arguments must be an array");
  const options = { directory: null, hash: false, json: false, exclude: [], help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--hash") options.hash = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "-h" || argument === "--help") options.help = true;
    else if (argument === "--exclude") {
      const pattern = argv[index + 1];
      if (pattern === undefined || pattern === "") throw new Error("--exclude requires a non-empty pattern");
      options.exclude.push(pattern);
      index += 1;
    } else if (typeof argument === "string" && argument.startsWith("--exclude=")) {
      const pattern = argument.slice("--exclude=".length);
      if (!pattern) throw new Error("--exclude requires a non-empty pattern");
      options.exclude.push(pattern);
    } else if (typeof argument === "string" && argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (options.directory === null) {
      if (typeof argument !== "string" || argument.trim() === "") throw new Error("Scan directory must be a non-empty path");
      options.directory = path.resolve(cwd, argument);
    } else {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }
  }

  if (!options.help && options.directory === null) throw new Error("A scan directory is required");
  compileExclusionPatterns(options.exclude);
  return options;
}

async function run(argv = process.argv.slice(2), streams = process) {
  const options = parseArguments(argv);
  if (options.help) {
    streams.stdout.write(`${usage()}\n`);
    return 0;
  }
  const files = await scanDirectory(options.directory, options);
  streams.stdout.write(`${options.json ? formatJsonReport(files) : formatReport(files)}\n`);
  return 0;
}

if (require.main === module) {
  run().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`LoRA metadata scan failed: ${error.message}\n`);
    process.exitCode = 2;
  });
}

module.exports = Object.freeze({
  HEADER_PREFIX_BYTES,
  MIN_HEADER_BYTES,
  MAX_HEADER_BYTES,
  MAX_FILE_BYTES,
  HASH_CHUNK_BYTES,
  DEFAULT_TOP_TAG_LIMIT,
  compareCodeUnits,
  parseHeaderLength,
  parseSafetensorsHeader,
  readSafetensorsHeader,
  parseTagFrequency,
  extractTopTrainingTags,
  classifyImageBase,
  extractLoraMetadata,
  hashFileSha256,
  inspectSafetensorsFile,
  globToRegExp,
  compileExclusionPatterns,
  isExcluded,
  scanDirectory,
  createReport,
  formatJsonReport,
  formatReport,
  usage,
  parseArguments,
  run
});
