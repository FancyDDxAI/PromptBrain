(function attachPromptBrainContracts(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainContracts = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createContracts() {
  "use strict";

  const SCHEMA_VERSION = 2;

  const BLOCK_ORDER = Object.freeze([
    "quality",
    "style",
    "subject",
    "anatomy",
    "break",
    "action",
    "interaction",
    "pose",
    "expression",
    "wardrobe",
    "environment",
    "lighting",
    "camera",
    "composition",
    "palette",
    "motifs",
    "effects",
    "loras"
  ]);

  const KNOWLEDGE_KINDS = Object.freeze([
    "quality",
    "style",
    "subject",
    "anatomy",
    "action",
    "interaction",
    "pose",
    "expression",
    "wardrobe",
    "environment",
    "lighting",
    "camera",
    "composition",
    "palette",
    "motif",
    "effect",
    "entity",
    "lora",
    "checkpoint"
  ]);

  const DECISION_SOURCES = Object.freeze([
    "explicit",
    "entity",
    "recipe",
    "memory",
    "inferred",
    "checkpoint",
    "fallback"
  ]);

  const CONTENT_MODES = Object.freeze(["sfw", "adult"]);

  function emptyBlocks() {
    return Object.fromEntries(BLOCK_ORDER
      .filter((name) => name !== "break")
      .map((name) => [name, []]));
  }

  function createPromptIntent(rawText, options = {}) {
    return {
      schemaVersion: SCHEMA_VERSION,
      requestId: options.requestId || "",
      rawText: String(rawText || ""),
      normalizedText: String(options.normalizedText || ""),
      checkpointId: String(options.checkpointId || ""),
      contentMode: CONTENT_MODES.includes(options.contentMode) ? options.contentMode : "sfw",
      vibe: String(options.vibe || "Free"),
      seed: Number.isSafeInteger(options.seed) ? options.seed : 0,
      directives: {
        required: [],
        optional: [],
        forbidden: []
      },
      entities: [],
      participants: [],
      blocks: emptyBlocks(),
      artDirection: {
        requested: false,
        strength: 0,
        recipeIds: [],
        lockedIngredients: {}
      },
      ambiguities: [],
      evidence: []
    };
  }

  function createScenePlan(intent) {
    return {
      schemaVersion: SCHEMA_VERSION,
      requestId: String(intent?.requestId || ""),
      checkpointId: String(intent?.checkpointId || ""),
      contentMode: CONTENT_MODES.includes(intent?.contentMode) ? intent.contentMode : "sfw",
      seed: Number.isSafeInteger(intent?.seed) ? intent.seed : 0,
      participants: Array.isArray(intent?.participants) ? [...intent.participants] : [],
      artRecipe: null,
      blocks: emptyBlocks(),
      locked: [],
      rejected: [],
      warnings: [],
      decisions: []
    };
  }

  function createCompiledPrompt(plan) {
    return {
      schemaVersion: SCHEMA_VERSION,
      checkpointId: String(plan?.checkpointId || ""),
      seed: Number.isSafeInteger(plan?.seed) ? plan.seed : 0,
      positive: "",
      negative: "",
      renderedBlocks: [],
      estimatedTokens: 0,
      warnings: Array.isArray(plan?.warnings) ? [...plan.warnings] : [],
      decisions: Array.isArray(plan?.decisions) ? [...plan.decisions] : []
    };
  }

  function validatePromptIntent(value) {
    const errors = validateBase(value, "PromptIntent");
    requireString(errors, value, "rawText");
    requireString(errors, value, "checkpointId");
    requireEnum(errors, value, "contentMode", CONTENT_MODES);
    requireSafeInteger(errors, value, "seed");
    requireObject(errors, value, "directives");
    requireArray(errors, value, "entities");
    requireArray(errors, value, "participants");
    requireBlocks(errors, value?.blocks);
    requireObject(errors, value, "artDirection");
    return result(errors);
  }

  function validateKnowledgeEntry(value) {
    const errors = validateBase(value, "KnowledgeEntry");
    requireId(errors, value, "id");
    requireEnum(errors, value, "kind", KNOWLEDGE_KINDS);
    requireString(errors, value, "label");
    requireArray(errors, value, "aliases");
    requireObject(errors, value, "promptForms");
    requireObject(errors, value, "compatibility");
    requireArray(errors, value, "requires");
    requireArray(errors, value, "conflicts");
    requireEnum(errors, value, "contentMode", CONTENT_MODES);
    return result(errors);
  }

  function validateArtRecipe(value) {
    const errors = validateBase(value, "ArtRecipe");
    requireId(errors, value, "id");
    requireString(errors, value, "name");
    requireArray(errors, value, "aliases");
    requireArray(errors, value, "contentModes");
    requireObject(errors, value, "ingredients");
    requireArray(errors, value, "requiredSlots");
    requireArray(errors, value, "optionalSlots");
    requireArray(errors, value, "conflicts");
    return result(errors);
  }

  function validateScenePlan(value) {
    const errors = validateBase(value, "ScenePlan");
    requireString(errors, value, "checkpointId");
    requireEnum(errors, value, "contentMode", CONTENT_MODES);
    requireSafeInteger(errors, value, "seed");
    requireArray(errors, value, "participants");
    requireBlocks(errors, value?.blocks);
    requireArray(errors, value, "locked");
    requireArray(errors, value, "rejected");
    requireArray(errors, value, "warnings");
    requireArray(errors, value, "decisions");
    return result(errors);
  }

  function validateCompiledPrompt(value) {
    const errors = validateBase(value, "CompiledPrompt");
    requireString(errors, value, "checkpointId");
    requireSafeInteger(errors, value, "seed");
    requireString(errors, value, "positive");
    requireString(errors, value, "negative");
    requireArray(errors, value, "renderedBlocks");
    requireArray(errors, value, "warnings");
    requireArray(errors, value, "decisions");
    if (!Number.isFinite(value?.estimatedTokens) || value.estimatedTokens < 0) {
      errors.push("CompiledPrompt.estimatedTokens must be a non-negative number");
    }
    return result(errors);
  }

  function validateDecision(value) {
    const errors = [];
    requireId(errors, value, "conceptId");
    requireEnum(errors, value, "source", DECISION_SOURCES);
    requireString(errors, value, "block");
    requireString(errors, value, "reason");
    if (!Number.isFinite(value?.score)) errors.push("Decision.score must be a number");
    return result(errors);
  }

  function validateBase(value, name) {
    const errors = [];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [`${name} must be an object`];
    }
    if (value.schemaVersion !== SCHEMA_VERSION) {
      errors.push(`${name}.schemaVersion must equal ${SCHEMA_VERSION}`);
    }
    return errors;
  }

  function requireBlocks(errors, blocks) {
    if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) {
      errors.push("blocks must be an object");
      return;
    }
    BLOCK_ORDER.filter((name) => name !== "break").forEach((name) => {
      if (!Array.isArray(blocks[name])) errors.push(`blocks.${name} must be an array`);
    });
  }

  function requireString(errors, value, key) {
    if (typeof value?.[key] !== "string") errors.push(`${key} must be a string`);
  }

  function requireId(errors, value, key) {
    requireString(errors, value, key);
    if (typeof value?.[key] === "string" && !/^[a-z0-9][a-z0-9._:-]*$/.test(value[key])) {
      errors.push(`${key} must use a stable lowercase identifier`);
    }
  }

  function requireArray(errors, value, key) {
    if (!Array.isArray(value?.[key])) errors.push(`${key} must be an array`);
  }

  function requireObject(errors, value, key) {
    const item = value?.[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) errors.push(`${key} must be an object`);
  }

  function requireEnum(errors, value, key, allowed) {
    if (!allowed.includes(value?.[key])) errors.push(`${key} must be one of: ${allowed.join(", ")}`);
  }

  function requireSafeInteger(errors, value, key) {
    if (!Number.isSafeInteger(value?.[key]) || value[key] < 0) {
      errors.push(`${key} must be a non-negative safe integer`);
    }
  }

  function result(errors) {
    return { valid: errors.length === 0, errors };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    BLOCK_ORDER,
    KNOWLEDGE_KINDS,
    DECISION_SOURCES,
    CONTENT_MODES,
    emptyBlocks,
    createPromptIntent,
    createScenePlan,
    createCompiledPrompt,
    validatePromptIntent,
    validateKnowledgeEntry,
    validateArtRecipe,
    validateScenePlan,
    validateCompiledPrompt,
    validateDecision
  });
});
