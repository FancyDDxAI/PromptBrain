"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const contracts = require("../engine/contracts.js");
const knowledge = require("./knowledge-toolchain.js");

const BUILD_SCHEMA_VERSION = 1;
const PACK_TYPES = Object.freeze(["concepts", "entities", "recipes"]);
const ACCEPTED_PHASE8_BASELINE = Object.freeze({
  buildId: "promptbrain-phase-8",
  packIds: Object.freeze([
    "phase8.adult-fantasy",
    "phase8.anime-entities",
    "phase8.art-recipes",
    "phase8.character-performance",
    "phase8.installed-loras",
    "phase8.scene-craft",
    "phase8.visual-language",
    "phase8.wardrobe"
  ]),
  fingerprints: Object.freeze({
    manifest: "e8aa6a9c66ca30ba65a2d602a197f5b352323eff8d66afd3f8e0cde6b4f5c795",
    source: "1cbacd5911cea7d63a3088a3e86191195a9ef40736b5c66b8131d2d03905d0b5",
    delta: "b447cdb13a7435223820a143605f08b27994f2f2d4bdd4b8e191cd52c568c1aa",
    effective: "770bb07be0a4659fd316e6f60fb12f2453fe6141127028a62e7864c2288b11db"
  })
});
const BLOCKING_BASELINE_CODES = Object.freeze([
  "concept.duplicate-prompt",
  "concept.alias-collision",
  "concept.alias-cross-kind",
  "concept.cross-kind-prompt",
  "recipe.alias-cross-family",
  "entity.alias-collision",
  "entity.concept-alias-collision",
  "checkpoint.duplicate-name"
]);
const STRICT_GENERATED_CODES = Object.freeze(new Set([
  "catalog.cross-type-id-collision",
  "concept.alias-collision",
  "concept.alias-cross-kind",
  "concept.cross-kind-prompt",
  "concept.duplicate-prompt",
  "entity.alias-collision",
  "entity.concept-alias-collision",
  "recipe.alias-cross-family",
  "recipe.alias-same-family"
]));

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  asArray(values).forEach((value) => {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    output.push(text);
  });
  return output;
}

function increment(target, key, amount = 1) {
  const name = String(key || "unknown");
  target[name] = (target[name] || 0) + amount;
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => compareCodeUnits(left, right)));
}

function compareCodeUnits(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function stableId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

function rawSha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function classifyPack(pack) {
  const type = String(pack?.packType || "concepts");
  return PACK_TYPES.includes(type) ? type : "unknown";
}

function validatePackHeader(pack, expectedType, errors) {
  const label = String(pack?.packId || "<missing>");
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    errors.push(`${expectedType} pack must be an object`);
    return;
  }
  if (pack.schemaVersion !== 1) errors.push(`${label} schemaVersion must equal 1`);
  if (!stableId(pack.packId)) errors.push(`${label} packId must be a stable lowercase identifier`);
  if (classifyPack(pack) !== expectedType) errors.push(`${label} packType must equal ${expectedType}`);
}

function normalizeAdultVerification(raw) {
  const source = raw?.adultVerification || raw?.adult || {};
  return {
    status: String(source.status || "unknown"),
    evidenceRefs: uniqueStrings(source.evidenceRefs),
    reviewedBy: uniqueStrings(source.reviewedBy)
  };
}

function verifiedAdultEntity(raw) {
  const verification = normalizeAdultVerification(raw);
  return raw?.adultAllowed === true
    && verification.status === "verified-adult"
    && verification.evidenceRefs.length > 0
    && verification.reviewedBy.length >= 2;
}

function compileConceptPacks(packs, existingCatalog, options = {}) {
  const errors = [];
  const compiledPacks = [];
  const concepts = [];
  const current = knowledge.normalizeCatalog(existingCatalog);
  [...packs].sort((a, b) => compareCodeUnits(a?.packId, b?.packId)).forEach((pack) => {
    validatePackHeader({ packType: "concepts", ...pack }, "concepts", errors);
    const result = knowledge.compilePack(pack, {
      existingCatalog: current,
      nearDuplicates: false,
      maxPackConcepts: options.maxConceptsPerPack || 50000,
      maxMatrixCombinations: options.maxMatrixCombinations || 5000,
      maxIssues: options.maxIssues || 20000
    });
    const immediateErrors = result.errors.filter((message) => !(
      message.startsWith("concept.dangling-requirement:")
      || message.startsWith("concept.dangling-conflict:")
    ));
    errors.push(...immediateErrors.map((message) => `${pack.packId}: ${message}`));
    concepts.push(...result.output.concepts);
    compiledPacks.push({
      packId: pack.packId,
      packType: "concepts",
      sourceFingerprint: knowledge.fingerprint(pack),
      outputFingerprint: result.output.fingerprint,
      concepts: result.output.concepts.length,
      valid: immediateErrors.length === 0
    });
  });
  concepts.sort((a, b) => compareCodeUnits(a.id, b.id));
  const effective = knowledge.normalizeCatalog({
    ...current,
    concepts: [...current.concepts, ...concepts]
  });
  const audit = knowledge.auditCatalog(effective, {
    nearDuplicates: false,
    applyPolicy: false,
    maxIssues: options.maxIssues || 30000
  });
  const generatedIds = new Set(concepts.map((item) => item.id));
  audit.issues.filter((issue) => (
    issue.severity === "error" || STRICT_GENERATED_CODES.has(issue.code)
  ) && (
    generatedIds.has(issue.id) || issue.relatedIds.some((id) => generatedIds.has(id))
  )).forEach((issue) => errors.push(`${issue.code}: ${issue.message}`));
  return { valid: errors.length === 0, errors: uniqueStrings(errors), concepts, effectiveCatalog: effective, packs: compiledPacks };
}

function createEntity(raw, group, pack) {
  const namespace = String(raw.namespace || group.namespace || "").trim();
  const name = String(raw.name || "").trim();
  const id = String(raw.id || `character.${knowledge.slug(name)}-${knowledge.slug(namespace)}`);
  const adultVerification = normalizeAdultVerification(raw);
  return {
    id,
    kind: String(raw.kind || group.kind || "named-character"),
    name,
    namespace,
    aliases: uniqueStrings([name, ...asArray(group.aliasPrefix ? [`${name} ${group.aliasPrefix}`] : []), ...asArray(raw.aliases)]),
    promptTags: uniqueStrings(raw.promptTags),
    traits: uniqueStrings([...asArray(group.traits), ...asArray(raw.traits)]),
    adultAllowed: verifiedAdultEntity(raw),
    adultVerification,
    provenance: {
      source: String(raw.source || group.source || pack.source || pack.packId),
      packId: pack.packId,
      groupId: String(group.id || knowledge.slug(namespace))
    }
  };
}

function compileEntityPacks(packs, existingCatalog, options = {}) {
  const errors = [];
  const entities = [];
  const packReports = [];
  [...packs].sort((a, b) => compareCodeUnits(a?.packId, b?.packId)).forEach((pack) => {
    validatePackHeader(pack, "entities", errors);
    if (!Array.isArray(pack.groups)) {
      errors.push(`${pack.packId || "<missing>"} groups must be an array`);
      return;
    }
    const before = entities.length;
    pack.groups.forEach((group, groupIndex) => {
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        errors.push(`${pack.packId} groups[${groupIndex}] must be an object`);
        return;
      }
      if (!String(group.namespace || "").trim()) errors.push(`${pack.packId} groups[${groupIndex}] requires namespace`);
      if (!Array.isArray(group.entries)) {
        errors.push(`${pack.packId} groups[${groupIndex}].entries must be an array`);
        return;
      }
      group.entries.forEach((entry, entryIndex) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          errors.push(`${pack.packId} groups[${groupIndex}].entries[${entryIndex}] must be an object`);
          return;
        }
        if (entry.adultAllowed === true && !verifiedAdultEntity(entry)) {
          errors.push(`${pack.packId} groups[${groupIndex}].entries[${entryIndex}] requests adultAllowed without verified-adult evidence and two reviewers`);
        }
        entities.push(createEntity(entry, group, pack));
      });
    });
    packReports.push({
      packId: pack.packId,
      packType: "entities",
      sourceFingerprint: knowledge.fingerprint(pack),
      entities: entities.length - before
    });
  });

  entities.sort((a, b) => compareCodeUnits(a.id, b.id));
  const effective = knowledge.normalizeCatalog({
    ...knowledge.normalizeCatalog(existingCatalog),
    entities: [...knowledge.normalizeCatalog(existingCatalog).entities, ...entities]
  });
  const audit = knowledge.auditCatalog(effective, { nearDuplicates: false, applyPolicy: false, maxIssues: options.maxIssues || 20000 });
  const generatedIds = new Set(entities.map((item) => item.id));
  audit.issues.filter((issue) => (issue.severity === "error" || STRICT_GENERATED_CODES.has(issue.code)) && (
    generatedIds.has(issue.id) || issue.relatedIds.some((id) => generatedIds.has(id))
  )).forEach((issue) => errors.push(`${issue.code}: ${issue.message}`));
  const existingIds = new Set(knowledge.normalizeCatalog(existingCatalog).entities.map((item) => item.id));
  entities.forEach((entity) => {
    if (existingIds.has(entity.id)) errors.push(`Entity id ${entity.id} already exists in the target catalog`);
  });
  return {
    valid: errors.length === 0,
    errors: uniqueStrings(errors),
    entities,
    effectiveCatalog: effective,
    packs: packReports
  };
}

function gcd(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
}

function hash32(value) {
  return Number.parseInt(knowledge.fingerprint(String(value)).slice(0, 8), 16) >>> 0;
}

function deterministicSelection(pool, seed, count) {
  if (count <= 0 || !pool.length) return [];
  const start = hash32(`${seed}:start`) % pool.length;
  let step = pool.length === 1 ? 1 : 1 + (hash32(`${seed}:step`) % (pool.length - 1));
  while (pool.length > 1 && gcd(step, pool.length) !== 1) step = (step % (pool.length - 1)) + 1;
  const selected = [];
  const used = new Set();
  for (let offset = 0; selected.length < count && offset < pool.length * 2; offset += 1) {
    const item = pool[(start + offset * step) % pool.length];
    if (used.has(item.id)) continue;
    used.add(item.id);
    selected.push(item);
  }
  return selected;
}

function conceptMatchesBases(concept, bases, checkpointById) {
  if (!bases.length) return true;
  const conceptBases = asArray(concept.compatibility?.bases);
  const checkpointIds = asArray(concept.compatibility?.checkpointIds);
  if (!conceptBases.length && !checkpointIds.length) return true;
  if (conceptBases.some((base) => bases.includes(base))) return true;
  return checkpointIds.some((id) => bases.includes(checkpointById.get(id)?.base));
}

function resolveIngredientPool(selector, slot, catalog, family, errors) {
  const expectedKind = knowledge.RECIPE_SLOT_KINDS[slot];
  if (!expectedKind) {
    errors.push(`${family.id} uses unknown recipe slot ${slot}`);
    return [];
  }
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    errors.push(`${family.id} selector ${slot} must be an object`);
    return [];
  }
  const conceptById = new Map(catalog.concepts.map((item) => [item.id, item]));
  const checkpointById = new Map(catalog.checkpoints.map((item) => [item.id, item]));
  const explicitIds = asArray(selector.ids);
  let pool = explicitIds.length
    ? explicitIds.map((id) => conceptById.get(id)).filter(Boolean)
    : catalog.concepts.filter((item) => item.kind === expectedKind);
  explicitIds.filter((id) => !conceptById.has(id)).forEach((id) => errors.push(`${family.id} selector ${slot} references missing concept ${id}`));
  pool = pool.filter((item) => item.kind === expectedKind);
  const families = asArray(selector.families);
  const sources = asArray(selector.sources);
  const groups = asArray(selector.groups);
  const traitsAny = asArray(selector.traitsAny);
  const traitsAll = asArray(selector.traitsAll);
  const promptIncludes = asArray(selector.promptIncludes).map(knowledge.normalizeText);
  if (families.length) pool = pool.filter((item) => families.includes(item.provenance?.family));
  if (sources.length) pool = pool.filter((item) => sources.includes(item.provenance?.source));
  if (groups.length) pool = pool.filter((item) => groups.includes(item.group));
  if (traitsAny.length) pool = pool.filter((item) => traitsAny.some((trait) => asArray(item.traits).includes(trait)));
  if (traitsAll.length) pool = pool.filter((item) => traitsAll.every((trait) => asArray(item.traits).includes(trait)));
  if (promptIncludes.length) pool = pool.filter((item) => {
    const prompt = knowledge.normalizeText(item.promptForms?.default);
    return promptIncludes.some((needle) => prompt.includes(needle));
  });
  const allowedModes = asArray(selector.contentModes);
  if (allowedModes.length) pool = pool.filter((item) => allowedModes.includes(item.contentMode));
  if (asArray(family.contentModes).includes("sfw")) pool = pool.filter((item) => item.contentMode !== "adult");
  const bases = uniqueStrings([...asArray(family.bases), ...asArray(selector.bases)]);
  pool = pool.filter((item) => conceptMatchesBases(item, bases, checkpointById));
  pool.sort((a, b) => compareCodeUnits(a.id, b.id));
  const count = Math.max(1, Number(selector.count) || 1);
  if (pool.length < count) errors.push(`${family.id} selector ${slot} found ${pool.length} concepts; needs ${count}`);
  return pool;
}

function descriptorForRecipe(ingredients, conceptById) {
  const preferred = ["style", "composition", "palette", "lighting", "camera", "environment"];
  const parts = [];
  preferred.forEach((slot) => {
    const first = asArray(ingredients[slot])[0];
    if (!first) return;
    const label = String(conceptById.get(first)?.label || "").trim();
    if (label && !parts.includes(label)) parts.push(label);
  });
  return parts.slice(0, 4).join(", ");
}

function compileRecipeFamily(family, catalog, pack, errors) {
  if (!family || typeof family !== "object" || Array.isArray(family)) {
    errors.push(`${pack.packId} recipe family must be an object`);
    return [];
  }
  if (!stableId(family.id)) errors.push(`${pack.packId} recipe family id ${family.id || "<missing>"} is invalid`);
  if (!String(family.name || "").trim()) errors.push(`${family.id || "<missing>"} requires name`);
  const variants = Number(family.variants || 0);
  if (!Number.isSafeInteger(variants) || variants < 1 || variants > 2000) errors.push(`${family.id} variants must be an integer from 1 to 2000`);
  const contentModes = uniqueStrings(family.contentModes?.length ? family.contentModes : ["sfw", "adult"]);
  contentModes.filter((mode) => !contracts.CONTENT_MODES.includes(mode)).forEach((mode) => errors.push(`${family.id} uses unknown content mode ${mode}`));
  const selectors = family.ingredientSelectors && typeof family.ingredientSelectors === "object" && !Array.isArray(family.ingredientSelectors)
    ? family.ingredientSelectors
    : {};
  const requiredSlots = uniqueStrings(family.requiredSlots || Object.keys(selectors));
  const optionalSlots = uniqueStrings(family.optionalSlots || []);
  requiredSlots.forEach((slot) => {
    if (!selectors[slot]) errors.push(`${family.id} required slot ${slot} has no selector`);
  });
  const pools = Object.fromEntries(Object.entries(selectors).map(([slot, selector]) => [slot, {
    selector,
    concepts: resolveIngredientPool(selector, slot, catalog, { ...family, contentModes }, errors)
  }]));
  if (errors.length) return [];

  const conceptById = new Map(catalog.concepts.map((item) => [item.id, item]));
  const recipes = [];
  const combinations = new Set();
  const maxAttempts = Math.max(variants * 50, variants + 100);
  for (let attempt = 0; attempt < maxAttempts && recipes.length < variants; attempt += 1) {
    const ingredients = {};
    Object.entries(pools).sort(([left], [right]) => compareCodeUnits(left, right)).forEach(([slot, pool]) => {
      const count = Math.max(1, Number(pool.selector.count) || 1);
      ingredients[slot] = deterministicSelection(pool.concepts, `${family.id}:${attempt}:${slot}`, count).map((item) => item.id);
    });
    const combinationKey = knowledge.stableStringify(ingredients);
    if (combinations.has(combinationKey)) continue;
    combinations.add(combinationKey);
    const index = recipes.length + 1;
    const digest = knowledge.fingerprint(ingredients).slice(0, 12);
    const descriptor = descriptorForRecipe(ingredients, conceptById) || `variant ${digest}`;
    const uniqueAlias = `${String(family.name).toLowerCase()} featuring ${descriptor} ${digest}`;
    recipes.push({
      schemaVersion: contracts.SCHEMA_VERSION,
      id: `${family.id}.${digest}`,
      name: `${family.name} ${index}`,
      aliases: [uniqueAlias],
      contentModes,
      ingredients,
      requiredSlots,
      optionalSlots,
      conflicts: uniqueStrings(family.conflicts),
      triggers: [uniqueAlias],
      signals: uniqueStrings(family.signals),
      familyTriggers: uniqueStrings(family.triggers || family.aliases),
      familyId: family.id,
      variantIndex: index - 1,
      priority: Number(family.priority || 0),
      selectionCounts: Object.fromEntries(Object.entries(ingredients).map(([slot, values]) => [slot, values.length])),
      compatibility: {
        bases: uniqueStrings(family.bases),
        checkpointIds: uniqueStrings(family.checkpointIds)
      },
      provenance: {
        source: String(pack.source || pack.packId),
        packId: pack.packId,
        family: family.id
      }
    });
  }
  if (recipes.length < variants) errors.push(`${family.id} produced ${recipes.length} unique recipes; requested ${variants}`);
  return recipes;
}

function recipeSemanticIssues(recipe, catalog) {
  const conceptById = new Map(catalog.concepts.map((item) => [item.id, item]));
  const prompts = (slot) => asArray(recipe.ingredients?.[slot])
    .map((id) => conceptById.get(id)?.promptForms?.default || "")
    .join(" ")
    .toLowerCase();
  const camera = prompts("camera");
  const composition = prompts("composition");
  const environment = prompts("environment");
  const lighting = prompts("lighting");
  const pose = prompts("pose");
  const action = prompts("action");
  const wardrobe = prompts("wardrobe");
  const effects = prompts("effects");
  const palette = prompts("palette");
  const quality = prompts("quality");
  const issues = [];
  const add = (code, message) => issues.push({ code, message });

  const closeComposition = /\b(?:extreme close-up|face close-up|facial close-up|bust portrait|head-and-shoulders)\b/;
  const broadComposition = /\b(?:full-body|full body|standing figure|landscape composition|landscape depth|ensemble staging|wide tableau)\b/;
  if (/\b(?:full-body shot|full body shot|extreme wide shot|wide shot)\b/.test(camera) && closeComposition.test(composition)) {
    add("recipe.camera-composition-scale", "wide/full-body camera conflicts with close portrait composition");
  }
  if (/\b(?:extreme close-up|close-up)\b/.test(camera) && broadComposition.test(composition)) {
    add("recipe.camera-composition-scale", "close camera conflicts with broad/full-body composition");
  }
  if (/\bmedium close-up\b/.test(camera) && /\b(?:extreme close-up|full-body|full body|landscape composition)\b/.test(composition)) {
    add("recipe.camera-composition-scale", "medium close-up conflicts with composition crop or scale");
  }

  const clearlyOutdoor = /\b(?:coastal shoreline|desert highway|forest clearing|highland village|mountain pass|open countryside|river valley|city boulevard|harbor district|suburban neighborhood|alpine meadow|highland moor|outdoor|battlefield|rooftop|fae garden)\b/;
  const enclosedSource = /\b(?:softbox|beauty dish|ring light|studio strobe|projector beam|ceiling skylight|fluorescent practicals|table lamp practical|window daylight|doorway spill)\b/;
  if (clearlyOutdoor.test(environment) && enclosedSource.test(lighting)) {
    add("recipe.environment-lighting-source", "clearly outdoor environment uses an enclosed or studio light source");
  }
  if (/\bmoonlit\b/.test(environment) && /\b(?:sunlight|daylight|golden hour|softbox|projector)\b/.test(lighting)) {
    add("recipe.environment-lighting-time", "moonlit environment conflicts with the selected light source");
  }
  if (/\bpredawn\b/.test(environment) && /\b(?:sunlight|golden hour|midday)\b/.test(lighting)) {
    add("recipe.environment-lighting-time", "predawn environment conflicts with daylight timing");
  }

  const isCharacterStaging = recipe.provenance?.packId === "phase8.character-staging-recipes";
  const armed = /\b(?:sword|blade|katana|bow|bowstring|arrow|spear|staff|polearm|axe|hammer|firearm|rifle|pistol|weapon)\b/;
  const unarmed = /\b(?:unarmed|barehanded|empty-hand|empty hand|fist|punch|kick)\b/;
  if (isCharacterStaging && ((unarmed.test(pose) && armed.test(action)) || (armed.test(pose) && unarmed.test(action)))) {
    add("recipe.pose-action-weapon-modality", "pose and action disagree about armed versus unarmed combat");
  }

  const climateText = { environment, wardrobe, effects, composition, palette };
  const climatePatterns = {
    cold: /\b(?:alpine|arctic|blizzard|frost|frozen|glacier|ice|snow|snowy|tundra|winter)\b/,
    tropical: /\b(?:jungle|mangrove|monsoon|rainforest|tropical)\b/,
    arid: /\b(?:arid|badlands|desert|dune|dunes|sandstorm)\b/,
    autumn: /\b(?:autumn|falling leaves|fallen leaves)\b/
  };
  const climatesBySlot = Object.fromEntries(Object.entries(climateText).map(([slot, value]) => [
    slot,
    Object.entries(climatePatterns).filter(([, pattern]) => pattern.test(value)).map(([name]) => name)
  ]));
  const observedClimates = new Set(Object.values(climatesBySlot).flat());
  if (isCharacterStaging && observedClimates.size > 1) {
    const evidence = Object.entries(climatesBySlot)
      .filter(([, values]) => values.length)
      .map(([slot, values]) => `${slot}:${values.join("+")}`)
      .join(", ");
    add("recipe.climate-slot-conflict", `ingredient slots mix incompatible climates (${evidence})`);
  }

  const timeText = `${environment} ${lighting} ${palette}`;
  const hasNight = /\b(?:moonlit|night|nighttime|neon-night|midnight)\b/.test(timeText);
  const hasDay = /\b(?:daylight|daytime|midday|sunlit|sunlight)\b/.test(timeText);
  if (isCharacterStaging && hasNight && hasDay) {
    add("recipe.time-palette-conflict", "environment, lighting, or palette mixes daytime and nighttime direction");
  }

  const irrelevantCharacterQuality = /\b(?:architecture|architectural|automotive|vehicle|landscape|still life|still-life|product|ensemble)\b/;
  if (isCharacterStaging && quality && irrelevantCharacterQuality.test(quality)) {
    add("recipe.character-quality-domain", "character staging uses quality guidance from an unrelated subject domain");
  }

  const broadPortraitTrigger = asArray(recipe.familyTriggers).some((trigger) => (
    /^(?:character portrait|portrait of|standing portrait)$/i.test(String(trigger).trim())
  ));
  if (isCharacterStaging && broadPortraitTrigger && asArray(recipe.ingredients?.expression).length) {
    add("recipe.broad-trigger-mood-override", "broad portrait trigger must not force an expression or mood");
  }
  return issues;
}

function compileRecipePacks(packs, existingCatalog, options = {}) {
  const errors = [];
  const recipes = [];
  const packReports = [];
  const familyIds = new Set();
  [...packs].sort((a, b) => compareCodeUnits(a?.packId, b?.packId)).forEach((pack) => {
    validatePackHeader(pack, "recipes", errors);
    if (!Array.isArray(pack.families)) {
      errors.push(`${pack.packId || "<missing>"} families must be an array`);
      return;
    }
    const before = recipes.length;
    pack.families.forEach((family) => {
      if (familyIds.has(family?.id)) errors.push(`Recipe family id ${family?.id || "<missing>"} is repeated`);
      familyIds.add(family?.id);
      const familyErrors = [];
      recipes.push(...compileRecipeFamily(family, existingCatalog, pack, familyErrors));
      errors.push(...familyErrors);
    });
    packReports.push({
      packId: pack.packId,
      packType: "recipes",
      sourceFingerprint: knowledge.fingerprint(pack),
      recipes: recipes.length - before
    });
  });
  recipes.sort((a, b) => compareCodeUnits(a.id, b.id));
  const normalizedExisting = knowledge.normalizeCatalog(existingCatalog);
  const existingIds = new Set(normalizedExisting.recipes.map((item) => item.id));
  recipes.forEach((recipe) => {
    if (existingIds.has(recipe.id)) errors.push(`Recipe id ${recipe.id} already exists in the target catalog`);
    recipeSemanticIssues(recipe, normalizedExisting).forEach((issue) => {
      errors.push(`${issue.code}: Recipe ${recipe.id} ${issue.message}`);
    });
  });
  const effective = knowledge.normalizeCatalog({ ...normalizedExisting, recipes: [...normalizedExisting.recipes, ...recipes] });
  const audit = knowledge.auditCatalog(effective, { nearDuplicates: false, applyPolicy: false, maxIssues: options.maxIssues || 30000 });
  const generatedIds = new Set(recipes.map((item) => item.id));
  audit.issues.filter((issue) => (issue.severity === "error" || STRICT_GENERATED_CODES.has(issue.code)) && (
    generatedIds.has(issue.id) || issue.relatedIds.some((id) => generatedIds.has(id))
  )).forEach((issue) => errors.push(`${issue.code}: ${issue.message}`));
  return {
    valid: errors.length === 0,
    errors: uniqueStrings(errors),
    recipes,
    effectiveCatalog: effective,
    packs: packReports
  };
}

function filterBaselineRegressions(comparison) {
  const allowed = new Set(BLOCKING_BASELINE_CODES);
  const regressions = comparison.regressions.filter((item) => item.code === "catalog.structural-errors" || item.code === "catalog.truncated-audit" || allowed.has(item.code));
  return { ...comparison, valid: regressions.length === 0, regressions };
}

function evaluatePhase8Gates(audit, current, baseline, targets = {}) {
  const failures = [];
  const totals = audit.coverage.totals;
  const expected = {
    concepts: Number(targets.concepts || 0),
    recipes: Number(targets.recipes || 0),
    entities: Number(targets.entities || targets.namedEntities || 0),
    adultConcepts: Number(targets.adultConcepts || 0)
  };
  Object.entries(expected).forEach(([key, minimum]) => {
    const actual = Number(totals[key] || 0);
    if (minimum && actual < minimum) failures.push({ code: `target.${key}`, expected: minimum, actual });
  });
  Object.entries(targets.conceptsByKind || {}).forEach(([kind, minimum]) => {
    const actual = Number(audit.coverage.concepts.byKind[kind] || 0);
    if (actual < Number(minimum)) failures.push({ code: `target.kind.${kind}`, expected: Number(minimum), actual });
  });
  Object.entries(targets.effectiveConceptsByBase || {}).forEach(([base, minimum]) => {
    const actual = Number(audit.coverage.concepts.effectiveByBase[base] || 0);
    if (actual < Number(minimum)) failures.push({ code: `target.base.${base}`, expected: Number(minimum), actual });
  });
  const sourceFingerprint = knowledge.fingerprint(current);
  if (baseline?.catalogFingerprint && sourceFingerprint !== baseline.catalogFingerprint) {
    failures.push({ code: "baseline.source-fingerprint", expected: baseline.catalogFingerprint, actual: sourceFingerprint });
  }
  if (baseline && Number(audit.quality.score || 0) < Number(baseline.catalogQualityScore || 0)) {
    failures.push({
      code: "quality.score-regression",
      expected: Number(baseline.catalogQualityScore || 0),
      actual: Number(audit.quality.score || 0)
    });
  }
  return { valid: failures.length === 0, failures };
}

function buildPhase8Catalog(packInputs, options = {}) {
  const packs = asArray(packInputs);
  const unknownPacks = packs.filter((pack) => classifyPack(pack) === "unknown");
  const errors = unknownPacks.map((pack) => `${pack?.packId || "<missing>"} has unknown packType ${pack?.packType}`);
  const packIds = new Set();
  packs.forEach((pack) => {
    const id = String(pack?.packId || "");
    if (packIds.has(id)) errors.push(`Pack id ${id || "<missing>"} is repeated`);
    packIds.add(id);
  });
  const current = knowledge.normalizeCatalog(options.currentCatalog || knowledge.currentCatalog());
  const conceptResult = compileConceptPacks(packs.filter((pack) => classifyPack(pack) === "concepts"), current, options);
  errors.push(...conceptResult.errors);
  const entityResult = compileEntityPacks(packs.filter((pack) => classifyPack(pack) === "entities"), conceptResult.effectiveCatalog, options);
  errors.push(...entityResult.errors);
  const recipeResult = compileRecipePacks(packs.filter((pack) => classifyPack(pack) === "recipes"), entityResult.effectiveCatalog, options);
  errors.push(...recipeResult.errors);

  const delta = {
    schemaVersion: contracts.SCHEMA_VERSION,
    checkpoints: [],
    entities: entityResult.entities,
    concepts: conceptResult.concepts,
    recipes: recipeResult.recipes
  };
  const effective = knowledge.normalizeCatalog(recipeResult.effectiveCatalog);
  const audit = knowledge.auditCatalog(effective, {
    nearDuplicates: options.nearDuplicates !== false,
    nearDuplicateThreshold: options.nearDuplicateThreshold || 0.9,
    maxNearDuplicatePairs: options.maxNearDuplicatePairs || 500000,
    maxNearDuplicateIssues: options.maxNearDuplicateIssues || 5000,
    maxIssues: options.maxIssues || 50000,
    policy: options.policy || {}
  });
  const rawComparison = options.baseline
    ? knowledge.compareAuditToBaseline(audit, options.baseline)
    : null;
  const baselineComparison = rawComparison ? filterBaselineRegressions(rawComparison) : null;
  const allPackReports = [...conceptResult.packs, ...entityResult.packs, ...recipeResult.packs]
    .sort((a, b) => compareCodeUnits(a.packId, b.packId));
  const acceptedPackIds = new Set(ACCEPTED_PHASE8_BASELINE.packIds);
  const extensionPackIds = [...packIds].filter((id) => !acceptedPackIds.has(id)).sort(compareCodeUnits);
  const lineage = extensionPackIds.length ? {
    parent: {
      buildId: ACCEPTED_PHASE8_BASELINE.buildId,
      packIds: [...ACCEPTED_PHASE8_BASELINE.packIds],
      fingerprints: { ...ACCEPTED_PHASE8_BASELINE.fingerprints }
    },
    extensions: {
      packIds: extensionPackIds
    }
  } : null;
  const stats = {
    delta: {
      concepts: delta.concepts.length,
      entities: delta.entities.length,
      recipes: delta.recipes.length,
      conceptsByKind: sortedRecord(delta.concepts.reduce((counts, item) => {
        increment(counts, item.kind);
        return counts;
      }, {})),
      adultConcepts: delta.concepts.filter((item) => item.contentMode === "adult").length,
      adultAllowedEntities: delta.entities.filter((item) => item.adultAllowed).length
    },
    effective: audit.catalog
  };
  const gates = evaluatePhase8Gates(
    audit,
    current,
    options.baseline,
    options.enforceTargets === true ? (options.targets || options.policy?.phase8Targets || {}) : {}
  );
  const uniqueErrors = uniqueStrings(errors);
  return {
    schemaVersion: BUILD_SCHEMA_VERSION,
    valid: uniqueErrors.length === 0 && audit.valid && baselineComparison?.valid !== false && gates.valid,
    errors: uniqueErrors,
    delta,
    deltaFingerprint: knowledge.fingerprint(delta),
    effectiveFingerprint: audit.fingerprint,
    stats,
    packs: allPackReports,
    audit,
    baselineComparison,
    gates,
    lineage,
    sourceFingerprint: knowledge.fingerprint(current)
  };
}

function jsonArtifact(value) {
  return `${knowledge.stableStringify(value, 2)}\n`;
}

function artifactPath(prefix, name) {
  return `${prefix}/${knowledge.slug(name)}.json`;
}

function renderArtifacts(build) {
  const artifacts = new Map();
  const add = (relativePath, value) => {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    if (artifacts.has(normalizedPath)) throw new Error(`Artifact path collision: ${normalizedPath}`);
    artifacts.set(normalizedPath, jsonArtifact(value));
  };
  const conceptsByKind = new Map();
  build.delta.concepts.forEach((item) => {
    if (!conceptsByKind.has(item.kind)) conceptsByKind.set(item.kind, []);
    conceptsByKind.get(item.kind).push(item);
  });
  [...conceptsByKind.entries()].sort(([a], [b]) => compareCodeUnits(a, b)).forEach(([kind, concepts]) => add(artifactPath("concepts", kind), {
    schemaVersion: contracts.SCHEMA_VERSION,
    kind,
    count: concepts.length,
    fingerprint: knowledge.fingerprint(concepts),
    concepts: concepts.sort((a, b) => compareCodeUnits(a.id, b.id))
  }));

  const entitiesByNamespace = new Map();
  build.delta.entities.forEach((item) => {
    if (!entitiesByNamespace.has(item.namespace)) entitiesByNamespace.set(item.namespace, []);
    entitiesByNamespace.get(item.namespace).push(item);
  });
  [...entitiesByNamespace.entries()].sort(([a], [b]) => compareCodeUnits(a, b)).forEach(([namespace, entities]) => {
    const suffix = knowledge.fingerprint(namespace).slice(0, 8);
    add(`entities/${knowledge.slug(namespace)}-${suffix}.json`, {
      schemaVersion: contracts.SCHEMA_VERSION,
      namespace,
      count: entities.length,
      fingerprint: knowledge.fingerprint(entities),
      entities: entities.sort((a, b) => compareCodeUnits(a.id, b.id))
    });
  });

  const recipesByFamily = new Map();
  build.delta.recipes.forEach((item) => {
    if (!recipesByFamily.has(item.familyId)) recipesByFamily.set(item.familyId, []);
    recipesByFamily.get(item.familyId).push(item);
  });
  [...recipesByFamily.entries()].sort(([a], [b]) => compareCodeUnits(a, b)).forEach(([familyId, recipes]) => {
    const suffix = knowledge.fingerprint(familyId).slice(0, 8);
    add(`recipes/${knowledge.slug(familyId)}-${suffix}.json`, {
      schemaVersion: contracts.SCHEMA_VERSION,
      familyId,
      count: recipes.length,
      fingerprint: knowledge.fingerprint(recipes),
      recipes: recipes.sort((a, b) => compareCodeUnits(a.id, b.id))
    });
  });

  add("catalog-delta.json", build.delta);
  add("coverage.json", build.audit.coverage);
  add("quality.json", build.audit.quality);
  add("audit.json", {
    schemaVersion: BUILD_SCHEMA_VERSION,
    valid: build.audit.valid,
    fingerprint: build.audit.fingerprint,
    summary: build.audit.summary,
    analysis: build.audit.analysis,
    issues: build.audit.issues,
    baselineComparison: build.baselineComparison
  });

  const files = [...artifacts.entries()].map(([relativePath, contents]) => ({
    path: relativePath,
    bytes: Buffer.byteLength(contents, "utf8"),
    sha256: rawSha256(contents)
  })).sort((a, b) => compareCodeUnits(a.path, b.path));
  const manifest = {
    schemaVersion: BUILD_SCHEMA_VERSION,
    buildId: build.lineage ? "promptbrain-phase-8-with-authored-extensions" : "promptbrain-phase-8",
    valid: build.valid,
    sourceFingerprint: build.sourceFingerprint,
    deltaFingerprint: build.deltaFingerprint,
    effectiveFingerprint: build.effectiveFingerprint,
    stats: build.stats,
    gates: build.gates,
    packs: build.packs,
    ...(build.lineage ? { lineage: build.lineage } : {}),
    files
  };
  manifest.fingerprint = knowledge.fingerprint(manifest);
  add("manifest.json", manifest);
  return artifacts;
}

function verifyArtifacts(artifacts) {
  const errors = [];
  if (!(artifacts instanceof Map)) return { valid: false, errors: ["Artifacts must be a Map"] };
  if (!artifacts.has("manifest.json")) return { valid: false, errors: ["Missing manifest.json"] };
  let manifest;
  try {
    manifest = JSON.parse(artifacts.get("manifest.json"));
  } catch (error) {
    return { valid: false, errors: [`Invalid manifest.json: ${error.message}`] };
  }
  const claimedFingerprint = String(manifest.fingerprint || "");
  const unsignedManifest = { ...manifest };
  delete unsignedManifest.fingerprint;
  if (knowledge.fingerprint(unsignedManifest) !== claimedFingerprint) errors.push("Manifest fingerprint mismatch");

  const listed = new Map();
  asArray(manifest.files).forEach((file) => {
    const relativePath = String(file?.path || "");
    const segments = relativePath.split("/");
    if (!relativePath || relativePath.includes("\\") || relativePath.startsWith("/") || segments.includes("..")) {
      errors.push(`Unsafe artifact path: ${relativePath || "<empty>"}`);
      return;
    }
    if (listed.has(relativePath)) errors.push(`Manifest repeats artifact path: ${relativePath}`);
    listed.set(relativePath, file);
  });
  listed.forEach((file, relativePath) => {
    if (!artifacts.has(relativePath)) {
      errors.push(`Missing artifact: ${relativePath}`);
      return;
    }
    const contents = artifacts.get(relativePath);
    if (Buffer.byteLength(contents, "utf8") !== Number(file.bytes)) errors.push(`Artifact byte count mismatch: ${relativePath}`);
    if (rawSha256(contents) !== file.sha256) errors.push(`Artifact SHA-256 mismatch: ${relativePath}`);
  });
  [...artifacts.keys()].filter((relativePath) => relativePath !== "manifest.json" && !listed.has(relativePath))
    .forEach((relativePath) => errors.push(`Unlisted artifact: ${relativePath}`));

  const parse = (relativePath) => {
    if (!artifacts.has(relativePath)) return null;
    try {
      return JSON.parse(artifacts.get(relativePath));
    } catch (error) {
      errors.push(`Invalid JSON artifact ${relativePath}: ${error.message}`);
      return null;
    }
  };
  const delta = parse("catalog-delta.json");
  if (delta && knowledge.fingerprint(delta) !== manifest.deltaFingerprint) errors.push("Catalog delta fingerprint mismatch");
  const reconstructed = { concepts: [], entities: [], recipes: [] };
  listed.forEach((_file, relativePath) => {
    let collection = null;
    if (relativePath.startsWith("concepts/")) collection = "concepts";
    else if (relativePath.startsWith("entities/")) collection = "entities";
    else if (relativePath.startsWith("recipes/")) collection = "recipes";
    if (!collection) return;
    const shard = parse(relativePath);
    if (!shard) return;
    const items = asArray(shard[collection]);
    if (Number(shard.count) !== items.length) errors.push(`Shard count mismatch: ${relativePath}`);
    if (knowledge.fingerprint(items) !== shard.fingerprint) errors.push(`Shard fingerprint mismatch: ${relativePath}`);
    if (collection === "concepts" && items.some((item) => item.kind !== shard.kind)) errors.push(`Concept shard partition mismatch: ${relativePath}`);
    if (collection === "entities" && items.some((item) => item.namespace !== shard.namespace)) errors.push(`Entity shard partition mismatch: ${relativePath}`);
    if (collection === "recipes" && items.some((item) => item.familyId !== shard.familyId)) errors.push(`Recipe shard partition mismatch: ${relativePath}`);
    reconstructed[collection].push(...items);
  });
  if (delta) {
    ["concepts", "entities", "recipes"].forEach((collection) => {
      const expected = [...asArray(delta[collection])].sort((a, b) => compareCodeUnits(a.id, b.id));
      const actual = reconstructed[collection].sort((a, b) => compareCodeUnits(a.id, b.id));
      const ids = new Set(actual.map((item) => item.id));
      if (ids.size !== actual.length) errors.push(`Duplicate ${collection} ids across shards`);
      if (knowledge.stableStringify(actual) !== knowledge.stableStringify(expected)) errors.push(`${collection} shard round-trip mismatch`);
    });
  }
  return { valid: errors.length === 0, errors: uniqueStrings(errors) };
}

function writeArtifacts(outputDirectory, artifacts) {
  const root = path.resolve(outputDirectory);
  [...artifacts.entries()].forEach(([relativePath, contents]) => {
    const target = path.resolve(root, relativePath);
    const prefix = `${root}${path.sep}`;
    if (target !== root && !target.startsWith(prefix)) throw new Error(`Artifact path escapes output directory: ${relativePath}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, "utf8");
  });
  return root;
}

function compareArtifacts(outputDirectory, artifacts) {
  const root = path.resolve(outputDirectory);
  const mismatches = [];
  const expectedPaths = new Set([...artifacts.keys()].map((item) => item.replace(/\\/g, "/")));
  [...artifacts.entries()].forEach(([relativePath, contents]) => {
    const target = path.resolve(root, relativePath);
    if (!fs.existsSync(target)) {
      mismatches.push({ path: relativePath, reason: "missing" });
      return;
    }
    const actual = fs.readFileSync(target, "utf8");
    if (actual !== contents) mismatches.push({ path: relativePath, reason: "changed" });
  });
  if (fs.existsSync(root)) {
    const pending = [root];
    while (pending.length) {
      const directory = pending.pop();
      fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          pending.push(absolute);
          return;
        }
        if (!entry.isFile()) return;
        const relativePath = path.relative(root, absolute).replace(/\\/g, "/");
        if (!expectedPaths.has(relativePath)) mismatches.push({ path: relativePath, reason: "stale" });
      });
    }
  }
  mismatches.sort((a, b) => compareCodeUnits(a.path, b.path) || compareCodeUnits(a.reason, b.reason));
  return { valid: mismatches.length === 0, mismatches };
}

module.exports = Object.freeze({
  BUILD_SCHEMA_VERSION,
  PACK_TYPES,
  ACCEPTED_PHASE8_BASELINE,
  BLOCKING_BASELINE_CODES,
  STRICT_GENERATED_CODES,
  rawSha256,
  classifyPack,
  compileConceptPacks,
  compileEntityPacks,
  compileRecipePacks,
  recipeSemanticIssues,
  evaluatePhase8Gates,
  buildPhase8Catalog,
  renderArtifacts,
  verifyArtifacts,
  writeArtifacts,
  compareArtifacts
});
