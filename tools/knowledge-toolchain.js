"use strict";

const crypto = require("node:crypto");
const contracts = require("../engine/contracts.js");
const seedKnowledge = require("../engine/seed-knowledge.js");
const curatedKnowledge = require("../engine/curated-knowledge.js");
const artDirector = require("../engine/art-director.js");

const TOOLCHAIN_SCHEMA_VERSION = 1;
const PACK_SCHEMA_VERSION = 1;
const SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1, info: 2 });
const KNOWN_BASES = Object.freeze(["SD1.5", "SDXL", "Pony", "FLUX"]);
const PROMPT_STYLES = Object.freeze(["tags", "natural_language", "score_tags"]);
const WEIGHT_SYNTAXES = Object.freeze(["classic", "none"]);
const RECIPE_SLOT_KINDS = Object.freeze({
  quality: "quality",
  style: "style",
  subject: "subject",
  anatomy: "anatomy",
  action: "action",
  interaction: "interaction",
  pose: "pose",
  expression: "expression",
  wardrobe: "wardrobe",
  environment: "environment",
  lighting: "lighting",
  camera: "camera",
  composition: "composition",
  palette: "palette",
  motifs: "motif",
  effects: "effect",
  loras: "lora"
});

const DEFAULT_POLICY = Object.freeze({
  minimums: Object.freeze({
    checkpoints: 12,
    entities: 4,
    concepts: 2800,
    recipes: 250,
    adultConcepts: 30
  }),
  minimumConceptsByKind: Object.freeze({
    quality: 20,
    style: 100,
    subject: 30,
    anatomy: 80,
    action: 100,
    interaction: 20,
    pose: 100,
    expression: 100,
    wardrobe: 200,
    environment: 100,
    lighting: 100,
    camera: 100,
    composition: 100,
    palette: 100,
    motif: 100,
    effect: 100
  }),
  requiredCheckpointBases: KNOWN_BASES,
  coverageSeverity: "warning"
});

const STOP_TOKENS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with",
  "art", "artwork", "image", "illustration", "style", "pose", "view", "lighting", "composition"
]);

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\\([()])/g, "$1")
    .replace(/\(\s*([^:()]+?)\s*:\s*\d+(?:\.\d+)?\s*\)/g, "$1")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "item";
}

function tokenize(value) {
  return [...new Set(normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token)))];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableStringify(value, spacing = 0) {
  return JSON.stringify(stableValue(value), null, spacing);
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalizeCatalog(input = {}) {
  const checkpoints = Array.isArray(input.checkpoints)
    ? input.checkpoints
    : Object.values(input.checkpoints || input.checkpointProfiles || {});
  return {
    schemaVersion: Number(input.schemaVersion || contracts.SCHEMA_VERSION),
    checkpoints: [...checkpoints],
    entities: [...asArray(input.entities)],
    concepts: [...asArray(input.concepts || input.entries)],
    recipes: [...asArray(input.recipes || input.artRecipes)]
  };
}

function currentCatalog() {
  return normalizeCatalog({
    schemaVersion: contracts.SCHEMA_VERSION,
    checkpoints: seedKnowledge.CHECKPOINT_PROFILES,
    entities: seedKnowledge.ENTITIES,
    concepts: [...seedKnowledge.CONCEPTS, ...curatedKnowledge.CONCEPTS],
    recipes: [...seedKnowledge.ART_RECIPES, ...artDirector.ART_RECIPES]
  });
}

function createCollector(maxIssues = 10000) {
  return {
    issues: [],
    counts: { error: 0, warning: 0, info: 0 },
    total: 0,
    maxIssues: Math.max(1, Number(maxIssues) || 10000),
    truncated: 0
  };
}

function addIssue(collector, severity, code, message, details = {}) {
  const level = Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, severity) ? severity : "error";
  collector.counts[level] += 1;
  collector.total += 1;
  if (collector.issues.length >= collector.maxIssues) {
    collector.truncated += 1;
    return;
  }
  collector.issues.push({
    severity: level,
    code: String(code),
    message: String(message),
    entityType: String(details.entityType || "catalog"),
    id: String(details.id || ""),
    path: String(details.path || ""),
    relatedIds: uniqueStrings(details.relatedIds),
    data: details.data && typeof details.data === "object" ? stableValue(details.data) : undefined
  });
}

function sortIssues(issues) {
  return issues.sort((a, b) => (
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || a.code.localeCompare(b.code)
    || a.entityType.localeCompare(b.entityType)
    || a.id.localeCompare(b.id)
    || a.message.localeCompare(b.message)
  ));
}

function validateStableId(collector, value, entityType, pathName = "id") {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._:-]*$/.test(value)) {
    addIssue(collector, "error", `${entityType}.invalid-id`, `${entityType} ${pathName} must be a stable lowercase identifier`, {
      entityType,
      id: typeof value === "string" ? value : "",
      path: pathName
    });
    return false;
  }
  return true;
}

function validateStringArray(collector, value, details, options = {}) {
  const values = asArray(value);
  if (!Array.isArray(value)) {
    addIssue(collector, "error", `${details.entityType}.invalid-array`, `${details.path} must be an array`, details);
    return [];
  }
  if (options.nonEmpty && values.length === 0) {
    addIssue(collector, "error", `${details.entityType}.empty-array`, `${details.path} must not be empty`, details);
  }
  const normalized = new Map();
  values.forEach((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      addIssue(collector, "error", `${details.entityType}.invalid-string`, `${details.path}[${index}] must be a non-empty string`, {
        ...details,
        path: `${details.path}[${index}]`
      });
      return;
    }
    const key = normalizeText(item);
    if (normalized.has(key)) {
      addIssue(collector, "warning", `${details.entityType}.duplicate-array-value`, `${details.path} repeats "${item}"`, {
        ...details,
        path: `${details.path}[${index}]`,
        data: { firstIndex: normalized.get(key) }
      });
    } else {
      normalized.set(key, index);
    }
  });
  return values;
}

function validateCheckpoint(checkpoint, collector) {
  const id = String(checkpoint?.id || "");
  const details = { entityType: "checkpoint", id };
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    addIssue(collector, "error", "checkpoint.invalid", "Checkpoint must be an object", details);
    return;
  }
  if (typeof checkpoint.id !== "string" || !/^[a-z][A-Za-z0-9._:-]*$/.test(checkpoint.id)) {
    addIssue(collector, "error", "checkpoint.invalid-id", "Checkpoint id must be a stable camelCase or lowercase identifier", {
      ...details,
      path: "id"
    });
  }
  ["name", "family", "base", "type", "promptStyle", "separator", "weightSyntax"].forEach((field) => {
    if (typeof checkpoint[field] !== "string" || !checkpoint[field].trim()) {
      addIssue(collector, "error", "checkpoint.missing-field", `Checkpoint ${id || "<unknown>"} requires ${field}`, {
        ...details,
        path: field
      });
    }
  });
  if (!KNOWN_BASES.includes(checkpoint.base)) {
    addIssue(collector, "error", "checkpoint.unknown-base", `Checkpoint ${id} uses unsupported base ${checkpoint.base}`, {
      ...details,
      path: "base"
    });
  }
  if (!PROMPT_STYLES.includes(checkpoint.promptStyle)) {
    addIssue(collector, "error", "checkpoint.unknown-prompt-style", `Checkpoint ${id} uses unsupported prompt style ${checkpoint.promptStyle}`, {
      ...details,
      path: "promptStyle"
    });
  }
  if (!WEIGHT_SYNTAXES.includes(checkpoint.weightSyntax)) {
    addIssue(collector, "error", "checkpoint.unknown-weight-syntax", `Checkpoint ${id} uses unsupported weight syntax ${checkpoint.weightSyntax}`, {
      ...details,
      path: "weightSyntax"
    });
  }
  if (typeof checkpoint.supportsNegative !== "boolean") {
    addIssue(collector, "error", "checkpoint.invalid-negative-support", `Checkpoint ${id} supportsNegative must be boolean`, {
      ...details,
      path: "supportsNegative"
    });
  }
  validateStringArray(collector, checkpoint.qualityPrefix, { ...details, path: "qualityPrefix" });
  if (!Number.isSafeInteger(checkpoint.maxEstimatedTokens) || checkpoint.maxEstimatedTokens < 32) {
    addIssue(collector, "error", "checkpoint.invalid-token-budget", `Checkpoint ${id} needs a practical maxEstimatedTokens budget`, {
      ...details,
      path: "maxEstimatedTokens"
    });
  }
}

function validateEntity(entity, collector) {
  const id = String(entity?.id || "");
  const details = { entityType: "entity", id };
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    addIssue(collector, "error", "entity.invalid", "Entity must be an object", details);
    return;
  }
  validateStableId(collector, entity.id, "entity");
  ["kind", "name", "namespace"].forEach((field) => {
    if (typeof entity[field] !== "string" || !entity[field].trim()) {
      addIssue(collector, "error", "entity.missing-field", `Entity ${id || "<unknown>"} requires ${field}`, {
        ...details,
        path: field
      });
    }
  });
  validateStringArray(collector, entity.aliases, { ...details, path: "aliases" }, { nonEmpty: true });
  validateStringArray(collector, entity.promptTags, { ...details, path: "promptTags" }, { nonEmpty: true });
  validateStringArray(collector, entity.traits, { ...details, path: "traits" });
  if (typeof entity.adultAllowed !== "boolean") {
    addIssue(collector, "error", "entity.invalid-adult-flag", `Entity ${id} adultAllowed must be boolean`, {
      ...details,
      path: "adultAllowed"
    });
  }
}

function validateConcept(concept, collector, context) {
  const id = String(concept?.id || "");
  const details = { entityType: "concept", id };
  const base = contracts.validateKnowledgeEntry(concept);
  base.errors.forEach((message) => addIssue(collector, "error", "concept.schema", `${id || "<unknown>"}: ${message}`, details));
  if (!concept || typeof concept !== "object" || Array.isArray(concept)) return;

  const aliases = validateStringArray(collector, concept.aliases, { ...details, path: "aliases" }, { nonEmpty: true });
  validateStringArray(collector, concept.requires, { ...details, path: "requires" });
  validateStringArray(collector, concept.conflicts, { ...details, path: "conflicts" });
  validateStringArray(collector, concept.traits || [], { ...details, path: "traits" });

  if (!concept.promptForms || typeof concept.promptForms !== "object" || Array.isArray(concept.promptForms)) return;
  if (typeof concept.promptForms.default !== "string" || !concept.promptForms.default.trim()) {
    addIssue(collector, "error", "concept.missing-default-prompt", `Concept ${id} needs promptForms.default`, {
      ...details,
      path: "promptForms.default"
    });
  }
  Object.entries(concept.promptForms).forEach(([key, value]) => {
    if (typeof value !== "string" || !value.trim()) {
      addIssue(collector, "error", "concept.invalid-prompt-form", `Concept ${id} prompt form ${key} must be a non-empty string`, {
        ...details,
        path: `promptForms.${key}`
      });
    }
    if (key !== "default" && !context.checkpointIds.has(key) && !context.bases.has(key)) {
      addIssue(collector, "warning", "concept.unknown-prompt-form-target", `Concept ${id} has prompt form for unknown checkpoint/base ${key}`, {
        ...details,
        path: `promptForms.${key}`
      });
    }
  });

  const compatibility = concept.compatibility;
  if (!compatibility || typeof compatibility !== "object" || Array.isArray(compatibility)) return;
  const bases = validateStringArray(collector, compatibility.bases, { ...details, path: "compatibility.bases" });
  const checkpointIds = validateStringArray(collector, compatibility.checkpointIds, { ...details, path: "compatibility.checkpointIds" });
  bases.forEach((baseName) => {
    if (!context.bases.has(baseName)) {
      addIssue(collector, "error", "concept.unknown-base", `Concept ${id} targets unknown base ${baseName}`, {
        ...details,
        path: "compatibility.bases"
      });
    }
  });
  checkpointIds.forEach((checkpointId) => {
    if (!context.checkpointIds.has(checkpointId)) {
      addIssue(collector, "error", "concept.unknown-checkpoint", `Concept ${id} targets missing checkpoint ${checkpointId}`, {
        ...details,
        path: "compatibility.checkpointIds"
      });
    }
  });

  if (typeof concept.group !== "string") {
    addIssue(collector, "error", "concept.invalid-group", `Concept ${id} group must be a string`, { ...details, path: "group" });
  }
  if (!Number.isFinite(concept.priority)) {
    addIssue(collector, "error", "concept.invalid-priority", `Concept ${id} priority must be finite`, { ...details, path: "priority" });
  }
  if (concept.provenance !== undefined && (!concept.provenance || typeof concept.provenance !== "object" || Array.isArray(concept.provenance))) {
    addIssue(collector, "error", "concept.invalid-provenance", `Concept ${id} provenance must be an object`, { ...details, path: "provenance" });
  }

  const promptLength = String(concept.promptForms.default || "").length;
  if (promptLength > 180) {
    addIssue(collector, "warning", "concept.long-prompt-form", `Concept ${id} has a ${promptLength}-character default prompt`, {
      ...details,
      path: "promptForms.default",
      data: { characters: promptLength }
    });
  }
  aliases.forEach((alias, index) => {
    const tokens = tokenize(alias);
    if (tokens.length === 0 || (tokens.length === 1 && STOP_TOKENS.has(tokens[0]))) {
      addIssue(collector, "info", "concept.generic-alias", `Concept ${id} has a very broad alias "${alias}"`, {
        ...details,
        path: `aliases[${index}]`
      });
    }
  });
}

function validateRecipe(recipe, collector, context) {
  const id = String(recipe?.id || "");
  const details = { entityType: "recipe", id };
  const base = contracts.validateArtRecipe(recipe);
  base.errors.forEach((message) => addIssue(collector, "error", "recipe.schema", `${id || "<unknown>"}: ${message}`, details));
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return;

  validateStringArray(collector, recipe.aliases, { ...details, path: "aliases" }, { nonEmpty: true });
  const contentModes = validateStringArray(collector, recipe.contentModes, { ...details, path: "contentModes" }, { nonEmpty: true });
  contentModes.forEach((mode) => {
    if (!contracts.CONTENT_MODES.includes(mode)) {
      addIssue(collector, "error", "recipe.unknown-content-mode", `Recipe ${id} uses unknown content mode ${mode}`, {
        ...details,
        path: "contentModes"
      });
    }
  });
  const requiredSlots = validateStringArray(collector, recipe.requiredSlots, { ...details, path: "requiredSlots" }, { nonEmpty: true });
  const optionalSlots = validateStringArray(collector, recipe.optionalSlots, { ...details, path: "optionalSlots" });
  validateStringArray(collector, recipe.conflicts, { ...details, path: "conflicts" });
  if (recipe.triggers !== undefined) validateStringArray(collector, recipe.triggers, { ...details, path: "triggers" });
  const requiredSet = new Set(requiredSlots);
  optionalSlots.forEach((slot) => {
    if (requiredSet.has(slot)) {
      addIssue(collector, "error", "recipe.slot-overlap", `Recipe ${id} lists ${slot} as required and optional`, {
        ...details,
        path: "optionalSlots"
      });
    }
  });
  [...requiredSlots, ...optionalSlots].forEach((slot) => {
    if (!Object.prototype.hasOwnProperty.call(RECIPE_SLOT_KINDS, slot)) {
      addIssue(collector, "error", "recipe.unknown-slot", `Recipe ${id} uses unknown slot ${slot}`, {
        ...details,
        path: "requiredSlots"
      });
    }
  });

  if (!recipe.ingredients || typeof recipe.ingredients !== "object" || Array.isArray(recipe.ingredients)) return;
  requiredSlots.forEach((slot) => {
    if (!Array.isArray(recipe.ingredients[slot]) || recipe.ingredients[slot].length === 0) {
      addIssue(collector, "error", "recipe.empty-required-slot", `Recipe ${id} required slot ${slot} is empty`, {
        ...details,
        path: `ingredients.${slot}`
      });
    }
  });
  Object.entries(recipe.ingredients).forEach(([slot, conceptIds]) => {
    if (!Object.prototype.hasOwnProperty.call(RECIPE_SLOT_KINDS, slot)) {
      addIssue(collector, "error", "recipe.unknown-ingredient-slot", `Recipe ${id} has unknown ingredient slot ${slot}`, {
        ...details,
        path: `ingredients.${slot}`
      });
      return;
    }
    validateStringArray(collector, conceptIds, { ...details, path: `ingredients.${slot}` }, { nonEmpty: true });
    asArray(conceptIds).forEach((conceptId) => {
      const concept = context.conceptById.get(conceptId);
      if (!concept) {
        addIssue(collector, "error", "recipe.dangling-ingredient", `Recipe ${id} references missing concept ${conceptId}`, {
          ...details,
          path: `ingredients.${slot}`,
          relatedIds: [conceptId]
        });
      } else if (concept.kind !== RECIPE_SLOT_KINDS[slot]) {
        addIssue(collector, "error", "recipe.ingredient-kind-mismatch", `Recipe ${id} slot ${slot} references ${conceptId} (${concept.kind})`, {
          ...details,
          path: `ingredients.${slot}`,
          relatedIds: [conceptId],
          data: { expectedKind: RECIPE_SLOT_KINDS[slot], actualKind: concept.kind }
        });
      }
    });
  });
}

function indexDuplicateIds(items, entityType, collector) {
  const index = new Map();
  items.forEach((item) => {
    const id = String(item?.id || "");
    if (!id) return;
    if (!index.has(id)) index.set(id, []);
    index.get(id).push(item);
  });
  index.forEach((group, id) => {
    if (group.length < 2) return;
    addIssue(collector, "error", `${entityType}.duplicate-id`, `${entityType} id ${id} appears ${group.length} times`, {
      entityType,
      id,
      relatedIds: group.map((item) => item.id),
      data: { count: group.length }
    });
  });
  return index;
}

function conceptsCanShareTarget(left, right, context) {
  const leftBases = asArray(left.compatibility?.bases);
  const rightBases = asArray(right.compatibility?.bases);
  const leftCheckpoints = asArray(left.compatibility?.checkpointIds);
  const rightCheckpoints = asArray(right.compatibility?.checkpointIds);
  const leftUniversal = !leftBases.length && !leftCheckpoints.length;
  const rightUniversal = !rightBases.length && !rightCheckpoints.length;
  if (leftUniversal || rightUniversal) return true;
  if (context.checkpointById.size) {
    const allowed = (bases, checkpointIds) => new Set([...context.checkpointById.values()]
      .filter((checkpoint) => bases.includes(checkpoint.base) || checkpointIds.includes(checkpoint.id))
      .map((checkpoint) => checkpoint.id));
    const leftAllowed = allowed(leftBases, leftCheckpoints);
    const rightAllowed = allowed(rightBases, rightCheckpoints);
    return [...leftAllowed].some((checkpointId) => rightAllowed.has(checkpointId));
  }
  return !leftBases.length || !rightBases.length || leftBases.some((base) => rightBases.includes(base));
}

function checkReferences(catalog, collector, context) {
  catalog.concepts.forEach((concept) => {
    if (!concept || !concept.id) return;
    const required = new Set(asArray(concept.requires));
    const conflicts = new Set(asArray(concept.conflicts));
    required.forEach((reference) => {
      if (reference === concept.id) {
        addIssue(collector, "error", "concept.self-requirement", `Concept ${concept.id} requires itself`, {
          entityType: "concept", id: concept.id, path: "requires"
        });
      } else if (!context.conceptById.has(reference)) {
        addIssue(collector, "error", "concept.dangling-requirement", `Concept ${concept.id} requires missing concept ${reference}`, {
          entityType: "concept", id: concept.id, path: "requires", relatedIds: [reference]
        });
      } else {
        const target = context.conceptById.get(reference);
        if (concept.contentMode === "sfw" && target.contentMode === "adult") {
          addIssue(collector, "error", "concept.content-mode-requirement", `SFW concept ${concept.id} requires adult concept ${reference}`, {
            entityType: "concept", id: concept.id, path: "requires", relatedIds: [reference]
          });
        }
        if (!conceptsCanShareTarget(concept, target, context)) {
          addIssue(collector, "error", "concept.impossible-requirement", `Concept ${concept.id} cannot share a compatible target with required ${reference}`, {
            entityType: "concept", id: concept.id, path: "requires", relatedIds: [reference]
          });
        }
      }
      if (conflicts.has(reference)) {
        addIssue(collector, "error", "concept.require-conflict-overlap", `Concept ${concept.id} both requires and conflicts with ${reference}`, {
          entityType: "concept", id: concept.id, relatedIds: [reference]
        });
      }
    });
    conflicts.forEach((reference) => {
      if (reference === concept.id) {
        addIssue(collector, "error", "concept.self-conflict", `Concept ${concept.id} conflicts with itself`, {
          entityType: "concept", id: concept.id, path: "conflicts"
        });
      } else if (!context.conceptById.has(reference)) {
        addIssue(collector, "error", "concept.dangling-conflict", `Concept ${concept.id} conflicts with missing concept ${reference}`, {
          entityType: "concept", id: concept.id, path: "conflicts", relatedIds: [reference]
        });
      } else if (!asArray(context.conceptById.get(reference).conflicts).includes(concept.id)) {
        addIssue(collector, "info", "concept.asymmetric-conflict", `Conflict ${concept.id} -> ${reference} is not symmetric`, {
          entityType: "concept", id: concept.id, path: "conflicts", relatedIds: [reference]
        });
      }
    });
  });

  catalog.recipes.forEach((recipe) => {
    asArray(recipe?.conflicts).forEach((reference) => {
      if (!context.conceptById.has(reference) && !context.recipeById.has(reference)) {
        addIssue(collector, "error", "recipe.dangling-conflict", `Recipe ${recipe.id} conflicts with missing id ${reference}`, {
          entityType: "recipe", id: recipe.id, path: "conflicts", relatedIds: [reference]
        });
      }
    });
    if (asArray(recipe?.contentModes).includes("sfw")) {
      Object.values(recipe?.ingredients || {}).flat().forEach((reference) => {
        if (context.conceptById.get(reference)?.contentMode === "adult") {
          addIssue(collector, "error", "recipe.content-mode-leak", `SFW recipe ${recipe.id} includes adult concept ${reference}`, {
            entityType: "recipe", id: recipe.id, path: "ingredients", relatedIds: [reference]
          });
        }
      });
    }
  });
}

function checkRequirementCycles(catalog, collector, context) {
  const state = new Map();
  const stack = [];
  const stackIndex = new Map();
  const reported = new Set();

  function visit(id) {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) return;
    state.set(id, 1);
    stackIndex.set(id, stack.length);
    stack.push(id);
    const item = context.conceptById.get(id);
    asArray(item?.requires).filter((reference) => context.conceptById.has(reference)).sort().forEach((reference) => {
      if (state.get(reference) === 1) {
        const cycle = [...stack.slice(stackIndex.get(reference)), reference];
        const key = [...new Set(cycle)].sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          addIssue(collector, "error", "concept.requirement-cycle", `Concept requirement cycle: ${cycle.join(" -> ")}`, {
            entityType: "concept", id, path: "requires", relatedIds: cycle
          });
        }
      } else {
        visit(reference);
      }
    });
    stack.pop();
    stackIndex.delete(id);
    state.set(id, 2);
  }

  catalog.concepts.map((item) => item?.id).filter(Boolean).sort().forEach(visit);
}

function checkExactDuplicates(catalog, collector) {
  const promptIndex = new Map();
  const aliasIndex = new Map();
  catalog.concepts.forEach((concept) => {
    const prompt = normalizeText(concept?.promptForms?.default);
    if (prompt) {
      if (!promptIndex.has(prompt)) promptIndex.set(prompt, []);
      promptIndex.get(prompt).push(concept);
    }
    uniqueStrings(concept?.aliases).forEach((alias) => {
      const normalized = normalizeText(alias);
      if (!normalized) return;
      if (!aliasIndex.has(normalized)) aliasIndex.set(normalized, []);
      aliasIndex.get(normalized).push(concept);
    });
  });

  promptIndex.forEach((group, prompt) => {
    if (group.length < 2) return;
    const kinds = [...new Set(group.map((item) => item.kind))];
    const severity = kinds.length === 1 ? "warning" : "info";
    const code = kinds.length === 1 ? "concept.duplicate-prompt" : "concept.cross-kind-prompt";
    addIssue(collector, severity, code, `Prompt "${prompt}" is shared by ${group.length} concepts`, {
      entityType: "concept",
      id: group[0].id,
      relatedIds: group.map((item) => item.id),
      data: { prompt, kinds }
    });
  });

  aliasIndex.forEach((group, alias) => {
    const uniqueItems = [...new Map(group.map((item) => [item.id, item])).values()];
    if (uniqueItems.length < 2) return;
    const kinds = [...new Set(uniqueItems.map((item) => item.kind))];
    addIssue(collector, kinds.length === 1 ? "warning" : "info", kinds.length === 1 ? "concept.alias-collision" : "concept.alias-cross-kind", `Alias "${alias}" resolves to ${uniqueItems.length} concepts`, {
      entityType: "concept",
      id: uniqueItems[0].id,
      relatedIds: uniqueItems.map((item) => item.id),
      data: { alias, kinds }
    });
  });

  const entityAliasIndex = new Map();
  catalog.entities.forEach((entity) => uniqueStrings(entity?.aliases).forEach((alias) => {
    const normalized = normalizeText(alias);
    if (!normalized) return;
    if (!entityAliasIndex.has(normalized)) entityAliasIndex.set(normalized, []);
    entityAliasIndex.get(normalized).push(entity);
  }));
  entityAliasIndex.forEach((group, alias) => {
    const uniqueItems = [...new Map(group.map((item) => [item.id, item])).values()];
    if (uniqueItems.length < 2) return;
    addIssue(collector, "error", "entity.alias-collision", `Entity alias "${alias}" resolves to ${uniqueItems.length} named entities`, {
      entityType: "entity",
      id: uniqueItems[0].id,
      relatedIds: uniqueItems.map((item) => item.id),
      data: { alias }
    });
  });
  entityAliasIndex.forEach((entities, alias) => {
    const concepts = aliasIndex.get(alias);
    if (!concepts?.length) return;
    addIssue(collector, "warning", "entity.concept-alias-collision", `Named-entity alias "${alias}" also resolves to ${concepts.length} concepts`, {
      entityType: "entity",
      id: entities[0].id,
      relatedIds: [...entities.map((item) => item.id), ...concepts.map((item) => item.id)],
      data: { alias }
    });
  });

  const recipeAliasIndex = new Map();
  catalog.recipes.forEach((recipe) => uniqueStrings([...asArray(recipe?.aliases), ...asArray(recipe?.triggers)]).forEach((alias) => {
    const normalized = normalizeText(alias);
    if (!normalized) return;
    if (!recipeAliasIndex.has(normalized)) recipeAliasIndex.set(normalized, []);
    recipeAliasIndex.get(normalized).push(recipe);
  }));
  recipeAliasIndex.forEach((group, alias) => {
    const uniqueItems = [...new Map(group.map((item) => [item.id, item])).values()];
    if (uniqueItems.length < 2) return;
    const families = [...new Set(uniqueItems.map((item) => item.familyId || "foundation"))];
    addIssue(collector, families.length > 1 ? "warning" : "info", families.length > 1 ? "recipe.alias-cross-family" : "recipe.alias-same-family", `Recipe alias "${alias}" resolves to ${uniqueItems.length} recipes`, {
      entityType: "recipe",
      id: uniqueItems[0].id,
      relatedIds: uniqueItems.map((item) => item.id),
      data: { alias, families }
    });
  });
}

function checkGlobalIdCollisions(catalog, collector) {
  const owners = new Map();
  [
    ["checkpoint", catalog.checkpoints],
    ["entity", catalog.entities],
    ["concept", catalog.concepts],
    ["recipe", catalog.recipes]
  ].forEach(([entityType, items]) => items.forEach((item) => {
    const id = String(item?.id || "");
    if (!id) return;
    if (!owners.has(id)) owners.set(id, []);
    owners.get(id).push(entityType);
  }));
  owners.forEach((types, id) => {
    const uniqueTypes = [...new Set(types)];
    if (uniqueTypes.length < 2) return;
    addIssue(collector, "warning", "catalog.cross-type-id-collision", `Id ${id} is reused by ${uniqueTypes.join(", ")}`, {
      entityType: "catalog", id, data: { types: uniqueTypes }
    });
  });
}

function checkCheckpointNameCollisions(catalog, collector) {
  const names = new Map();
  catalog.checkpoints.forEach((checkpoint) => {
    const name = normalizeText(checkpoint?.name);
    if (!name) return;
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(checkpoint);
  });
  names.forEach((items, name) => {
    if (items.length < 2) return;
    addIssue(collector, "warning", "checkpoint.duplicate-name", `Checkpoint name "${name}" is shared by ${items.length} profiles`, {
      entityType: "checkpoint",
      id: items[0].id,
      relatedIds: items.map((item) => item.id),
      data: { name }
    });
  });
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  a.forEach((token) => {
    if (b.has(token)) intersection += 1;
  });
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function checkNearDuplicates(catalog, collector, options = {}) {
  const threshold = Math.min(0.99, Math.max(0.5, Number(options.nearDuplicateThreshold) || 0.9));
  const maxPosting = Math.max(20, Number(options.maxNearDuplicatePosting) || 400);
  const maxPairs = Math.max(1000, Number(options.maxNearDuplicatePairs) || 250000);
  const maxResults = Math.max(1, Number(options.maxNearDuplicateIssues) || 1000);
  const records = catalog.concepts.map((item, index) => ({
    item,
    index,
    normalized: normalizeText(item?.promptForms?.default),
    tokens: tokenize(item?.promptForms?.default)
  })).filter((record) => record.normalized && record.tokens.length >= 2);
  const postings = new Map();
  records.forEach((record) => record.tokens.forEach((token) => {
    const key = `${record.item.kind}\u0000${token}`;
    if (!postings.has(key)) postings.set(key, []);
    postings.get(key).push(record.index);
  }));

  const pairShared = new Map();
  let budgetExceeded = false;
  const sortedPostingKeys = [...postings.keys()].sort();
  for (const key of sortedPostingKeys) {
    const ids = postings.get(key);
    if (ids.length > maxPosting) continue;
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const pairKey = `${ids[left]}:${ids[right]}`;
        pairShared.set(pairKey, (pairShared.get(pairKey) || 0) + 1);
        if (pairShared.size > maxPairs) {
          budgetExceeded = true;
          break;
        }
      }
      if (budgetExceeded) break;
    }
    if (budgetExceeded) break;
  }
  if (budgetExceeded) {
    addIssue(collector, "warning", "analysis.near-duplicate-budget", `Near-duplicate analysis reached its ${maxPairs}-pair budget`, {
      entityType: "catalog",
      data: { maxPairs, maxPosting }
    });
  }

  const byIndex = new Map(records.map((record) => [record.index, record]));
  const matches = [];
  pairShared.forEach((shared, pairKey) => {
    const [leftId, rightId] = pairKey.split(":").map(Number);
    const left = byIndex.get(leftId);
    const right = byIndex.get(rightId);
    if (!left || !right || left.normalized === right.normalized) return;
    const minimumNeeded = Math.ceil((threshold * (left.tokens.length + right.tokens.length)) / (1 + threshold));
    if (shared < minimumNeeded) return;
    const similarity = jaccard(left.tokens, right.tokens);
    if (similarity < threshold) return;
    matches.push({ left, right, similarity });
  });
  matches.sort((a, b) => b.similarity - a.similarity || a.left.item.id.localeCompare(b.left.item.id) || a.right.item.id.localeCompare(b.right.item.id));
  matches.slice(0, maxResults).forEach((match) => {
    addIssue(collector, match.similarity >= 0.95 ? "warning" : "info", "concept.near-duplicate-prompt", `${match.left.item.id} and ${match.right.item.id} are ${(match.similarity * 100).toFixed(1)}% token-similar`, {
      entityType: "concept",
      id: match.left.item.id,
      relatedIds: [match.right.item.id],
      data: {
        similarity: Number(match.similarity.toFixed(4)),
        left: match.left.item.promptForms.default,
        right: match.right.item.promptForms.default
      }
    });
  });
  if (matches.length > maxResults) {
    addIssue(collector, "info", "analysis.near-duplicate-results-truncated", `${matches.length - maxResults} near-duplicate matches were omitted`, {
      entityType: "catalog",
      data: { totalMatches: matches.length, maxResults }
    });
  }
  return { candidatePairs: pairShared.size, matches: matches.length, threshold, budgetExceeded };
}

function increment(target, key, amount = 1) {
  const name = String(key || "unknown");
  target[name] = (target[name] || 0) + amount;
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function buildCoverageReport(input) {
  const catalog = normalizeCatalog(input);
  const byKind = {};
  const byContentMode = {};
  const byKindAndMode = {};
  const declaredByBase = { universal: 0 };
  const effectiveByBase = Object.fromEntries(KNOWN_BASES.map((base) => [base, 0]));
  const declaredByCheckpoint = {};
  const effectiveByCheckpoint = Object.fromEntries(catalog.checkpoints.map((item) => [item.id, 0]));
  const byProvenanceSource = {};
  const byProvenanceFamily = {};
  const recipesByFamily = {};
  const entitiesByNamespace = {};
  const checkpointsByBase = {};
  const checkpointsByType = {};
  let conceptsWithRequirements = 0;
  let conceptsWithConflicts = 0;
  let customPromptForms = 0;

  catalog.checkpoints.forEach((checkpoint) => {
    increment(checkpointsByBase, checkpoint.base);
    increment(checkpointsByType, checkpoint.type);
  });
  catalog.entities.forEach((entity) => increment(entitiesByNamespace, entity.namespace));
  catalog.concepts.forEach((concept) => {
    increment(byKind, concept.kind);
    increment(byContentMode, concept.contentMode);
    if (!byKindAndMode[concept.kind]) byKindAndMode[concept.kind] = {};
    increment(byKindAndMode[concept.kind], concept.contentMode);
    if (asArray(concept.requires).length) conceptsWithRequirements += 1;
    if (asArray(concept.conflicts).length) conceptsWithConflicts += 1;
    customPromptForms += Math.max(0, Object.keys(concept.promptForms || {}).length - 1);
    increment(byProvenanceSource, concept.provenance?.source || "foundation");
    increment(byProvenanceFamily, concept.provenance?.family || "foundation");

    const bases = asArray(concept.compatibility?.bases);
    const checkpointIds = asArray(concept.compatibility?.checkpointIds);
    if (!bases.length && !checkpointIds.length) increment(declaredByBase, "universal");
    bases.forEach((base) => increment(declaredByBase, base));
    checkpointIds.forEach((id) => increment(declaredByCheckpoint, id));
    KNOWN_BASES.forEach((base) => {
      if ((!bases.length && !checkpointIds.length) || bases.includes(base)) increment(effectiveByBase, base);
    });
    catalog.checkpoints.forEach((checkpoint) => {
      if ((!bases.length && !checkpointIds.length) || checkpointIds.includes(checkpoint.id) || bases.includes(checkpoint.base)) {
        increment(effectiveByCheckpoint, checkpoint.id);
      }
    });
  });
  catalog.recipes.forEach((recipe) => increment(recipesByFamily, recipe.familyId || recipe.provenance?.family || "foundation"));

  return {
    schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
    totals: {
      checkpoints: catalog.checkpoints.length,
      entities: catalog.entities.length,
      concepts: catalog.concepts.length,
      recipes: catalog.recipes.length,
      adultConcepts: byContentMode.adult || 0,
      conceptsWithRequirements,
      conceptsWithConflicts,
      customPromptForms
    },
    concepts: {
      byKind: sortedRecord(byKind),
      byContentMode: sortedRecord(byContentMode),
      byKindAndMode: Object.fromEntries(Object.entries(byKindAndMode).sort(([a], [b]) => a.localeCompare(b)).map(([kind, modes]) => [kind, sortedRecord(modes)])),
      declaredByBase: sortedRecord(declaredByBase),
      effectiveByBase: sortedRecord(effectiveByBase),
      declaredByCheckpoint: sortedRecord(declaredByCheckpoint),
      effectiveByCheckpoint: sortedRecord(effectiveByCheckpoint),
      byProvenanceSource: sortedRecord(byProvenanceSource),
      byProvenanceFamily: sortedRecord(byProvenanceFamily)
    },
    recipes: { byFamily: sortedRecord(recipesByFamily) },
    entities: { byNamespace: sortedRecord(entitiesByNamespace) },
    checkpoints: {
      byBase: sortedRecord(checkpointsByBase),
      byType: sortedRecord(checkpointsByType)
    }
  };
}

function assessCatalogQuality(input, structuralSummary = {}) {
  const catalog = normalizeCatalog(input);
  const concepts = catalog.concepts;
  const normalizedPrompts = concepts.map((item) => normalizeText(item?.promptForms?.default)).filter(Boolean);
  const uniquePrompts = new Set(normalizedPrompts);
  const aliasCovered = concepts.filter((item) => asArray(item?.aliases).some((alias) => normalizeText(alias))).length;
  const provenanceCovered = concepts.filter((item) => item?.provenance && typeof item.provenance === "object").length;
  const completeRecipes = catalog.recipes.filter((recipe) => asArray(recipe?.requiredSlots).every((slot) => asArray(recipe?.ingredients?.[slot]).length)).length;
  const familyIndex = new Map();
  concepts.forEach((item) => {
    const family = String(item?.provenance?.family || "foundation");
    if (!familyIndex.has(family)) familyIndex.set(family, []);
    familyIndex.get(family).push(item);
  });
  const families = [...familyIndex.entries()].map(([family, items]) => {
    const prompts = items.map((item) => normalizeText(item?.promptForms?.default)).filter(Boolean);
    const tokens = prompts.flatMap(tokenize);
    const uniqueFamilyPrompts = new Set(prompts).size;
    const uniqueTokens = new Set(tokens).size;
    return {
      family,
      concepts: items.length,
      promptUniqueness: prompts.length ? Number((uniqueFamilyPrompts / prompts.length).toFixed(4)) : 0,
      lexicalDiversity: tokens.length ? Number((uniqueTokens / tokens.length).toFixed(4)) : 0,
      averagePromptTokens: prompts.length ? Number((tokens.length / prompts.length).toFixed(2)) : 0
    };
  }).sort((a, b) => b.concepts - a.concepts || a.family.localeCompare(b.family));
  const errorCount = Number(structuralSummary.error || 0);
  const structuralRatio = concepts.length ? Math.max(0, 1 - (errorCount / concepts.length)) : (errorCount ? 0 : 1);
  const uniquenessRatio = normalizedPrompts.length ? uniquePrompts.size / normalizedPrompts.length : 1;
  const aliasRatio = concepts.length ? aliasCovered / concepts.length : 1;
  const provenanceRatio = concepts.length ? provenanceCovered / concepts.length : 1;
  const recipeRatio = catalog.recipes.length ? completeRecipes / catalog.recipes.length : 1;
  const score = Number((
    structuralRatio * 40
    + uniquenessRatio * 25
    + aliasRatio * 15
    + provenanceRatio * 10
    + recipeRatio * 10
  ).toFixed(1));
  return {
    schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
    score,
    ratios: {
      structurallyValid: Number(structuralRatio.toFixed(4)),
      canonicalPromptUniqueness: Number(uniquenessRatio.toFixed(4)),
      aliasCoverage: Number(aliasRatio.toFixed(4)),
      provenanceCoverage: Number(provenanceRatio.toFixed(4)),
      completeRequiredRecipeSlots: Number(recipeRatio.toFixed(4))
    },
    families,
    risks: families.filter((item) => item.concepts >= 25 && item.promptUniqueness < 0.98).map((item) => ({
      code: "family-prompt-repetition",
      family: item.family,
      concepts: item.concepts,
      promptUniqueness: item.promptUniqueness
    }))
  };
}

function applyCoveragePolicy(coverage, collector, suppliedPolicy = {}) {
  const policy = {
    minimums: { ...DEFAULT_POLICY.minimums, ...(suppliedPolicy.minimums || {}) },
    minimumConceptsByKind: { ...DEFAULT_POLICY.minimumConceptsByKind, ...(suppliedPolicy.minimumConceptsByKind || {}) },
    requiredCheckpointBases: suppliedPolicy.requiredCheckpointBases || DEFAULT_POLICY.requiredCheckpointBases,
    coverageSeverity: suppliedPolicy.coverageSeverity || DEFAULT_POLICY.coverageSeverity
  };
  Object.entries(policy.minimums).forEach(([key, minimum]) => {
    const actual = Number(coverage.totals[key] || 0);
    if (actual >= Number(minimum)) return;
    addIssue(collector, policy.coverageSeverity, "coverage.minimum-not-met", `Coverage ${key} is ${actual}; policy requires ${minimum}`, {
      entityType: "coverage",
      id: key,
      data: { actual, minimum: Number(minimum) }
    });
  });
  Object.entries(policy.minimumConceptsByKind).forEach(([kind, minimum]) => {
    const actual = Number(coverage.concepts.byKind[kind] || 0);
    if (actual >= Number(minimum)) return;
    addIssue(collector, policy.coverageSeverity, "coverage.kind-minimum-not-met", `Concept kind ${kind} has ${actual}; policy requires ${minimum}`, {
      entityType: "coverage",
      id: kind,
      data: { actual, minimum: Number(minimum) }
    });
  });
  policy.requiredCheckpointBases.forEach((base) => {
    if (coverage.checkpoints.byBase[base]) return;
    addIssue(collector, policy.coverageSeverity, "coverage.missing-checkpoint-base", `No checkpoint profile covers ${base}`, {
      entityType: "coverage",
      id: base
    });
  });
  return policy;
}

function auditCatalog(input, options = {}) {
  const catalog = normalizeCatalog(input);
  const collector = createCollector(options.maxIssues);
  const checkpointById = new Map(catalog.checkpoints.filter(Boolean).map((item) => [item.id, item]));
  const conceptById = new Map(catalog.concepts.filter(Boolean).map((item) => [item.id, item]));
  const recipeById = new Map(catalog.recipes.filter(Boolean).map((item) => [item.id, item]));
  const context = {
    checkpointIds: new Set(checkpointById.keys()),
    bases: new Set([...KNOWN_BASES, ...catalog.checkpoints.map((item) => item?.base).filter(Boolean)]),
    checkpointById,
    conceptById,
    recipeById
  };

  indexDuplicateIds(catalog.checkpoints, "checkpoint", collector);
  indexDuplicateIds(catalog.entities, "entity", collector);
  indexDuplicateIds(catalog.concepts, "concept", collector);
  indexDuplicateIds(catalog.recipes, "recipe", collector);
  checkGlobalIdCollisions(catalog, collector);
  checkCheckpointNameCollisions(catalog, collector);
  catalog.checkpoints.forEach((item) => validateCheckpoint(item, collector));
  catalog.entities.forEach((item) => validateEntity(item, collector));
  catalog.concepts.forEach((item) => validateConcept(item, collector, context));
  catalog.recipes.forEach((item) => validateRecipe(item, collector, context));
  checkReferences(catalog, collector, context);
  checkRequirementCycles(catalog, collector, context);
  checkExactDuplicates(catalog, collector);
  const nearDuplicates = options.nearDuplicates === false
    ? { skipped: true, candidatePairs: 0, matches: 0 }
    : checkNearDuplicates(catalog, collector, options);
  const coverage = buildCoverageReport(catalog);
  const policy = options.applyPolicy === false ? null : applyCoveragePolicy(coverage, collector, options.policy || {});
  const quality = assessCatalogQuality(catalog, collector.counts);
  quality.risks.forEach((risk) => addIssue(collector, "warning", "quality.family-prompt-repetition", `Family ${risk.family} contains repeated canonical prompts`, {
    entityType: "quality",
    id: risk.family,
    data: risk
  }));
  sortIssues(collector.issues);

  const canonicalCatalog = {
    schemaVersion: catalog.schemaVersion,
    checkpoints: catalog.checkpoints,
    entities: catalog.entities,
    concepts: catalog.concepts,
    recipes: catalog.recipes
  };
  return {
    schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
    valid: collector.counts.error === 0,
    fingerprint: fingerprint(canonicalCatalog),
    summary: {
      ...collector.counts,
      total: collector.total,
      retained: collector.issues.length,
      truncated: collector.truncated
    },
    catalog: coverage.totals,
    analysis: { nearDuplicates },
    coverage,
    quality,
    policy,
    issues: collector.issues
  };
}

function normalizeAxisOption(option) {
  if (typeof option === "string" || typeof option === "number") {
    return { value: String(option), aliases: [], traits: [] };
  }
  if (!option || typeof option !== "object" || Array.isArray(option)) return { value: "", aliases: [], traits: [] };
  return {
    value: String(option.value ?? ""),
    aliases: uniqueStrings(option.aliases),
    traits: uniqueStrings(option.traits)
  };
}

function selectorMatches(selector, combination) {
  return Object.entries(selector || {}).every(([axis, expected]) => {
    const allowed = Array.isArray(expected) ? expected.map(String) : [String(expected)];
    return allowed.includes(String(combination[axis]?.value ?? ""));
  });
}

function combinationAllowed(combination, matrix) {
  if (asArray(matrix.include).length && !matrix.include.some((selector) => selectorMatches(selector, combination))) return false;
  if (asArray(matrix.exclude).some((selector) => selectorMatches(selector, combination))) return false;
  for (const constraint of asArray(matrix.constraints)) {
    if (!selectorMatches(constraint.when || {}, combination)) continue;
    if (constraint.require && !selectorMatches(constraint.require, combination)) return false;
    if (constraint.forbid && selectorMatches(constraint.forbid, combination)) return false;
  }
  return true;
}

function validateSelector(selector, axisOptions, errors, location) {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    errors.push(`${location} must be an object`);
    return;
  }
  Object.entries(selector).forEach(([axis, expected]) => {
    if (!axisOptions[axis]) {
      errors.push(`${location} references unknown axis ${axis}`);
      return;
    }
    const values = Array.isArray(expected) ? expected : [expected];
    if (!values.length) errors.push(`${location}.${axis} must include at least one value`);
    values.forEach((value) => {
      if (!axisOptions[axis].has(String(value))) {
        errors.push(`${location}.${axis} references unknown value ${value}`);
      }
    });
  });
}

function renderTemplate(template, combination, errors, location) {
  const unknown = new Set();
  const rendered = String(template || "").replace(/\{([a-zA-Z0-9_-]+)\}/g, (_match, axis) => {
    if (!Object.prototype.hasOwnProperty.call(combination, axis)) {
      unknown.add(axis);
      return "";
    }
    return combination[axis].value;
  }).replace(/\s+/g, " ").trim();
  unknown.forEach((axis) => errors.push(`${location} references unknown axis {${axis}}`));
  return rendered;
}

function expandMatrix(matrix, errors, options = {}) {
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) {
    errors.push("Every matrix must be an object");
    return [];
  }
  const matrixId = String(matrix.id || "matrix");
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(matrixId)) errors.push(`Matrix ${matrixId} id must be a stable lowercase identifier`);
  if (!contracts.KNOWLEDGE_KINDS.includes(matrix.kind)) errors.push(`Matrix ${matrixId} uses unknown kind ${matrix.kind}`);
  if (typeof matrix.template !== "string" || !matrix.template.trim()) errors.push(`Matrix ${matrixId} requires a template`);
  ["aliasTemplates", "include", "exclude", "constraints"].forEach((field) => {
    if (matrix[field] !== undefined && !Array.isArray(matrix[field])) errors.push(`Matrix ${matrixId} ${field} must be an array`);
  });
  const axes = matrix.axes && typeof matrix.axes === "object" && !Array.isArray(matrix.axes) ? matrix.axes : {};
  const axisNames = Object.keys(axes).sort();
  if (!axisNames.length) errors.push(`Matrix ${matrixId} requires at least one axis`);
  const axisValues = {};
  axisNames.forEach((axis) => {
    if (!Array.isArray(axes[axis])) errors.push(`Matrix ${matrixId} axis ${axis} must be an array`);
    axisValues[axis] = asArray(axes[axis]).map(normalizeAxisOption).filter((item) => item.value.trim());
    if (!axisValues[axis].length) errors.push(`Matrix ${matrixId} axis ${axis} has no usable values`);
    const normalizedValues = new Set();
    axisValues[axis].forEach((item) => {
      const normalized = normalizeText(item.value);
      if (normalizedValues.has(normalized)) errors.push(`Matrix ${matrixId} axis ${axis} repeats value ${item.value}`);
      normalizedValues.add(normalized);
    });
  });
  if (errors.length) return [];
  const axisOptions = Object.fromEntries(axisNames.map((axis) => [axis, new Set(axisValues[axis].map((item) => item.value))]));
  asArray(matrix.include).forEach((selector, index) => validateSelector(selector, axisOptions, errors, `Matrix ${matrixId} include[${index}]`));
  asArray(matrix.exclude).forEach((selector, index) => validateSelector(selector, axisOptions, errors, `Matrix ${matrixId} exclude[${index}]`));
  asArray(matrix.constraints).forEach((constraint, index) => {
    if (!constraint || typeof constraint !== "object" || Array.isArray(constraint)) {
      errors.push(`Matrix ${matrixId} constraints[${index}] must be an object`);
      return;
    }
    validateSelector(constraint.when || {}, axisOptions, errors, `Matrix ${matrixId} constraints[${index}].when`);
    if (constraint.require !== undefined) validateSelector(constraint.require, axisOptions, errors, `Matrix ${matrixId} constraints[${index}].require`);
    if (constraint.forbid !== undefined) validateSelector(constraint.forbid, axisOptions, errors, `Matrix ${matrixId} constraints[${index}].forbid`);
    if (constraint.require === undefined && constraint.forbid === undefined) {
      errors.push(`Matrix ${matrixId} constraints[${index}] needs require or forbid`);
    }
  });
  if (errors.length) return [];
  const theoretical = axisNames.reduce((total, axis) => total * axisValues[axis].length, 1);
  const maxCombinations = Math.max(1, Number(matrix.maxCombinations || options.maxMatrixCombinations) || 5000);
  if (theoretical > maxCombinations) {
    errors.push(`Matrix ${matrixId} expands to ${theoretical} combinations; limit is ${maxCombinations}`);
    return [];
  }

  const combinations = [];
  function visit(index, current) {
    if (index >= axisNames.length) {
      if (combinationAllowed(current, matrix)) combinations.push({ ...current });
      return;
    }
    const axis = axisNames[index];
    axisValues[axis].forEach((value) => visit(index + 1, { ...current, [axis]: value }));
  }
  visit(0, {});
  if (!combinations.length) errors.push(`Matrix ${matrixId} produced no allowed combinations`);
  return combinations.map((combination, index) => ({
    matrix,
    combination,
    prompt: renderTemplate(matrix.template, combination, errors, `Matrix ${matrixId}`),
    aliases: asArray(matrix.aliasTemplates).map((template) => renderTemplate(template, combination, errors, `Matrix ${matrixId} aliasTemplates`)).filter(Boolean),
    index
  }));
}

function mergeCompatibility(...sources) {
  const bases = [];
  const checkpointIds = [];
  sources.filter(Boolean).forEach((source) => {
    bases.push(...asArray(source.bases || source.compatibility?.bases));
    checkpointIds.push(...asArray(source.checkpointIds || source.compatibility?.checkpointIds));
  });
  return { bases: uniqueStrings(bases), checkpointIds: uniqueStrings(checkpointIds) };
}

function createPackConcept(raw, context) {
  const prompt = String(raw.prompt ?? raw.promptForms?.default ?? "").replace(/\s+/g, " ").trim();
  const kind = String(raw.kind || "");
  const id = String(raw.id || `${context.packId}.${kind}.${slug(prompt)}`);
  const defaults = context.defaults || {};
  const aliases = uniqueStrings([prompt, ...asArray(defaults.aliases), ...asArray(raw.aliases)]);
  const compatibility = mergeCompatibility(defaults, raw);
  return {
    schemaVersion: contracts.SCHEMA_VERSION,
    id,
    kind,
    label: String(raw.label || prompt),
    aliases,
    promptForms: { default: prompt, ...(defaults.promptForms || {}), ...(raw.promptForms || {}) },
    compatibility,
    requires: uniqueStrings([...(asArray(defaults.requires)), ...(asArray(raw.requires))]),
    conflicts: uniqueStrings([...(asArray(defaults.conflicts)), ...(asArray(raw.conflicts))]),
    contentMode: raw.contentMode || defaults.contentMode || "sfw",
    group: String(raw.group ?? defaults.group ?? ""),
    priority: Number(raw.priority ?? defaults.priority ?? 0),
    traits: uniqueStrings([...(asArray(defaults.traits)), ...(asArray(raw.traits))]),
    provenance: {
      source: String(raw.source || defaults.source || context.source || context.packId),
      family: String(raw.family || defaults.family || context.family || "direct"),
      packId: context.packId,
      ruleId: String(raw.provenanceRuleId || "direct"),
      sourceValues: raw.provenanceValues && typeof raw.provenanceValues === "object"
        ? stableValue(raw.provenanceValues)
        : {}
    }
  };
}

function compilePack(packInput, options = {}) {
  const errors = [];
  const pack = packInput && typeof packInput === "object" && !Array.isArray(packInput) ? packInput : {};
  const packId = String(pack.packId || "");
  if (pack.schemaVersion !== PACK_SCHEMA_VERSION) errors.push(`Pack schemaVersion must equal ${PACK_SCHEMA_VERSION}`);
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(packId)) errors.push("Pack packId must be a stable lowercase identifier");
  if (pack.entries !== undefined && !Array.isArray(pack.entries)) errors.push("Pack entries must be an array");
  if (pack.matrices !== undefined && !Array.isArray(pack.matrices)) errors.push("Pack matrices must be an array");
  if (pack.defaults !== undefined && (!pack.defaults || typeof pack.defaults !== "object" || Array.isArray(pack.defaults))) {
    errors.push("Pack defaults must be an object");
  }
  const defaults = pack.defaults && typeof pack.defaults === "object" && !Array.isArray(pack.defaults) ? pack.defaults : {};
  const source = String(pack.source || packId);
  const rawEntries = asArray(pack.entries).map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`Pack entries[${index}] must be an object`);
      return {};
    }
    return { ...entry };
  });
  const matrixIds = new Set();
  asArray(pack.matrices).forEach((matrix) => {
    const matrixId = String(matrix?.id || "");
    if (matrixIds.has(matrixId)) errors.push(`Pack repeats matrix id ${matrixId || "<missing>"}`);
    matrixIds.add(matrixId);
    const matrixErrors = [];
    const expanded = expandMatrix(matrix, matrixErrors, options);
    errors.push(...matrixErrors);
    expanded.forEach(({ combination, prompt, aliases }) => {
      const axisTraits = Object.values(combination).flatMap((item) => item.traits);
      const axisAliases = Object.values(combination).flatMap((item) => item.aliases);
      rawEntries.push({
        ...(matrix.defaults || {}),
        kind: matrix.kind,
        prompt,
        aliases: uniqueStrings([...axisAliases, ...aliases, ...asArray(matrix.aliases)]),
        traits: uniqueStrings([...axisTraits, ...asArray(matrix.traits)]),
        contentMode: matrix.contentMode,
        bases: matrix.bases,
        checkpointIds: matrix.checkpointIds,
        requires: matrix.requires,
        conflicts: matrix.conflicts,
        group: matrix.group,
        priority: matrix.priority,
        family: matrix.family || matrix.id || "matrix",
        provenanceRuleId: matrix.id || "matrix",
        provenanceValues: Object.fromEntries(Object.entries(combination).map(([axis, value]) => [axis, value.value]))
      });
    });
  });

  const maxPackConcepts = Math.max(1, Number(options.maxPackConcepts) || 50000);
  if (rawEntries.length > maxPackConcepts) errors.push(`Pack expands to ${rawEntries.length} concepts; limit is ${maxPackConcepts}`);
  if (!rawEntries.length) errors.push("Pack produces no concepts");

  const concepts = rawEntries.map((entry) => createPackConcept(entry, { packId, defaults, source }));
  concepts.sort((a, b) => a.id.localeCompare(b.id));
  const idIndex = new Map();
  const promptIndex = new Map();
  concepts.forEach((concept) => {
    if (idIndex.has(concept.id)) errors.push(`Pack repeats concept id ${concept.id}`);
    idIndex.set(concept.id, concept);
    const promptKey = `${concept.kind}\u0000${normalizeText(concept.promptForms.default)}`;
    if (promptIndex.has(promptKey)) errors.push(`Pack repeats ${concept.kind} prompt "${concept.promptForms.default}"`);
    promptIndex.set(promptKey, concept);
  });

  const existing = options.existingCatalog === false
    ? normalizeCatalog({})
    : normalizeCatalog(options.existingCatalog || currentCatalog());
  const existingIds = new Set(existing.concepts.map((item) => item.id));
  const existingPrompts = new Map(existing.concepts.map((item) => [`${item.kind}\u0000${normalizeText(item.promptForms?.default)}`, item.id]));
  concepts.forEach((concept) => {
    if (existingIds.has(concept.id)) errors.push(`Concept id ${concept.id} already exists in the target catalog`);
    const key = `${concept.kind}\u0000${normalizeText(concept.promptForms.default)}`;
    if (existingPrompts.has(key)) errors.push(`Prompt "${concept.promptForms.default}" duplicates existing ${existingPrompts.get(key)}`);
  });

  const combined = normalizeCatalog({
    schemaVersion: contracts.SCHEMA_VERSION,
    checkpoints: existing.checkpoints,
    entities: existing.entities,
    concepts: [...existing.concepts, ...concepts],
    recipes: existing.recipes
  });
  const generatedIds = new Set(concepts.map((item) => item.id));
  const audit = auditCatalog(combined, {
    nearDuplicates: options.nearDuplicates === true,
    applyPolicy: false,
    maxIssues: options.maxIssues || 10000
  });
  audit.issues.forEach((issue) => {
    const touchesGenerated = generatedIds.has(issue.id) || issue.relatedIds.some((id) => generatedIds.has(id));
    if (touchesGenerated && issue.severity === "error") errors.push(`${issue.code}: ${issue.message}`);
  });
  const uniqueErrors = uniqueStrings(errors);
  const outputCore = {
    schemaVersion: contracts.SCHEMA_VERSION,
    packSchemaVersion: PACK_SCHEMA_VERSION,
    packId,
    source,
    concepts,
    stats: {
      directEntries: asArray(pack.entries).length,
      matrices: asArray(pack.matrices).length,
      generatedConcepts: concepts.length,
      byKind: sortedRecord(concepts.reduce((counts, item) => {
        increment(counts, item.kind);
        return counts;
      }, {}))
    }
  };
  const output = { ...outputCore, fingerprint: fingerprint(outputCore) };
  return {
    schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
    valid: uniqueErrors.length === 0,
    errors: uniqueErrors,
    output,
    audit: {
      summary: audit.summary,
      issues: audit.issues.filter((issue) => generatedIds.has(issue.id) || issue.relatedIds.some((id) => generatedIds.has(id)))
    }
  };
}

function changedFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].sort().filter((key) => stableStringify(before?.[key]) !== stableStringify(after?.[key]));
}

function diffCollection(beforeItems, afterItems) {
  const before = new Map(asArray(beforeItems).filter(Boolean).map((item) => [item.id, item]));
  const after = new Map(asArray(afterItems).filter(Boolean).map((item) => [item.id, item]));
  const added = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changed = [...before.keys()].filter((id) => after.has(id) && stableStringify(before.get(id)) !== stableStringify(after.get(id)))
    .sort()
    .map((id) => ({ id, fields: changedFields(before.get(id), after.get(id)) }));
  return { added, removed, changed, unchanged: before.size - removed.length - changed.length };
}

function diffCatalog(beforeInput, afterInput) {
  const before = normalizeCatalog(beforeInput);
  const after = normalizeCatalog(afterInput);
  const collections = {
    checkpoints: diffCollection(before.checkpoints, after.checkpoints),
    entities: diffCollection(before.entities, after.entities),
    concepts: diffCollection(before.concepts, after.concepts),
    recipes: diffCollection(before.recipes, after.recipes)
  };
  const summary = Object.values(collections).reduce((totals, collection) => ({
    added: totals.added + collection.added.length,
    removed: totals.removed + collection.removed.length,
    changed: totals.changed + collection.changed.length,
    unchanged: totals.unchanged + collection.unchanged
  }), { added: 0, removed: 0, changed: 0, unchanged: 0 });
  return {
    schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
    beforeFingerprint: fingerprint(before),
    afterFingerprint: fingerprint(after),
    summary,
    collections
  };
}

function countDiagnostics(report) {
  const counts = {};
  asArray(report?.issues).forEach((issue) => increment(counts, issue.code));
  return sortedRecord(counts);
}

function compareAuditToBaseline(report, baselineInput = {}) {
  const baseline = baselineInput && typeof baselineInput === "object" ? baselineInput : {};
  const expected = baseline.knownDiagnostics && typeof baseline.knownDiagnostics === "object"
    ? baseline.knownDiagnostics
    : {};
  const actual = countDiagnostics(report);
  const deltas = {};
  const regressions = [];
  new Set([...Object.keys(expected), ...Object.keys(actual)]).forEach((code) => {
    const before = Number(expected[code] || 0);
    const after = Number(actual[code] || 0);
    deltas[code] = { baseline: before, actual: after, delta: after - before };
    if (Object.prototype.hasOwnProperty.call(expected, code) && after > before) {
      regressions.push({ code, baseline: before, actual: after, delta: after - before });
    }
  });
  const allowedStructuralErrors = Number(baseline.structuralErrors || 0);
  if (Number(report?.summary?.error || 0) > allowedStructuralErrors) {
    regressions.push({
      code: "catalog.structural-errors",
      baseline: allowedStructuralErrors,
      actual: Number(report.summary.error || 0),
      delta: Number(report.summary.error || 0) - allowedStructuralErrors
    });
  }
  if (Number(report?.summary?.truncated || 0) > 0) {
    regressions.push({
      code: "catalog.truncated-audit",
      baseline: 0,
      actual: Number(report.summary.truncated),
      delta: Number(report.summary.truncated)
    });
  }
  regressions.sort((a, b) => a.code.localeCompare(b.code));
  return {
    schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
    valid: regressions.length === 0,
    baselineFingerprint: String(baseline.catalogFingerprint || ""),
    currentFingerprint: String(report?.fingerprint || ""),
    qualityDelta: Number((Number(report?.quality?.score || 0) - Number(baseline.catalogQualityScore || 0)).toFixed(1)),
    regressions,
    deltas: Object.fromEntries(Object.entries(deltas).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function formatAuditReport(report) {
  const lines = [
    "PromptBrain Knowledge Audit",
    `Catalog: ${report.catalog.concepts} concepts, ${report.catalog.recipes} recipes, ${report.catalog.checkpoints} checkpoints, ${report.catalog.entities} entities`,
    `Fingerprint: ${report.fingerprint}`,
    `Diagnostics: ${report.summary.error} errors, ${report.summary.warning} warnings, ${report.summary.info} info`,
    `Catalog quality: ${report.quality.score}/100`
  ];
  if (report.analysis.nearDuplicates?.skipped) lines.push("Near duplicates: skipped");
  else lines.push(`Near duplicates: ${report.analysis.nearDuplicates.matches} matches from ${report.analysis.nearDuplicates.candidatePairs} candidate pairs`);
  if (report.baselineComparison) {
    lines.push(`Baseline gate: ${report.baselineComparison.valid ? "passed" : `failed (${report.baselineComparison.regressions.length} regressions)`}`);
  }
  const codes = {};
  report.issues.forEach((issue) => increment(codes, `${issue.severity}:${issue.code}`));
  if (Object.keys(codes).length) {
    lines.push("", "Diagnostics by code:");
    Object.entries(sortedRecord(codes)).forEach(([code, count]) => lines.push(`  ${String(count).padStart(5)}  ${code}`));
  }
  if (report.summary.truncated) lines.push(``, `Warning: ${report.summary.truncated} diagnostics were truncated.`);
  return lines.join("\n");
}

function formatCoverageReport(coverage) {
  const lines = [
    "PromptBrain Knowledge Coverage",
    `Totals: ${coverage.totals.concepts} concepts, ${coverage.totals.recipes} recipes, ${coverage.totals.checkpoints} checkpoints, ${coverage.totals.entities} entities`,
    `Adult concepts: ${coverage.totals.adultConcepts}`,
    "",
    "Concepts by kind:"
  ];
  Object.entries(coverage.concepts.byKind).forEach(([kind, count]) => lines.push(`  ${kind.padEnd(14)} ${count}`));
  lines.push("", "Checkpoints by base:");
  Object.entries(coverage.checkpoints.byBase).forEach(([base, count]) => lines.push(`  ${base.padEnd(14)} ${count}`));
  return lines.join("\n");
}

module.exports = Object.freeze({
  TOOLCHAIN_SCHEMA_VERSION,
  PACK_SCHEMA_VERSION,
  KNOWN_BASES,
  RECIPE_SLOT_KINDS,
  DEFAULT_POLICY,
  normalizeText,
  slug,
  tokenize,
  stableStringify,
  fingerprint,
  normalizeCatalog,
  currentCatalog,
  buildCoverageReport,
  assessCatalogQuality,
  auditCatalog,
  compilePack,
  diffCatalog,
  countDiagnostics,
  compareAuditToBaseline,
  formatAuditReport,
  formatCoverageReport
});
