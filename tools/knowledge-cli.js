#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const toolchain = require("./knowledge-toolchain.js");

const EXIT_SUCCESS = 0;
const EXIT_FINDINGS = 1;
const EXIT_USAGE_OR_IO = 2;

const COMMANDS = Object.freeze(["audit", "coverage", "validate", "compile", "diff", "help"]);
const USAGE = `PromptBrain Knowledge CLI

Usage:
  knowledge-cli audit [target=current] [options]
  knowledge-cli coverage [target=current] [options]
  knowledge-cli validate <pack.json> [options]
  knowledge-cli compile <pack.json> --out <json> [options]
  knowledge-cli diff <before|current> <after|current> [options]
  knowledge-cli help [command]

Options:
  --json                  Emit a structured JSON report.
  --out <json>            Write the compiled pack to this JSON file.
  --no-near               Skip near-duplicate analysis.
  --near-threshold <n>    Set near-duplicate similarity (0.5 through 0.99).
  --policy <json>         Apply a coverage policy during audit.
  --baseline <json>       Fail audit when tracked diagnostics regress.
  --fail-on-warning       Return exit code 1 when warnings are found.
  --against <current|none>
                          Validate packs against the current catalog or alone.
  -h, --help              Show help.

Targets are JSON catalog files or the literal "current".
Exit codes: 0 success, 1 domain findings, 2 usage or I/O failure.`;

const HELP_DATA = Object.freeze({
  name: "knowledge-cli",
  commands: Object.freeze([
    Object.freeze({ name: "audit", usage: "audit [target=current]" }),
    Object.freeze({ name: "coverage", usage: "coverage [target=current]" }),
    Object.freeze({ name: "validate", usage: "validate <pack.json>" }),
    Object.freeze({ name: "compile", usage: "compile <pack.json> --out <json>" }),
    Object.freeze({ name: "diff", usage: "diff <before|current> <after|current>" }),
    Object.freeze({ name: "help", usage: "help [command]" })
  ]),
  options: Object.freeze({
    json: "Emit a structured JSON report",
    out: "Write the compiled pack to a JSON file",
    noNear: "Skip near-duplicate analysis",
    nearThreshold: "Set near-duplicate similarity from 0.5 through 0.99",
    policy: "Apply a coverage policy during audit",
    baseline: "Compare audit diagnostics with a saved baseline",
    failOnWarning: "Return exit code 1 when warnings are found",
    against: "Validate against the current catalog or no catalog"
  }),
  exitCodes: Object.freeze({
    0: "success",
    1: "domain findings",
    2: "usage or I/O failure"
  })
});

const ALLOWED_OPTIONS = Object.freeze({
  audit: new Set(["json", "noNear", "nearThreshold", "policy", "baseline", "failOnWarning"]),
  coverage: new Set(["json"]),
  validate: new Set(["json", "noNear", "nearThreshold", "failOnWarning", "against"]),
  compile: new Set(["json", "out", "noNear", "nearThreshold", "failOnWarning", "against"]),
  diff: new Set(["json"]),
  help: new Set(["json"])
});

class CliError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

function usageError(message) {
  return new CliError("usage", message);
}

function optionValue(args, index, option) {
  const rawValue = args[index + 1];
  if (rawValue === undefined) throw usageError(`${option} requires a value`);
  const value = String(rawValue);
  if (value === "--" || value.startsWith("--")) {
    throw usageError(`${option} requires a value`);
  }
  return value;
}

function setOnce(options, key, value, option) {
  if (options[key] !== undefined) throw usageError(`${option} may only be specified once`);
  options[key] = value;
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw usageError("Arguments must be supplied as an array");
  const args = [...argv];
  const options = {
    json: false,
    noNear: false,
    failOnWarning: false,
    help: false,
    out: undefined,
    nearThreshold: undefined,
    against: undefined,
    policy: undefined,
    baseline: undefined
  };
  const supplied = new Set();
  const positionals = [];
  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = String(args[index]);
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
      continue;
    }
    if (optionsEnded || !argument.startsWith("-") || argument === "-") {
      positionals.push(argument);
      continue;
    }

    if (argument === "--json") {
      options.json = true;
      supplied.add("json");
    } else if (argument === "--no-near") {
      options.noNear = true;
      supplied.add("noNear");
    } else if (argument === "--fail-on-warning") {
      options.failOnWarning = true;
      supplied.add("failOnWarning");
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--out") {
      const value = optionValue(args, index, "--out");
      setOnce(options, "out", value, "--out");
      supplied.add("out");
      index += 1;
    } else if (argument.startsWith("--out=")) {
      const value = argument.slice("--out=".length);
      if (!value) throw usageError("--out requires a value");
      setOnce(options, "out", value, "--out");
      supplied.add("out");
    } else if (argument === "--near-threshold") {
      const value = optionValue(args, index, "--near-threshold");
      setOnce(options, "nearThreshold", value, "--near-threshold");
      supplied.add("nearThreshold");
      index += 1;
    } else if (argument.startsWith("--near-threshold=")) {
      const value = argument.slice("--near-threshold=".length);
      if (!value) throw usageError("--near-threshold requires a value");
      setOnce(options, "nearThreshold", value, "--near-threshold");
      supplied.add("nearThreshold");
    } else if (argument === "--against") {
      const value = optionValue(args, index, "--against");
      setOnce(options, "against", value, "--against");
      supplied.add("against");
      index += 1;
    } else if (argument === "--policy") {
      const value = optionValue(args, index, "--policy");
      setOnce(options, "policy", value, "--policy");
      supplied.add("policy");
      index += 1;
    } else if (argument.startsWith("--policy=")) {
      const value = argument.slice("--policy=".length);
      if (!value) throw usageError("--policy requires a value");
      setOnce(options, "policy", value, "--policy");
      supplied.add("policy");
    } else if (argument === "--baseline") {
      const value = optionValue(args, index, "--baseline");
      setOnce(options, "baseline", value, "--baseline");
      supplied.add("baseline");
      index += 1;
    } else if (argument.startsWith("--baseline=")) {
      const value = argument.slice("--baseline=".length);
      if (!value) throw usageError("--baseline requires a value");
      setOnce(options, "baseline", value, "--baseline");
      supplied.add("baseline");
    } else if (argument.startsWith("--against=")) {
      const value = argument.slice("--against=".length);
      if (!value) throw usageError("--against requires a value");
      setOnce(options, "against", value, "--against");
      supplied.add("against");
    } else {
      throw usageError(`Unknown option: ${argument}`);
    }
  }

  if (options.nearThreshold !== undefined) {
    const threshold = Number(options.nearThreshold);
    if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 0.99) {
      throw usageError("--near-threshold must be a number from 0.5 through 0.99");
    }
    options.nearThreshold = threshold;
  }
  if (options.against !== undefined && options.against !== "current" && options.against !== "none") {
    throw usageError("--against must be either current or none");
  }

  return { positionals, options, supplied };
}

function validateOptions(command, supplied) {
  const allowed = ALLOWED_OPTIONS[command];
  for (const option of supplied) {
    if (!allowed.has(option)) throw usageError(`--${option.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is not supported by ${command}`);
  }
}

function absolutePath(filename, cwd) {
  return path.resolve(cwd, filename);
}

function readJsonFile(filename, cwd) {
  const resolved = absolutePath(filename, cwd);
  let source;
  try {
    source = fs.readFileSync(resolved, "utf8");
  } catch (error) {
    throw new CliError("read-failed", `Could not read JSON file "${resolved}": ${error.message}`, { path: resolved });
  }
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new CliError("invalid-json", `Could not parse JSON file "${resolved}": ${error.message}`, { path: resolved });
  }
}

function readCatalog(target, cwd) {
  return target === "current" ? toolchain.currentCatalog() : readJsonFile(target, cwd);
}

function stringifyJson(value) {
  return `${toolchain.stableStringify(value, 2)}\n`;
}

function writeJsonFile(filename, value, cwd) {
  const resolved = absolutePath(filename, cwd);
  try {
    fs.writeFileSync(resolved, stringifyJson(value), "utf8");
  } catch (error) {
    throw new CliError("write-failed", `Could not write JSON file "${resolved}": ${error.message}`, { path: resolved });
  }
  return resolved;
}

function write(stream, value) {
  stream.write(String(value));
}

function emitReport(io, options, report, formatted) {
  write(io.stdout, options.json ? stringifyJson(report) : `${formatted}\n`);
}

function formatDiffReport(report) {
  const lines = [
    "PromptBrain Knowledge Diff",
    `Before: ${report.beforeFingerprint}`,
    `After: ${report.afterFingerprint}`,
    `Changes: ${report.summary.added} added, ${report.summary.removed} removed, ${report.summary.changed} changed, ${report.summary.unchanged} unchanged`
  ];
  for (const [name, collection] of Object.entries(report.collections)) {
    if (!collection.added.length && !collection.removed.length && !collection.changed.length) continue;
    lines.push("", `${name}:`);
    collection.added.forEach((id) => lines.push(`  + ${id}`));
    collection.removed.forEach((id) => lines.push(`  - ${id}`));
    collection.changed.forEach((item) => lines.push(`  ~ ${item.id} (${item.fields.join(", ")})`));
  }
  return lines.join("\n");
}

function generatedIssue(issue, generatedIds) {
  return generatedIds.has(issue.id) || (issue.relatedIds || []).some((id) => generatedIds.has(id));
}

function compilePack(pack, options) {
  const existingCatalog = options.against === "none" ? false : toolchain.currentCatalog();
  const needsThresholdAudit = options.nearThreshold !== undefined && !options.noNear;
  const result = toolchain.compilePack(pack, {
    existingCatalog,
    nearDuplicates: needsThresholdAudit ? false : !options.noNear
  });

  // compilePack currently controls whether near matching runs but not its threshold.
  // Re-audit only when a custom threshold was requested, preserving its result shape.
  if (!needsThresholdAudit) return result;
  const existing = existingCatalog === false ? toolchain.normalizeCatalog({}) : toolchain.normalizeCatalog(existingCatalog);
  const combined = toolchain.normalizeCatalog({
    schemaVersion: existing.schemaVersion,
    checkpoints: existing.checkpoints,
    entities: existing.entities,
    concepts: [...existing.concepts, ...result.output.concepts],
    recipes: existing.recipes
  });
  const audit = toolchain.auditCatalog(combined, {
    applyPolicy: false,
    nearDuplicates: true,
    nearDuplicateThreshold: options.nearThreshold
  });
  const generatedIds = new Set(result.output.concepts.map((concept) => concept.id));
  return {
    ...result,
    audit: {
      summary: audit.summary,
      issues: audit.issues.filter((issue) => generatedIssue(issue, generatedIds))
    }
  };
}

function packWarnings(result) {
  return result.audit.issues.filter((issue) => issue.severity === "warning");
}

function formatPackReport(result, heading, outputPath) {
  const warnings = packWarnings(result);
  const infoCount = result.audit.issues.filter((issue) => issue.severity === "info").length;
  const lines = [
    `PromptBrain Knowledge Pack ${heading}`,
    `Pack: ${result.output.packId || "(invalid)"}`,
    `Generated concepts: ${result.output.stats.generatedConcepts}`,
    `Diagnostics: ${result.errors.length} errors, ${warnings.length} warnings, ${infoCount} info`,
    `Status: ${result.valid ? "valid" : "invalid"}`
  ];
  if (outputPath) lines.push(`Output: ${outputPath}`);
  if (result.errors.length) {
    lines.push("", "Errors:");
    result.errors.forEach((message) => lines.push(`  - ${message}`));
  }
  if (warnings.length) {
    lines.push("", "Warnings:");
    warnings.forEach((issue) => lines.push(`  - ${issue.code}: ${issue.message}`));
  }
  return lines.join("\n");
}

function commandAudit(args, options, io) {
  if (args.length > 1) throw usageError("audit accepts at most one target");
  const catalog = readCatalog(args[0] || "current", io.cwd);
  let report = toolchain.auditCatalog(catalog, {
    nearDuplicates: !options.noNear,
    nearDuplicateThreshold: options.nearThreshold,
    policy: options.policy ? readJsonFile(options.policy, io.cwd) : undefined
  });
  if (options.baseline) {
    report = {
      ...report,
      baselineComparison: toolchain.compareAuditToBaseline(report, readJsonFile(options.baseline, io.cwd))
    };
  }
  emitReport(io, options, report, toolchain.formatAuditReport(report));
  return !report.valid || report.baselineComparison?.valid === false || (options.failOnWarning && report.summary.warning > 0)
    ? EXIT_FINDINGS
    : EXIT_SUCCESS;
}

function commandCoverage(args, options, io) {
  if (args.length > 1) throw usageError("coverage accepts at most one target");
  const report = toolchain.buildCoverageReport(readCatalog(args[0] || "current", io.cwd));
  emitReport(io, options, report, toolchain.formatCoverageReport(report));
  return EXIT_SUCCESS;
}

function commandValidate(args, options, io) {
  if (args.length !== 1) throw usageError("validate requires exactly one pack JSON file");
  const result = compilePack(readJsonFile(args[0], io.cwd), options);
  emitReport(io, options, result, formatPackReport(result, "Validation"));
  return !result.valid || (options.failOnWarning && packWarnings(result).length > 0) ? EXIT_FINDINGS : EXIT_SUCCESS;
}

function commandCompile(args, options, io) {
  if (args.length !== 1) throw usageError("compile requires exactly one pack JSON file");
  if (!options.out) throw usageError("compile requires --out <json>");
  const result = compilePack(readJsonFile(args[0], io.cwd), options);
  const hasFindings = !result.valid || (options.failOnWarning && packWarnings(result).length > 0);
  const outputPath = hasFindings ? undefined : writeJsonFile(options.out, result.output, io.cwd);
  emitReport(io, options, result, formatPackReport(result, "Compilation", outputPath));
  return hasFindings ? EXIT_FINDINGS : EXIT_SUCCESS;
}

function commandDiff(args, options, io) {
  if (args.length !== 2) throw usageError("diff requires exactly two catalog targets");
  const report = toolchain.diffCatalog(readCatalog(args[0], io.cwd), readCatalog(args[1], io.cwd));
  emitReport(io, options, report, formatDiffReport(report));
  const findings = report.summary.added + report.summary.removed + report.summary.changed;
  return findings > 0 ? EXIT_FINDINGS : EXIT_SUCCESS;
}

function commandHelp(args, options, io) {
  if (args.length > 1) throw usageError("help accepts at most one command name");
  if (args[0] && !COMMANDS.includes(args[0])) throw usageError(`Unknown command: ${args[0]}`);
  emitReport(io, options, HELP_DATA, USAGE);
  return EXIT_SUCCESS;
}

function execute(argv, io) {
  const parsed = parseArguments(argv);
  const [requestedCommand, ...args] = parsed.positionals;
  const options = {
    ...parsed.options,
    against: parsed.options.against || "current"
  };

  if (!requestedCommand) {
    validateOptions("help", parsed.supplied);
    if (!parsed.options.help) throw usageError("A command is required");
    return commandHelp([], options, io);
  }
  if (!COMMANDS.includes(requestedCommand)) throw usageError(`Unknown command: ${requestedCommand}`);
  validateOptions(requestedCommand, parsed.supplied);
  if (parsed.options.help) return commandHelp(requestedCommand === "help" ? args : [requestedCommand], options, io);

  const command = requestedCommand;
  switch (command) {
    case "audit": return commandAudit(args, options, io);
    case "coverage": return commandCoverage(args, options, io);
    case "validate": return commandValidate(args, options, io);
    case "compile": return commandCompile(args, options, io);
    case "diff": return commandDiff(args, options, io);
    case "help": return commandHelp(args, options, io);
    default: throw usageError(`Unknown command: ${command}`);
  }
}

function wantsJson(argv) {
  return Array.isArray(argv) && argv.some((argument) => argument === "--json");
}

function errorReport(error) {
  return {
    schemaVersion: toolchain.TOOLCHAIN_SCHEMA_VERSION,
    ok: false,
    error: {
      code: error instanceof CliError ? error.code : "unexpected",
      message: error instanceof Error ? error.message : String(error),
      details: error instanceof CliError ? error.details : {}
    }
  };
}

function main(argv = process.argv.slice(2), overrides = {}) {
  const io = {
    cwd: overrides.cwd || process.cwd(),
    stdout: overrides.stdout || process.stdout,
    stderr: overrides.stderr || process.stderr
  };
  try {
    return execute(argv, io);
  } catch (error) {
    if (wantsJson(argv)) {
      write(io.stderr, stringifyJson(errorReport(error)));
    } else {
      write(io.stderr, `Error: ${error instanceof Error ? error.message : String(error)}\n`);
      if (error instanceof CliError && error.code === "usage") write(io.stderr, `\n${USAGE}\n`);
    }
    return EXIT_USAGE_OR_IO;
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = Object.freeze({
  EXIT_SUCCESS,
  EXIT_FINDINGS,
  EXIT_USAGE_OR_IO,
  parseArguments,
  main
});
