"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_DIR = path.join(ROOT, "knowledge", "generated", "phase-8");
const FIXTURE_PATH = path.join(ROOT, "tests", "fixtures", "phase-9-scenarios.json");
const OUTPUT_DIR = path.join(ROOT, "reports", "phase-9");
const REPORT_PATH = path.join(OUTPUT_DIR, "phase-9-report.json");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "phase-9-summary.md");
const MAX_EXAMPLES = 12;
const MINIMUM_DETERMINISTIC_INVOCATIONS = 10000;
const MAX_TOKEN_OVERRUN_RATE = 0.05;
const MAX_HEAP_BYTES = 1024 * 1024 * 1024;

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, ""));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value, spacing = 0) {
  return JSON.stringify(stableValue(value), null, spacing);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))];
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round(Number(value) * scale) / scale;
}

function freshRuntime() {
  const engineDir = path.join(ROOT, "engine");
  ["catalog-store.js", "contracts.js", "seed-knowledge.js", "curated-knowledge.js", "art-director.js", "prompt-engine.js"]
    .forEach((file) => delete require.cache[require.resolve(path.join(engineDir, file))]);
  const store = require(path.join(engineDir, "catalog-store.js"));
  const seed = require(path.join(engineDir, "seed-knowledge.js"));
  const engine = require(path.join(engineDir, "prompt-engine.js"));
  const artDirector = require(path.join(engineDir, "art-director.js"));
  const catalog = store.loadFromDirectory(CATALOG_DIR);
  const registration = store.register(catalog, { engine, artDirector });
  return { store, seed, engine, artDirector, catalog, registration };
}

function collector() {
  const values = [];
  return {
    values,
    push(value) {
      if (values.length < MAX_EXAMPLES) values.push(value);
    }
  };
}

function normalizedContains(engine, text, phrase) {
  const haystack = ` ${engine.normalizeForMatch(text)} `;
  const needle = engine.normalizeForMatch(phrase);
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

function populatedBlocks(plan) {
  return Object.entries(plan.blocks || {}).filter(([, values]) => Array.isArray(values) && values.length > 0).map(([name]) => name);
}

function selectedConceptIds(plan) {
  return new Set((plan.decisions || []).map((decision) => decision.conceptId).filter(Boolean));
}

function promptHead(text, prefix) {
  return String(text).startsWith(prefix.join(", "));
}

function compatibleProfileIds(engine, concept, profiles) {
  return Object.values(profiles)
    .filter((profile) => engine.conceptCompatibility(concept, profile.id).compatible)
    .map((profile) => profile.id);
}

function deterministicProjection(report) {
  return {
    schemaVersion: report.schemaVersion,
    campaignVersion: report.campaignVersion,
    fixtureFingerprint: report.fixtureFingerprint,
    catalog: report.catalog,
    coverage: report.coverage,
    counters: report.counters,
    // The heap gate's pass/fail threshold is useful, but its observed byte count
    // varies with process scheduling and GC. Runtime observations never define
    // report identity; every behavioral gate remains in the digest.
    gates: report.gates.filter((item) => item.id !== "runtime.heap-budget"),
    knownFailures: report.knownFailures
  };
}

function gate(id, label, passed, actual, expected, examples = []) {
  return { id, label, passed: Boolean(passed), actual, expected, examples: examples.slice(0, MAX_EXAMPLES) };
}

function runCampaign() {
  const fixtureText = fs.readFileSync(FIXTURE_PATH, "utf8").replace(/^\uFEFF/, "");
  const fixture = JSON.parse(fixtureText);
  const manifest = readJson(path.join(CATALOG_DIR, "manifest.json"));
  const runtimeStart = performance.now();
  const heapStart = process.memoryUsage().heapUsed;
  const { seed, engine, catalog, registration } = freshRuntime();
  const profiles = seed.CHECKPOINT_PROFILES;
  const profileIds = Object.keys(profiles);
  const conceptById = new Map(engine.ALL_CONCEPTS.map((item) => [item.id, item]));
  const entityById = new Map(engine.ALL_ENTITIES.map((item) => [item.id, item]));
  const adultPrompts = new Map();
  engine.ALL_CONCEPTS.filter((item) => item.contentMode === "adult").forEach((item) => {
    Object.values(item.promptForms || {}).forEach((form) => {
      const key = engine.normalizeForMatch(form);
      if (key) adultPrompts.set(key, item.id);
    });
  });

  const failures = {
    exceptions: collector(),
    determinism: collector(),
    waiHead: collector(),
    ponyHead: collector(),
    fluxSyntax: collector(),
    sfwLeakage: collector(),
    empty: collector(),
    blockCoverage: collector(),
    semantic: collector(),
    conflicts: collector(),
    duplicates: collector(),
    tokenWarnings: collector(),
    tokenOverruns: collector(),
    entities: collector(),
    families: collector(),
    loras: collector(),
    styleTokens: collector(),
    memory: collector()
  };
  const counts = {
    deterministicCases: 0,
    deterministicInvocations: 0,
    totalInvocations: 0,
    exceptions: 0,
    determinismMismatches: 0,
    waiHeadViolations: 0,
    ponyHeadViolations: 0,
    fluxSyntaxViolations: 0,
    sfwAdultLeakages: 0,
    emptyPrompts: 0,
    blockCoverageFailures: 0,
    semanticFailures: 0,
    internalAdultEligibilityFailures: 0,
    conflictFailures: 0,
    duplicateFailures: 0,
    tokenWarningFailures: 0,
    tokenOverruns: 0,
    generatedWarnings: 0
  };
  const durations = [];
  let peakHeap = heapStart;
  const coveredProfiles = new Set();
  const coveredModes = new Set();
  const coveredScenarios = new Set();
  const selectedFamilies = new Set();

  function invoke(request, options) {
    const started = performance.now();
    const result = engine.generate(request, options);
    durations.push(performance.now() - started);
    counts.totalInvocations += 1;
    if (counts.totalInvocations % 100 === 0) peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    return result;
  }

  function inspectResult(result, context, scenario) {
    const { profile, contentMode, seedValue } = context;
    const positive = result.compiled.positive || "";
    const normalized = engine.normalizeForMatch(positive);
    const populated = populatedBlocks(result.plan);
    const warningText = (result.compiled.warnings || []).join(" ");
    const overBudget = result.compiled.estimatedTokens > profile.maxEstimatedTokens;
    const hasBudgetWarning = /exceeds .* target/i.test(warningText);
    counts.generatedWarnings += (result.compiled.warnings || []).length;
    if (result.plan.artRecipe?.familyId) selectedFamilies.add(result.plan.artRecipe.familyId);

    if (!positive.trim()) {
      counts.emptyPrompts += 1;
      failures.empty.push({ ...context, scenario: scenario.id });
    }
    if (profile.id === "waiIllustriousXL" && !promptHead(positive, profile.qualityPrefix)) {
      counts.waiHeadViolations += 1;
      failures.waiHead.push({ scenario: scenario.id, seed: seedValue, head: positive.slice(0, 180) });
    }
    if (profile.base === "Pony" && !promptHead(positive, profile.qualityPrefix)) {
      counts.ponyHeadViolations += 1;
      failures.ponyHead.push({ checkpointId: profile.id, scenario: scenario.id, seed: seedValue, head: positive.slice(0, 180) });
    }
    if (profile.base === "FLUX") {
      const violations = [];
      if (result.compiled.negative) violations.push("negative prompt emitted");
      if (/\<lora\s*:/i.test(positive)) violations.push("LoRA syntax emitted");
      if (/\bBREAK\b/.test(positive)) violations.push("BREAK emitted");
      if (!/[.!?]$/.test(positive)) violations.push("not natural-language punctuation");
      if (violations.length) {
        counts.fluxSyntaxViolations += 1;
        failures.fluxSyntax.push({ scenario: scenario.id, seed: seedValue, violations, prompt: positive.slice(0, 220) });
      }
    }
    if (contentMode === "sfw") {
      Object.values(result.plan.blocks || {}).flat().forEach((text) => {
        const adultId = adultPrompts.get(engine.normalizeForMatch(text));
        if (!adultId) return;
        counts.sfwAdultLeakages += 1;
        failures.sfwLeakage.push({ scenario: scenario.id, seed: seedValue, conceptId: adultId, text });
      });
    }
    const missingBlocks = (scenario.requiredBlocks || []).filter((block) => !(result.plan.blocks?.[block] || []).length);
    if (missingBlocks.length || populated.length < Number(scenario.minPopulatedBlocks || 0)) {
      counts.blockCoverageFailures += 1;
      failures.blockCoverage.push({ checkpointId: profile.id, scenario: scenario.id, seed: seedValue, missingBlocks, populated });
    }
    const missingText = (scenario.requiredText || []).filter((term) => !normalizedContains(engine, positive, term));
    const forbiddenText = (scenario.forbiddenText || []).filter((term) => normalizedContains(engine, positive, term));
    const verifiedAdults = result.plan.participants.filter((participant) => participant.adultVerified === true).length;
    const adultMinimumMiss = Number.isInteger(scenario.minimumAdultParticipants)
      && verifiedAdults < scenario.minimumAdultParticipants;
    const adultMaximumMiss = Number.isInteger(scenario.maximumAdultParticipants)
      && verifiedAdults > scenario.maximumAdultParticipants;
    const adultEligibilityMismatch = adultMinimumMiss || adultMaximumMiss;
    if (adultEligibilityMismatch) counts.internalAdultEligibilityFailures += 1;
    if (missingText.length || forbiddenText.length || adultEligibilityMismatch) {
      counts.semanticFailures += 1;
      failures.semantic.push({
        checkpointId: profile.id,
        scenario: scenario.id,
        seed: seedValue,
        missingText,
        forbiddenText,
        adultEligibility: adultEligibilityMismatch
          ? {
            actual: verifiedAdults,
            minimum: scenario.minimumAdultParticipants ?? null,
            maximum: scenario.maximumAdultParticipants ?? null
          }
          : null,
        prompt: positive.slice(0, 240)
      });
    }
    fixture.semanticConflicts.forEach(([left, right]) => {
      if (normalizedContains(engine, normalized, left) && normalizedContains(engine, normalized, right)) {
        counts.conflictFailures += 1;
        failures.conflicts.push({ checkpointId: profile.id, scenario: scenario.id, seed: seedValue, pair: [left, right] });
      }
    });
    const ids = selectedConceptIds(result.plan);
    ids.forEach((id) => {
      const concept = conceptById.get(id);
      (concept?.conflicts || []).forEach((other) => {
        if (!ids.has(other) || id > other) return;
        counts.conflictFailures += 1;
        failures.conflicts.push({ checkpointId: profile.id, scenario: scenario.id, seed: seedValue, concepts: [id, other] });
      });
    });
    const seen = new Set();
    Object.values(result.plan.blocks || {}).flat().forEach((text) => {
      const key = engine.normalizeForMatch(text);
      if (!key) return;
      if (seen.has(key)) {
        counts.duplicateFailures += 1;
        failures.duplicates.push({ checkpointId: profile.id, scenario: scenario.id, seed: seedValue, text });
      }
      seen.add(key);
    });
    if (overBudget) {
      counts.tokenOverruns += 1;
      failures.tokenOverruns.push({ checkpointId: profile.id, scenario: scenario.id, seed: seedValue, estimated: result.compiled.estimatedTokens, target: profile.maxEstimatedTokens });
    }
    if (overBudget !== hasBudgetWarning) {
      counts.tokenWarningFailures += 1;
      failures.tokenWarnings.push({ checkpointId: profile.id, scenario: scenario.id, seed: seedValue, estimated: result.compiled.estimatedTokens, target: profile.maxEstimatedTokens, warningText });
    }
  }

  fixture.scenarios.forEach((scenario, scenarioIndex) => {
    profileIds.forEach((checkpointId, profileIndex) => {
      const profile = profiles[checkpointId];
      for (let seedIndex = 0; seedIndex < fixture.seedsPerScenario; seedIndex += 1) {
        const seedValue = 900000 + scenarioIndex * 10000 + profileIndex * 100 + seedIndex;
        const options = {
          checkpointId,
          contentMode: scenario.contentMode,
          seed: seedValue,
          includeNegative: true,
          negativePrompt: "low quality, malformed anatomy",
          useBreak: true,
          memoryScores: scenario.id.includes("explicit") ? { "camera.from-below": 100000 } : {}
        };
        const context = { checkpointId, profile, contentMode: scenario.contentMode, seedValue };
        try {
          const first = invoke(scenario.request, options);
          const second = invoke(scenario.request, options);
          counts.deterministicCases += 1;
          counts.deterministicInvocations += 2;
          coveredProfiles.add(checkpointId);
          coveredModes.add(scenario.contentMode);
          coveredScenarios.add(scenario.id);
          if (stableStringify(first) !== stableStringify(second)) {
            counts.determinismMismatches += 1;
            failures.determinism.push({ checkpointId, scenario: scenario.id, seed: seedValue });
          }
          inspectResult(first, context, scenario);
        } catch (error) {
          counts.exceptions += 1;
          failures.exceptions.push({ checkpointId, scenario: scenario.id, seed: seedValue, message: error.message });
        }
      }
    });
  });

  const familyCoverage = { total: catalog.families.length, selected: 0, missing: [] };
  catalog.families.forEach((family, index) => {
    const trigger = family.triggers?.[0];
    if (!trigger) {
      familyCoverage.missing.push({ id: family.id, reason: "no family trigger" });
      return;
    }
    try {
      const options = { checkpointId: "waiIllustriousXL", contentMode: "sfw", seed: 1200000 + index, useBreak: true };
      // Keep the probe neutral. Adding words such as "fantasy" or "portrait" here
      // would legitimately activate a curated family and contaminate the result.
      const first = invoke(`${trigger}, person`, options);
      const second = invoke(`${trigger}, person`, options);
      if (stableStringify(first) !== stableStringify(second)) {
        counts.determinismMismatches += 1;
        failures.determinism.push({ familyId: family.id, probe: "family" });
      }
      if (first.plan.artRecipe?.familyId === family.id) selectedFamilies.add(family.id);
      else familyCoverage.missing.push({ id: family.id, selected: first.plan.artRecipe?.familyId || null, trigger });
    } catch (error) {
      counts.exceptions += 1;
      failures.exceptions.push({ familyId: family.id, probe: "family", message: error.message });
      familyCoverage.missing.push({ id: family.id, reason: error.message });
    }
  });
  familyCoverage.selected = familyCoverage.total - familyCoverage.missing.length;
  familyCoverage.missing.slice(0, MAX_EXAMPLES).forEach((item) => failures.families.push(item));

  const entityCoverage = { total: engine.ALL_ENTITIES.length, sfwResolved: 0, adultAllowed: 0, adultResolved: 0, adultRejected: 0, failures: 0 };
  engine.ALL_ENTITIES.forEach((entity, index) => {
    const alias = entity.aliases?.[0] || entity.name;
    try {
      const sfw = invoke(`${alias} character portrait`, { checkpointId: "waiIllustriousXL", contentMode: "sfw", seed: 1300000 + index });
      if (sfw.intent.entities.some((item) => item.id === entity.id)) entityCoverage.sfwResolved += 1;
      else {
        entityCoverage.failures += 1;
        failures.entities.push({ id: entity.id, mode: "sfw", reason: "entity did not resolve" });
      }
      const adult = invoke(`adult portrait of ${alias}`, { checkpointId: "waiIllustriousXL", contentMode: "adult", seed: 1400000 + index });
      const resolved = adult.intent.entities.some((item) => item.id === entity.id);
      if (entity.adultAllowed === true) {
        entityCoverage.adultAllowed += 1;
        if (resolved) entityCoverage.adultResolved += 1;
        else {
          entityCoverage.failures += 1;
          failures.entities.push({ id: entity.id, mode: "adult", reason: "adultAllowed entity was rejected" });
        }
      } else if (!resolved) entityCoverage.adultRejected += 1;
      else {
        entityCoverage.failures += 1;
        failures.entities.push({ id: entity.id, mode: "adult", reason: "adult-ineligible entity resolved" });
      }
    } catch (error) {
      counts.exceptions += 1;
      entityCoverage.failures += 1;
      failures.exceptions.push({ entityId: entity.id, probe: "entity", message: error.message });
    }
  });

  const installedLoras = catalog.concepts.filter((item) => item.kind === "lora" && (item.traits || []).includes("installed"));
  const loraCoverage = {
    total: installedLoras.length,
    mapped: 0,
    exercised: 0,
    explicitlyIncompatible: [],
    unclassified: [],
    failures: 0
  };
  installedLoras.forEach((lora, index) => {
    const compatible = compatibleProfileIds(engine, lora, profiles);
    if (!compatible.length) {
      const rejections = profileIds.map((checkpointId) => engine.conceptCompatibility(lora, checkpointId));
      if (rejections.every((result) => result.compatible === false && result.reason)) {
        loraCoverage.explicitlyIncompatible.push(lora.id);
      } else {
        loraCoverage.unclassified.push(lora.id);
        failures.loras.push({ id: lora.id, reason: "installation has neither a compatible profile nor an explicit incompatibility decision" });
      }
      return;
    }
    loraCoverage.mapped += 1;
    const checkpointId = compatible[0];
    const form = lora.promptForms?.[checkpointId] || lora.promptForms?.[profiles[checkpointId].base] || lora.promptForms?.default;
    try {
      const result = invoke("artistic character portrait", {
        checkpointId,
        contentMode: lora.contentMode === "adult" ? "adult" : "sfw",
        seed: 1500000 + index,
        loras: [form]
      });
      if (profiles[checkpointId].base !== "FLUX" && result.compiled.positive.includes(form)) loraCoverage.exercised += 1;
      else {
        loraCoverage.failures += 1;
        failures.loras.push({ id: lora.id, checkpointId, reason: "compatible LoRA form was not emitted" });
      }
    } catch (error) {
      counts.exceptions += 1;
      loraCoverage.failures += 1;
      failures.exceptions.push({ loraId: lora.id, probe: "lora", message: error.message });
    }
  });
  const fluxLoraProbe = invoke("artistic character portrait", {
    checkpointId: "fluxDev",
    contentMode: "sfw",
    seed: 1599999,
    loras: ["<lora:must-not-appear:0.7>"],
    useBreak: true,
    includeNegative: true,
    negativePrompt: "must not appear"
  });
  if (/\<lora\s*:/i.test(fluxLoraProbe.compiled.positive) || fluxLoraProbe.compiled.negative || /\bBREAK\b/.test(fluxLoraProbe.compiled.positive)) {
    loraCoverage.failures += 1;
    failures.loras.push({ id: "flux-suppression", reason: "FLUX emitted forbidden LoRA, negative, or BREAK syntax" });
  }

  const styleTokenCoverage = { tokens: fixture.styleTokens.length, profiles: profileIds.length, exercised: 0, failures: 0 };
  profileIds.forEach((checkpointId, index) => {
    const result = invoke("artistic character portrait", {
      checkpointId,
      contentMode: "sfw",
      seed: 1600000 + index,
      styleTokens: fixture.styleTokens
    });
    const missing = fixture.styleTokens.filter((token) => !normalizedContains(engine, result.compiled.positive, token));
    const promoted = fixture.styleTokens.filter((token) => result.compiled.positive.includes(`<lora:${token}`));
    if (!missing.length && !promoted.length) styleTokenCoverage.exercised += 1;
    else {
      styleTokenCoverage.failures += 1;
      failures.styleTokens.push({ checkpointId, missing, incorrectlyPromotedToLora: promoted });
    }
  });

  const memoryCoverage = { influenceObserved: false, explicitPrecedenceObserved: false, failures: 0 };
  try {
    const request = "artistic character portrait";
    const options = { checkpointId: "waiIllustriousXL", contentMode: "sfw", seed: 1700001 };
    const baseline = invoke(request, options);
    const selected = selectedConceptIds(baseline.plan);
    const candidate = engine.ALL_ART_RECIPES.find((recipe) => (
      recipe.id !== baseline.plan.artRecipe?.id
      && recipe.familyId === baseline.plan.artRecipe?.familyId
      && recipe.contentModes.includes("sfw")
      && Object.entries(recipe.ingredients || {}).some(([slot, ids]) => (
        Number(recipe.selectionCounts?.[slot] || 0) >= ids.length
        && ids.some((id) => !selected.has(id))
      ))
    ));
    let target = null;
    if (candidate) {
      Object.entries(candidate.ingredients || {}).some(([slot, ids]) => {
        if (Number(candidate.selectionCounts?.[slot] || 0) < ids.length) return false;
        target = ids.find((id) => !selected.has(id)) || null;
        return Boolean(target);
      });
    }
    if (target) {
      const learned = invoke(request, { ...options, memoryScores: { [target]: 100000 } });
      memoryCoverage.influenceObserved = learned.plan.artRecipe?.id !== baseline.plan.artRecipe?.id
        && selectedConceptIds(learned.plan).has(target);
      memoryCoverage.baselineRecipe = baseline.plan.artRecipe?.id || null;
      memoryCoverage.learnedRecipe = learned.plan.artRecipe?.id || null;
    }
    if (!target || !memoryCoverage.influenceObserved) {
      memoryCoverage.failures += 1;
      failures.memory.push({ probe: "influence", target, reason: "positive memory score did not alter recipe choice" });
    }
    const explicit = invoke("artistic oni woman portrait from above", {
      checkpointId: "waiIllustriousXL",
      contentMode: "sfw",
      seed: 1700002,
      memoryScores: { "camera.from-below": 100000 }
    });
    const explicitText = explicit.compiled.positive;
    memoryCoverage.explicitPrecedenceObserved = normalizedContains(engine, explicitText, "from above")
      && !normalizedContains(engine, explicitText, "from below");
    if (!memoryCoverage.explicitPrecedenceObserved) {
      memoryCoverage.failures += 1;
      failures.memory.push({ probe: "explicit-precedence", prompt: explicitText.slice(0, 240) });
    }
  } catch (error) {
    counts.exceptions += 1;
    memoryCoverage.failures += 1;
    failures.exceptions.push({ probe: "memory", message: error.message });
  }

  peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  const runtimeMs = performance.now() - runtimeStart;
  const deterministicTotal = counts.deterministicCases || 1;
  const overrunRate = counts.tokenOverruns / deterministicTotal;
  const stagingFamilyIds = catalog.families.filter((family) => family.id.startsWith("phase9.staging.")).map((family) => family.id);
  const selectedStagingFamilies = stagingFamilyIds.filter((id) => selectedFamilies.has(id));
  const gates = [
    gate("catalog.full-registration", "Real generated catalog loads and registers exactly", registration.engine?.concepts === manifest.stats.delta.concepts && engine.ALL_CONCEPTS.length === manifest.stats.effective.concepts && engine.ALL_ENTITIES.length === manifest.stats.effective.entities && engine.ALL_ART_RECIPES.length === manifest.stats.effective.recipes, { concepts: engine.ALL_CONCEPTS.length, entities: engine.ALL_ENTITIES.length, recipes: engine.ALL_ART_RECIPES.length }, manifest.stats.effective),
    gate("campaign.minimum-deterministic-invocations", "At least 10,000 seeded deterministic generation invocations", counts.deterministicInvocations >= MINIMUM_DETERMINISTIC_INVOCATIONS, counts.deterministicInvocations, `>= ${MINIMUM_DETERMINISTIC_INVOCATIONS}`),
    gate("campaign.profile-mode-coverage", "All checkpoint profiles and both content modes are covered", coveredProfiles.size === profileIds.length && coveredModes.size === 2, { profiles: coveredProfiles.size, modes: [...coveredModes].sort() }, { profiles: profileIds.length, modes: ["adult", "sfw"] }),
    gate("runtime.no-exceptions", "No generation or probe throws", counts.exceptions === 0, counts.exceptions, 0, failures.exceptions.values),
    gate("determinism.zero-mismatches", "Same request, options, and seed produce byte-identical structured output", counts.determinismMismatches === 0, counts.determinismMismatches, 0, failures.determinism.values),
    gate("syntax.wai-quality-head", "WAI starts with its complete quality/style head", counts.waiHeadViolations === 0, counts.waiHeadViolations, 0, failures.waiHead.values),
    gate("syntax.pony-score-head", "Every Pony profile starts with required score tags", counts.ponyHeadViolations === 0, counts.ponyHeadViolations, 0, failures.ponyHead.values),
    gate("syntax.flux", "FLUX is natural language with no negative, LoRA syntax, or BREAK", counts.fluxSyntaxViolations === 0, counts.fluxSyntaxViolations, 0, failures.fluxSyntax.values),
    gate("safety.sfw-no-adult-leakage", "SFW plans contain no adult catalog prompt forms", counts.sfwAdultLeakages === 0, counts.sfwAdultLeakages, 0, failures.sfwLeakage.values),
    gate("quality.nonempty", "Every campaign prompt is nonempty", counts.emptyPrompts === 0, counts.emptyPrompts, 0, failures.empty.values),
    gate("quality.block-coverage", "Scenario-required semantic blocks are populated", counts.blockCoverageFailures === 0, counts.blockCoverageFailures, 0, failures.blockCoverage.values),
    gate("semantics.regressions", "Named, generic, namespace, internal adult eligibility, cleaned output, and explicit precedence hold", counts.semanticFailures === 0 && counts.internalAdultEligibilityFailures === 0, { failures: counts.semanticFailures, internalAdultEligibilityFailures: counts.internalAdultEligibilityFailures }, { failures: 0, internalAdultEligibilityFailures: 0 }, failures.semantic.values),
    gate("semantics.no-conflicts", "No declared or high-risk lexical conflicts survive", counts.conflictFailures === 0, counts.conflictFailures, 0, failures.conflicts.values),
    gate("semantics.no-duplicates", "No normalized prompt block is emitted twice", counts.duplicateFailures === 0, counts.duplicateFailures, 0, failures.duplicates.values),
    gate("tokens.warning-integrity", "Every token overrun has exactly the expected warning state", counts.tokenWarningFailures === 0, counts.tokenWarningFailures, 0, failures.tokenWarnings.values),
    gate("tokens.overrun-rate", "No more than 5% of campaign prompts exceed checkpoint targets", overrunRate <= MAX_TOKEN_OVERRUN_RATE, round(overrunRate * 100, 3) + "%", `<= ${MAX_TOKEN_OVERRUN_RATE * 100}%`, failures.tokenOverruns.values),
    gate("art-direction.family-coverage", "Every generated artistic/staging family is directly selectable", familyCoverage.missing.length === 0, familyCoverage, { selected: familyCoverage.total, missing: [] }, failures.families.values),
    gate("character-staging.family-coverage", "Every character staging family is selected during the campaign", selectedStagingFamilies.length === stagingFamilyIds.length, { selected: selectedStagingFamilies.length, total: stagingFamilyIds.length, missing: stagingFamilyIds.filter((id) => !selectedFamilies.has(id)) }, { selected: stagingFamilyIds.length, total: stagingFamilyIds.length, missing: [] }),
    gate("entities.mode-eligibility", "Named entities resolve in SFW and adult mode only when adultAllowed", entityCoverage.failures === 0 && entityCoverage.sfwResolved === entityCoverage.total && entityCoverage.adultResolved === entityCoverage.adultAllowed && entityCoverage.adultRejected === entityCoverage.total - entityCoverage.adultAllowed, entityCoverage, { failures: 0, sfwResolved: entityCoverage.total, adultResolved: entityCoverage.adultAllowed, adultRejected: entityCoverage.total - entityCoverage.adultAllowed }, failures.entities.values),
    gate("loras.installed-coverage", "Every installed LoRA either emits on a compatible checkpoint or is explicitly rejected as incompatible", loraCoverage.unclassified.length === 0 && loraCoverage.failures === 0 && loraCoverage.exercised === loraCoverage.mapped && loraCoverage.mapped + loraCoverage.explicitlyIncompatible.length === loraCoverage.total, loraCoverage, { total: loraCoverage.total, mapped: loraCoverage.mapped, exercised: loraCoverage.mapped, explicitlyIncompatible: loraCoverage.explicitlyIncompatible, unclassified: [], failures: 0 }, failures.loras.values),
    gate("style-tokens.prompt-only", "Prompt-only style tokens stay plain and appear on every profile", styleTokenCoverage.failures === 0 && styleTokenCoverage.exercised === profileIds.length, styleTokenCoverage, { tokens: fixture.styleTokens.length, profiles: profileIds.length, exercised: profileIds.length, failures: 0 }, failures.styleTokens.values),
    gate("learning.memory-influence", "Memory scores affect optional selection while explicit intent wins", memoryCoverage.failures === 0 && memoryCoverage.influenceObserved && memoryCoverage.explicitPrecedenceObserved, memoryCoverage, { influenceObserved: true, explicitPrecedenceObserved: true, failures: 0 }, failures.memory.values),
    gate("runtime.heap-budget", "Campaign peak heap stays below 1 GiB", peakHeap < MAX_HEAP_BYTES, peakHeap, `< ${MAX_HEAP_BYTES}`)
  ];
  const knownFailures = gates.filter((item) => !item.passed).map((item) => ({ id: item.id, actual: item.actual, examples: item.examples }));
  const report = {
    schemaVersion: 1,
    campaignVersion: fixture.campaignVersion,
    fixtureFingerprint: sha256(fixtureText),
    catalog: {
      directory: "knowledge/generated/phase-8",
      buildId: manifest.buildId,
      fingerprint: manifest.fingerprint,
      deltaFingerprint: manifest.deltaFingerprint,
      effectiveFingerprint: manifest.effectiveFingerprint,
      manifestFiles: manifest.files.length,
      delta: manifest.stats.delta,
      effective: manifest.stats.effective,
      loadedShards: catalog.shards,
      registered: registration
    },
    coverage: {
      checkpointProfiles: profileIds,
      contentModes: [...coveredModes].sort(),
      scenarios: [...coveredScenarios].sort(),
      artisticFamilies: familyCoverage,
      stagingFamilies: { total: stagingFamilyIds.length, selected: selectedStagingFamilies.length },
      entities: entityCoverage,
      installedLoras: loraCoverage,
      styleTokens: styleTokenCoverage
    },
    counters: {
      ...counts,
      tokenOverrunRate: round(overrunRate, 6),
      gatesPassed: gates.filter((item) => item.passed).length,
      gatesTotal: gates.length
    },
    runtime: {
      elapsedMs: round(runtimeMs),
      meanGenerationMs: round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length), 4),
      p50GenerationMs: round(percentile(durations, 0.5), 4),
      p95GenerationMs: round(percentile(durations, 0.95), 4),
      heapStartBytes: heapStart,
      heapPeakBytes: peakHeap,
      heapEndBytes: process.memoryUsage().heapUsed
    },
    gates,
    knownFailures
  };
  report.reproducibleDigest = sha256(stableStringify(deterministicProjection(report)));
  return report;
}

function markdownSummary(report) {
  const passed = report.gates.filter((item) => item.passed).length;
  const cell = (value) => (typeof value === "object" ? stableStringify(value) : String(value)).replace(/\|/g, "\\|");
  const rows = report.gates.map((item) => `| ${item.passed ? "PASS" : "FAIL"} | \`${item.id}\` | ${cell(item.actual)} | ${cell(item.expected)} |`);
  return [
    "# PromptBrain Phase 9 Evaluation Summary",
    "",
    `- Catalog fingerprint: \`${report.catalog.effectiveFingerprint}\``,
    `- Deterministic invocations: ${report.counters.deterministicInvocations.toLocaleString("en-US")}`,
    `- Total engine invocations: ${report.counters.totalInvocations.toLocaleString("en-US")}`,
    `- Checkpoints: ${report.coverage.checkpointProfiles.length}`,
    `- Modes: ${report.coverage.contentModes.join(", ")}`,
    `- Gates: ${passed}/${report.gates.length} passed`,
    `- Reproducible digest: \`${report.reproducibleDigest}\``,
    `- Runtime: ${(report.runtime.elapsedMs / 1000).toFixed(2)}s, p95 ${report.runtime.p95GenerationMs}ms, peak heap ${(report.runtime.heapPeakBytes / 1024 / 1024).toFixed(1)} MiB`,
    "",
    "| Status | Gate | Actual | Expected |",
    "|---|---|---:|---:|",
    ...rows,
    "",
    "The JSON report contains capped deterministic failure examples for every failed gate. Runtime metrics are observational and are excluded from the reproducible digest."
  ].join("\n") + "\n";
}

function writeReport(report) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${stableStringify(report, 2)}\n`, "utf8");
  fs.writeFileSync(SUMMARY_PATH, markdownSummary(report), "utf8");
}

function checkReport(report) {
  if (!fs.existsSync(REPORT_PATH)) throw new Error(`Checked-in report is missing: ${REPORT_PATH}`);
  const expected = readJson(REPORT_PATH);
  if (expected.reproducibleDigest !== report.reproducibleDigest) {
    throw new Error(`Phase 9 report drift: checked-in ${expected.reproducibleDigest}, current ${report.reproducibleDigest}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  const report = runCampaign();
  if (check) checkReport(report);
  else writeReport(report);
  const passed = report.gates.filter((item) => item.passed).length;
  console.log(`Phase 9: ${passed}/${report.gates.length} gates passed; ${report.counters.deterministicInvocations} deterministic invocations; digest ${report.reproducibleDigest}.`);
  report.knownFailures.forEach((failure) => console.error(`FAIL ${failure.id}: ${stableStringify(failure.actual)}`));
  if (report.knownFailures.length) process.exitCode = 1;
  return report;
}

if (require.main === module) main();

module.exports = Object.freeze({
  ROOT,
  CATALOG_DIR,
  FIXTURE_PATH,
  REPORT_PATH,
  SUMMARY_PATH,
  MINIMUM_DETERMINISTIC_INVOCATIONS,
  deterministicProjection,
  stableStringify,
  runCampaign,
  markdownSummary,
  writeReport,
  checkReport,
  main
});
