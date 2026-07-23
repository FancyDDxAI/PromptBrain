(function attachPromptBrainEngine(root, factory) {
  const contracts = typeof module === "object" && module.exports
    ? require("./contracts.js")
    : root.PromptBrainContracts;
  const seed = typeof module === "object" && module.exports
    ? require("./seed-knowledge.js")
    : root.PromptBrainSeedKnowledge;
  const curated = typeof module === "object" && module.exports
    ? require("./curated-knowledge.js")
    : root.PromptBrainCuratedKnowledge;
  const artDirector = typeof module === "object" && module.exports
    ? require("./art-director.js")
    : root.PromptBrainArtDirector;
  const reasoning = typeof module === "object" && module.exports
    ? require("./reasoning-engine.js")
    : root.PromptBrainReasoning;
  const api = factory(contracts, seed, curated, artDirector, reasoning);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPromptEngine(contracts, seed, curated, artDirector, reasoning) {
  "use strict";

  if (!contracts || !seed || !curated || !artDirector || !reasoning) {
    throw new Error("PromptBrain engine dependencies are missing.");
  }

  let ALL_CONCEPTS = Object.freeze([...seed.CONCEPTS, ...curated.CONCEPTS]);
  let ALL_ENTITIES = Object.freeze([...seed.ENTITIES]);
  let ALL_ART_RECIPES = Object.freeze([...seed.ART_RECIPES, ...artDirector.ART_RECIPES]);
  let conceptById = new Map();
  let entityById = new Map();
  let recipeById = new Map();
  let conceptsByGroup = new Map();
  let conceptsByKind = new Map();
  let conceptTokenIndex = new Map();
  let conceptMatches = [];
  let entityMatches = [];

  const FUZZY_STOP_WORDS = new Set([
    "a", "an", "and", "anime", "art", "artistic", "adult", "by", "character",
    "cinematic", "for", "from", "girl", "image", "in", "man", "of", "on",
    "scene", "style", "the", "to", "with", "woman"
  ]);

  const ADULT_OUTPUT_WORDS = /\b(?:anal|blowjob|bottomless|cock|creampie|cum|cunnilingus|deepthroat|fellatio|fingering|fuck(?:ed|ing)?|genitals?|handjob|hentai|intercourse|masturbat(?:e|ing)|naked|nipples?|nsfw|oral sex|orgasm|penis|penetration|pussy|sex|sexual|topless|uncensored|vagina|vulva)\b/i;
  const PROHIBITED_OUTPUT_WORDS = /\b(?:bestiality|child|children|incest|loli|lolicon|minor|non[- ]?consensual|rape|raping|shota|shotacon|underage)\b/i;

  function collectSourceStrings(value, output = []) {
    if (typeof value === "string") {
      if (value.length <= 160 && !/^[a-f0-9]{32,}$/i.test(value)) output.push(value);
      return output;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectSourceStrings(item, output));
      return output;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach((item) => collectSourceStrings(item, output));
    }
    return output;
  }

  function searchableAliases(item) {
    const values = [
      ...(item.aliases || []),
      item.label,
      ...Object.values(item.promptForms || {}),
      ...collectSourceStrings(item.provenance?.sourceValues)
    ];
    const seen = new Set();
    return values
      .map(normalizeForMatch)
      .filter((value) => value && !seen.has(value) && seen.add(value));
  }

  function searchTokens(aliases) {
    return [...new Set(aliases
      .flatMap((alias) => alias.split(" "))
      .filter((token) => token.length >= 3 && !FUZZY_STOP_WORDS.has(token)))];
  }

  function matchIndex(items, includeSources = false) {
    return items.map((item) => ({
      item,
      aliases: includeSources
        ? searchableAliases(item)
        : (item.aliases || []).map((alias) => normalizeForMatch(alias)).filter(Boolean)
    }));
  }

  function rebuildIndexes() {
    conceptById = new Map(ALL_CONCEPTS.map((item) => [item.id, item]));
    entityById = new Map(ALL_ENTITIES.map((item) => [item.id, item]));
    recipeById = new Map(ALL_ART_RECIPES.map((item) => [item.id, item]));
    conceptsByGroup = new Map();
    conceptsByKind = new Map();
    conceptTokenIndex = new Map();
    conceptMatches = matchIndex(ALL_CONCEPTS, true);
    entityMatches = matchIndex(ALL_ENTITIES);
    conceptMatches.forEach((entry) => {
      const { item } = entry;
      if (!conceptsByGroup.has(item.group || "")) conceptsByGroup.set(item.group || "", []);
      conceptsByGroup.get(item.group || "").push(item);
      if (!conceptsByKind.has(item.kind || "")) conceptsByKind.set(item.kind || "", []);
      conceptsByKind.get(item.kind || "").push(item);
      searchTokens(entry.aliases).forEach((token) => {
        if (!conceptTokenIndex.has(token)) conceptTokenIndex.set(token, []);
        conceptTokenIndex.get(token).push(entry);
      });
    });
  }

  // Merge a generated catalog on top of the built-in knowledge. Existing ids win,
  // so registering can extend the vocabulary but never redefine curated entries.
  function registerCatalog(catalog) {
    const added = { concepts: 0, entities: 0, recipes: 0 };
    const mergeById = (current, incoming, counter) => {
      const known = new Set(current.map((item) => item.id));
      const merged = current.slice();
      (incoming || []).forEach((item) => {
        if (!item?.id || known.has(item.id)) return;
        known.add(item.id);
        merged.push(item);
        added[counter] += 1;
      });
      return merged;
    };
    const concepts = mergeById(ALL_CONCEPTS, catalog?.concepts, "concepts");
    const entities = mergeById(ALL_ENTITIES, catalog?.entities, "entities");
    const recipes = mergeById(ALL_ART_RECIPES, catalog?.recipes, "recipes");
    if (added.concepts) ALL_CONCEPTS = Object.freeze(concepts);
    if (added.entities) ALL_ENTITIES = Object.freeze(entities);
    if (added.recipes) ALL_ART_RECIPES = Object.freeze(recipes);
    rebuildIndexes();
    return added;
  }

  rebuildIndexes();
  const blockForKind = Object.freeze({
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
    motif: "motifs",
    effect: "effects",
    lora: "loras"
  });

  function hashString(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRandom(seedValue) {
    let state = (Number(seedValue) >>> 0) || 0x6D2B79F5;
    return function random() {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeForMatch(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeRequest(rawText) {
    const original = String(rawText || "").trim();
    const withoutBoilerplate = original
      .replace(/^\s*(?:please\s+)?(?:i\s+want|make|create|generate|give\s+me)\s+/i, "")
      .replace(/^it\s+artistic\s*:?\s*/i, "artistic ")
      .replace(/^artistic\s*:\s*/i, "artistic ");
    return {
      original,
      cleaned: withoutBoilerplate.trim(),
      matchText: normalizeForMatch(withoutBoilerplate)
    };
  }

  function phraseOccurs(text, phrase) {
    const haystack = ` ${normalizeForMatch(text)} `;
    const needle = normalizeForMatch(phrase);
    return needle.length > 0 && haystack.includes(` ${needle} `);
  }

  function matchedAlias(text, aliases) {
    const normalizedText = normalizeForMatch(text);
    return [...(aliases || [])]
      .map((alias) => normalizeForMatch(alias))
      .filter((alias) => alias && ` ${normalizedText} `.includes(` ${alias} `))
      .sort((a, b) => b.length - a.length)[0] || "";
  }

  function matchedPreparedAlias(normalizedText, aliases) {
    const haystack = ` ${normalizedText} `;
    return aliases
      .filter((alias) => haystack.includes(` ${alias} `))
      .sort((a, b) => b.length - a.length)[0] || "";
  }

  function parseForbidden(rawText) {
    const phrases = [];
    const source = String(rawText || "");
    const pattern = /\b(?:no|without|avoid|exclude)\s+(.+?)(?=\s+(?:but|while|with)\b|[,;\n.]|$)/gi;
    let match;
    while ((match = pattern.exec(source))) {
      const phrase = normalizeForMatch(match[1]).replace(/^(?:a|an|the)\s+/, "");
      if (phrase) phrases.push(phrase);
    }
    const conceptIds = new Set();
    const entityIds = new Set();
    conceptMatches.forEach(({ item, aliases }) => {
      if (phrases.some((phrase) => matchedPreparedAlias(phrase, aliases))) conceptIds.add(item.id);
    });
    entityMatches.forEach(({ item, aliases }) => {
      if (phrases.some((phrase) => matchedPreparedAlias(phrase, aliases))) entityIds.add(item.id);
    });
    return { phrases, conceptIds, entityIds };
  }

  function adultEntityRejection(entity) {
    return `${entity.name} is not enabled for adult-mode generation; the named-entity request was rejected and no generic adult subject was substituted.`;
  }

  function inferredAdultParticipants(text) {
    const normalized = normalizeForMatch(text);
    if (!/\badults?\b/.test(normalized)) return [];
    const participants = [];
    const add = (gender) => participants.push({
      id: `participant.original-adult-${participants.length + 1}`,
      role: participants.length ? "partner" : "subject",
      gender,
      identity: participants.length ? "original partner" : "original character",
      namespace: "",
      traits: ["original-character"],
      adultVerified: true
    });
    const women = (normalized.match(/\badult (?:woman|women|female)\b/g) || []).length;
    const men = (normalized.match(/\badult (?:man|men|male)\b/g) || []).length;
    for (let index = 0; index < women; index += 1) add("female");
    for (let index = 0; index < men; index += 1) add("male");
    const requestedCount = /\b(?:two|both) adults\b/.test(normalized) ? 2 : 1;
    while (participants.length < requestedCount) add("unspecified");
    return participants;
  }

  function resolveEntities(text, contentMode, forbidden = { entityIds: new Set() }) {
    const matches = [];
    const warnings = [];
    const rejected = [];
    const normalizedText = normalizeForMatch(text);
    entityMatches.forEach(({ item: entity, aliases }) => {
      if (forbidden.entityIds?.has(entity.id)) return;
      const alias = matchedPreparedAlias(normalizedText, aliases);
      if (!alias) return;
      if (contentMode === "adult" && entity.adultAllowed !== true) {
        const reason = adultEntityRejection(entity);
        warnings.push(reason);
        rejected.push({ entity, alias, reason });
        return;
      }
      matches.push({ entity, alias, confidence: Math.min(1, 0.75 + alias.length / 100) });
    });
    matches.sort((a, b) => b.alias.length - a.alias.length);
    rejected.sort((a, b) => b.alias.length - a.alias.length);
    return { matches, warnings, rejected };
  }

  function collectExplicitConcepts(text, forbidden, options = {}) {
    const normalizedText = normalizeForMatch(text);
    const requestTokens = searchTokens([normalizedText]);
    const candidates = new Set();
    requestTokens.forEach((token) => {
      (conceptTokenIndex.get(token) || []).forEach((entry) => candidates.add(entry));
    });
    const exact = [];
    const fuzzy = [];
    candidates.forEach(({ item, aliases }) => {
      if (forbidden.conceptIds.has(item.id)) return;
      const alias = matchedPreparedAlias(normalizedText, aliases);
      if (alias) {
        const semanticSpecificity = (item.traits?.length || 0) * 4
          + (item.requires?.length || 0) * 3
          + Math.min(4, item.aliases?.length || 0);
        exact.push({ concept: item, alias, score: 100 + Math.min(alias.length, 30) + semanticSpecificity });
        return;
      }
      if (options.contentMode !== "adult" && item.contentMode === "adult") return;
      if (!conceptCompatibility(item, options.checkpointId).compatible) return;
      if (item.kind === "lora") return;
      const aliasTokens = new Set(searchTokens(aliases));
      const overlap = requestTokens.filter((token) => aliasTokens.has(token));
      const coverage = aliasTokens.size ? overlap.length / aliasTokens.size : 0;
      // A single shared word such as "black", "studio", or "oni" is not intent.
      // Fuzzy recovery is reserved for phrases with at least two meaningful matches.
      if (overlap.length < 2 || coverage < 0.5) return;
      const score = 44 + overlap.length * 16 + coverage * 20 + Math.min(12, Number(item.priority || 0));
      fuzzy.push({
        concept: item,
        alias: overlap.join(" "),
        score,
        tie: hashString(String(options.seed || 0) + ":" + item.id)
      });
    });
    const exactKinds = new Set(exact.map((item) => item.concept.kind));
    const bestFuzzyByKind = new Map();
    fuzzy
      .filter((item) => !exactKinds.has(item.concept.kind))
      .sort((a, b) => b.score - a.score || b.tie - a.tie || a.concept.id.localeCompare(b.concept.id))
      .forEach((item) => {
        if (!bestFuzzyByKind.has(item.concept.kind)) bestFuzzyByKind.set(item.concept.kind, item);
      });
    const seenPrompts = new Set();
    return [...exact, ...bestFuzzyByKind.values()]
      .sort((a, b) => b.score - a.score || b.alias.length - a.alias.length || a.concept.id.localeCompare(b.concept.id))
      .filter((entry) => {
        const key = `${entry.concept.kind}:${normalizeForMatch(conceptPrompt(entry.concept, options.checkpointId))}`;
        if (seenPrompts.has(key)) return false;
        seenPrompts.add(key);
        return true;
      });
  }

  function inferParticipant(entity, concept, contentMode = "sfw") {
    const traits = entity?.traits || concept?.traits || [];
    const gender = traits.includes("female") ? "female" : traits.includes("male") ? "male" : "unspecified";
    const named = !!entity;
    const disallowedAge = traits.some((trait) => /(?:child|minor|underage|teen|loli|shota)/i.test(trait));
    return {
      id: entity?.id || concept?.id || "",
      role: "subject",
      gender,
      identity: entity?.name || concept?.label || "",
      namespace: entity?.namespace || "",
      traits: [...traits],
      adultVerified: contentMode === "adult" && !disallowedAge && (named ? entity.adultAllowed === true : true)
    };
  }

  function genericAnimeEntity(text, contentMode, seedValue) {
    if (!/\b(?:anime\s+(?:character|girl|woman|boy|man)|(?:female|male)\s+anime\s+character)\b/i.test(text)) return null;
    const wantsFemale = /\b(?:female|girl|woman)\b/i.test(text);
    const wantsMale = /\b(?:male|boy|man)\b/i.test(text);
    const eligible = ALL_ENTITIES.filter((entity) => {
      if (contentMode === "adult" && entity.adultAllowed !== true) return false;
      if (wantsFemale && !entity.traits?.includes("female")) return false;
      if (wantsMale && !wantsFemale && !entity.traits?.includes("male")) return false;
      return true;
    });
    if (!eligible.length) return null;
    return eligible
      .map((entity) => ({ entity, order: hashString(String(seedValue) + ":" + entity.id) }))
      .sort((a, b) => b.order - a.order || a.entity.id.localeCompare(b.entity.id))[0].entity;
  }

  function parseIntent(rawText, options = {}) {
    const normalized = normalizeRequest(rawText);
    const checkpointId = seed.CHECKPOINT_PROFILES[options.checkpointId]
      ? options.checkpointId
      : "waiIllustriousXL";
    const contentMode = options.contentMode === "adult" ? "adult" : "sfw";
    const calculatedSeed = Number.isSafeInteger(options.seed)
      ? options.seed
      : hashString(`${checkpointId}:${normalized.matchText}`);
    const intent = contracts.createPromptIntent(normalized.original, {
      requestId: options.requestId || `request-${calculatedSeed}`,
      normalizedText: normalized.matchText,
      checkpointId,
      contentMode,
      vibe: options.vibe || "Free",
      seed: calculatedSeed
    });
    const forbidden = parseForbidden(normalized.original);
    const entities = resolveEntities(normalized.matchText, contentMode, forbidden);
    const explicit = collectExplicitConcepts(normalized.matchText, forbidden, {
      checkpointId,
      contentMode,
      seed: calculatedSeed
    });

    forbidden.phrases.forEach((phrase) => intent.directives.forbidden.push({ phrase }));
    forbidden.conceptIds.forEach((conceptId) => intent.directives.forbidden.push({ conceptId }));

    entities.matches.forEach(({ entity, alias, confidence }) => {
      intent.entities.push({
        id: entity.id,
        kind: entity.kind,
        name: entity.name,
        namespace: entity.namespace,
        confidence,
        matchedAlias: alias
      });
      intent.participants.push(inferParticipant(entity, null, contentMode));
      intent.evidence.push({ source: "entity", id: entity.id, matched: alias });
    });

    explicit.forEach(({ concept, alias, score }) => {
      const block = blockForKind[concept.kind];
      if (block) intent.blocks[block].push(concept.id);
      intent.directives.required.push({ conceptId: concept.id, matchedAlias: alias, score });
      intent.evidence.push({ source: "explicit", id: concept.id, matched: alias });
      if (concept.kind === "subject" && !intent.participants.some((item) => item.id === concept.id)) {
        intent.participants.push(inferParticipant(null, concept, contentMode));
      }
    });

    if (!intent.entities.length && entities.rejected.length === 0 && !explicit.some((item) => item.concept.kind === "subject")) {
      const entity = genericAnimeEntity(normalized.matchText, contentMode, calculatedSeed);
      if (entity) {
        intent.entities.push({
          id: entity.id,
          kind: entity.kind,
          name: entity.name,
          namespace: entity.namespace,
          confidence: 0.55,
          matchedAlias: "generic anime character request"
        });
        intent.participants.push(inferParticipant(entity, null, contentMode));
        intent.evidence.push({ source: "inferred-entity", id: entity.id, matched: "generic anime character request" });
      }
    }

    // Adult eligibility is internal evidence, not prompt prose. Generic adult
    // subjects declared by the user remain verified in the plan even though the
    // output cleaner intentionally removes repetitive age scaffolding.
    if (contentMode === "adult" && !intent.participants.length && entities.rejected.length === 0) {
      intent.participants.push(...inferredAdultParticipants(normalized.matchText));
    }

    if (contentMode === "adult" && !intent.participants.length && ADULT_OUTPUT_WORDS.test(normalized.matchText)) {
      const gender = /\b(?:male|man|boy|penis|cock)\b/.test(normalized.matchText) ? "male" : "female";
      intent.participants.push({
        id: "participant.original-adult",
        role: "subject",
        gender,
        identity: "original character",
        namespace: "",
        traits: ["original-character"],
        adultVerified: true
      });
    }

    intent.warnings = entities.warnings;
    intent.rejectedEntities = entities.rejected.map((item) => item.entity.id);
    intent.artDirection.requested = /\b(artistic|artwork|illustration|painting|poster|graphic|ukiyo|hokusai|sumi|horror|cinematic|fantasy|editorial|surreal|gothic|baroque|cyberpunk|decorative)\b/.test(normalized.matchText);
    intent.artDirection.strength = intent.artDirection.requested ? 1 : 0;
    const intentModel = reasoning.compileIntent(intent);
    intent.reasoning = {
      intentModel,
      sceneGraph: reasoning.buildSceneGraph(intent, intentModel),
      variation: reasoning.createVariationProfile(intentModel)
    };
    return intent;
  }

  function selectArtRecipe(intent, options = {}) {
    for (const recipeId of intent.artDirection?.recipeIds || []) {
      const recipe = recipeById.get(recipeId);
      if (recipe && recipe.contentModes.includes(intent.contentMode)) {
        return {
          recipe,
          score: 100000,
          selectionCounts: recipe.selectionCounts || {},
          rationale: ["explicit recipe selection"],
          alternatives: []
        };
      }
    }
    const directed = artDirector.direct(intent, { memoryScores: options.memoryScores || {} });
    if (directed) return directed;
    return seed.ART_RECIPES
      .map((recipe) => {
        let score = recipe.priority || 0;
        let hits = 0;
        recipe.triggers.forEach((trigger) => {
          if (phraseOccurs(intent.normalizedText, trigger)) {
            score += 50 + normalizeForMatch(trigger).length;
            hits += 1;
          }
        });
        return { recipe, score: hits ? score : -Infinity, selectionCounts: {} };
      })
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)[0] || null;
  }

  function checkpointProfile(checkpointId) {
    return seed.CHECKPOINT_PROFILES[checkpointId] || seed.CHECKPOINT_PROFILES.waiIllustriousXL;
  }

  function cleanCatalogPromptForOutput(value) {
    return String(value || "")
      .replace(/^\s*(?:both adults actively reciprocating|both adults sharing active control)\s*:\s*/i, "")
      .replace(/^\s*after explicit agreement between two adults\s*:\s*/i, "")
      .replace(/^\s*both adults verbally affirming\s*:\s*/i, "")
      .replace(/^\s*the receiving(?: adult)? guiding the pace\s*:\s*/i, "")
      .replace(/^\s*with (?:a shared stop signal|both adults controlling the pace)\s*:\s*/i, "")
      .replace(/^\s*both adults (?:actively reciprocating|sharing control) while two adults\s+/i, "two partners ")
      .replace(/^\s*the receiving adult guiding the pace while two adults\s+/i, "two partners ")
      .replace(/^\s*two adults sharing gradual\s+/i, "gradual ")
      .replace(/\bone adult's\b/gi, "one partner's")
      .replace(/\bthe other adult's\b/gi, "the other partner's")
      .replace(/\bboth adults\b/gi, "both partners")
      .replace(/\b(?:between|for) two consenting adults\b/gi, "for two partners")
      .replace(/\btwo adults\b/gi, "two partners")
      .replace(/\bone adult\b/gi, "one partner")
      .replace(/\banother adult\b/gi, "another partner")
      .replace(/\bpaired adults\b/gi, "paired partners")
      .replace(/\btwo[- ]adult\b/gi, "two-partner")
      .replace(/\bsolo[- ]adult\b/gi, "solo")
      .replace(/\badult[- ]group\b/gi, "group")
      .replace(/\bby an adult character\b/gi, "")
      .replace(/\bsolo adult\b/gi, "solo")
      .replace(/\badult (?:character|subject|partner)\b/gi, (match) => match.replace(/adult\s+/i, ""))
      .replace(/\bprivate consensual adult intimacy environment\b/gi, "private setting")
      .replace(/\badult intimate expression\b/gi, "intimate expression")
      .replace(/\bexplicit (?:adult )?intimacy\b/gi, "intimate")
      .replace(/\bstatic intimate partner pose\b/gi, "intimate partner pose")
      .replace(/\bstatic (?=[a-z- ]+pose\b)/gi, "")
      .replace(/,?\s*active (?:personal routine|craft or work task|home or garden task)\b/gi, "")
      .replace(/,?\s*coordinated head-to-toe complete outfit\b/gi, "")
      .replace(/,?\s*nuanced expression\b/gi, "")
      .replace(/,?\s*for neutral observation\b/gi, "")
      .replace(/\badult\b/gi, "")
      .replace(/\s*;\s*/g, ", ")
      .replace(/\s*,\s*,+/g, ", ")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s*[,;:]+|[,;:]+\s*$/g, "")
      .trim();
  }

  function conceptPrompt(item, checkpointId) {
    const profile = checkpointProfile(checkpointId);
    const promptForms = item.promptForms || {};
    return cleanCatalogPromptForOutput(promptForms[checkpointId]
      || promptForms[profile.base]
      || promptForms.default
      || item.label);
  }

  function conceptCompatibility(item, checkpointId) {
    const profile = checkpointProfile(checkpointId);
    const bases = Array.isArray(item.compatibility?.bases) ? item.compatibility.bases : [];
    const checkpointIds = Array.isArray(item.compatibility?.checkpointIds) ? item.compatibility.checkpointIds : [];
    if (item.kind === "lora" && !bases.length && !checkpointIds.length) {
      return { compatible: false, profile, reason: "LoRA base is not mapped to a supported checkpoint" };
    }
    if (!bases.length && !checkpointIds.length) return { compatible: true, profile };
    return {
      compatible: checkpointIds.includes(checkpointId) || bases.includes(profile.base),
      profile
    };
  }

  function createSelectionState(plan, forbidden) {
    return {
      plan,
      forbidden,
      byId: new Map(),
      byGroup: new Map(),
      promptKeys: new Map()
    };
  }

  function reject(selection, item, source, reason) {
    selection.plan.rejected.push({ conceptId: item.id, source, reason });
    if (source === "explicit") {
      selection.plan.warnings.push(`Explicit concept ${item.id} was rejected: ${reason}.`);
    }
  }

  function removeDecision(selection, decision, reason) {
    const block = selection.plan.blocks[decision.block];
    const index = block.indexOf(decision.prompt);
    if (index >= 0) block.splice(index, 1);
    selection.plan.decisions = selection.plan.decisions.filter((item) => item !== decision);
    selection.byId.delete(decision.conceptId);
    if (decision.group && selection.byGroup.get(decision.group) === decision) selection.byGroup.delete(decision.group);
    selection.promptKeys.delete(normalizeForMatch(decision.prompt));
    selection.plan.locked = selection.plan.locked.filter((id) => id !== decision.conceptId);
    selection.plan.rejected.push({ conceptId: decision.conceptId, source: decision.source, reason });
  }

  function conflictingDecisions(selection, item) {
    const declared = new Set(Array.isArray(item.conflicts) ? item.conflicts : []);
    return [...selection.byId.values()].filter((decision) => {
      const selected = conceptById.get(decision.conceptId);
      if (!selected) return false;
      const sameGroup = item.group && selected.group && item.group === selected.group;
      const reverseConflict = Array.isArray(selected.conflicts) && selected.conflicts.includes(item.id);
      return sameGroup || declared.has(selected.id) || reverseConflict;
    });
  }

  function addConcept(selection, item, options = {}) {
    if (!item) return false;
    const source = options.source || "inferred";
    const score = Number(options.score || 0);
    const locked = options.locked === true;
    const block = blockForKind[item.kind];
    if (!block) return false;
    if (selection.byId.has(item.id)) {
      const existing = selection.byId.get(item.id);
      if (locked && !existing.locked) {
        existing.locked = true;
        existing.score = Math.max(existing.score, score);
        if (!selection.plan.locked.includes(item.id)) selection.plan.locked.push(item.id);
      }
      return true;
    }
    if (selection.forbidden.conceptIds.has(item.id)) {
      reject(selection, item, source, "forbidden by the user");
      return false;
    }
    if (selection.plan.contentMode === "sfw" && item.contentMode === "adult") {
      reject(selection, item, source, "adult-only concept is unavailable in sfw mode");
      return false;
    }
    if (item.contentMode === "adult"
      && !selection.plan.participants.some((participant) => participant.adultVerified === true)) {
      reject(selection, item, source, "adult-only concept requires a verified adult participant");
      return false;
    }
    const compatibility = conceptCompatibility(item, selection.plan.checkpointId);
    if (!compatibility.compatible) {
      reject(selection, item, source, `incompatible with checkpoint ${selection.plan.checkpointId} (${compatibility.profile.base})`);
      return false;
    }
    const prompt = conceptPrompt(item, selection.plan.checkpointId);
    const promptKey = normalizeForMatch(prompt);
    if (selection.promptKeys.has(promptKey)) return true;

    const conflicts = conflictingDecisions(selection, item);
    const lockedConflict = conflicts.find((decision) => decision.locked);
    if (lockedConflict) {
      if (locked) selection.plan.warnings.push(`Explicit concepts conflict: ${lockedConflict.conceptId} and ${item.id}`);
      reject(selection, item, source, `conflicts with locked ${lockedConflict.conceptId}`);
      return false;
    }
    if (!locked) {
      const stronger = conflicts.find((decision) => decision.score >= score);
      if (stronger) {
        reject(selection, item, source, `lower score than ${stronger.conceptId}`);
        return false;
      }
    }
    conflicts.forEach((decision) => removeDecision(
      selection,
      decision,
      locked ? `replaced by explicit ${item.id}` : `replaced by higher-scoring ${item.id}`
    ));

    const decision = {
      conceptId: item.id,
      source,
      block,
      prompt,
      reason: options.reason || "selected by scene planner",
      score,
      locked,
      group: item.group || ""
    };
    selection.plan.blocks[block].push(prompt);
    selection.plan.decisions.push(decision);
    selection.byId.set(item.id, decision);
    selection.promptKeys.set(promptKey, decision);
    if (item.group) selection.byGroup.set(item.group, decision);
    if (locked) selection.plan.locked.push(item.id);
    return true;
  }

  function cleanLiteral(value) {
    return String(value || "")
      .replace(/\b(?:rating\s*:\s*explicit|rating explicit)\b/gi, "")
      .replace(/\b(?:hentai|nsfw)\b/gi, "")
      .replace(/\s*,\s*,+/g, ", ")
      .replace(/^\s*[,;]+|[,;]+\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function addLiteral(selection, block, value, options = {}) {
    if (!selection.plan.blocks[block] || block === "loras") return false;
    const prompt = cleanLiteral(value);
    if (!prompt) return false;
    if (PROHIBITED_OUTPUT_WORDS.test(prompt)) {
      selection.plan.rejected.push({ conceptId: "literal.rejected", source: "explicit", reason: "prohibited content is unavailable" });
      selection.plan.warnings.push("A selected literal was rejected by the adult-content boundary.");
      return false;
    }
    if (selection.plan.contentMode === "sfw" && ADULT_OUTPUT_WORDS.test(prompt)) {
      selection.plan.rejected.push({ conceptId: "literal.rejected", source: "explicit", reason: "adult literal is unavailable in sfw mode" });
      return false;
    }
    if (selection.plan.contentMode === "adult" && ADULT_OUTPUT_WORDS.test(prompt)
      && !selection.plan.participants.some((participant) => participant.adultVerified === true)) {
      selection.plan.participants.push({
        id: "participant.original-adult",
        role: "subject",
        gender: "unspecified",
        identity: "original character",
        namespace: "",
        traits: ["original-character"],
        adultVerified: true
      });
    }
    const key = normalizeForMatch(prompt);
    if (!key || selection.promptKeys.has(key)) return true;
    const conceptId = "literal." + hashString(block + ":" + key).toString(16);
    const decision = {
      conceptId,
      source: options.source || "explicit",
      block,
      prompt,
      reason: options.reason || "user-provided literal",
      score: Number(options.score || 900),
      locked: options.locked !== false,
      group: ""
    };
    selection.plan.blocks[block].push(prompt);
    selection.plan.decisions.push(decision);
    selection.byId.set(conceptId, decision);
    selection.promptKeys.set(key, decision);
    if (decision.locked) selection.plan.locked.push(conceptId);
    return true;
  }

  function fulfillRequirements(selection) {
    const failed = new Set();
    const maxPasses = Math.max(1, selection.plan.decisions.length + 1);

    function ensureRequirements(item, resolving, resolved) {
      if (!item || failed.has(item.id) || !selection.byId.has(item.id)) return false;
      if (resolved.has(item.id)) return true;
      if (resolving.has(item.id)) {
        failed.add(item.id);
        selection.plan.warnings.push(`Concept requirement cycle detected at ${item.id}.`);
        return false;
      }

      const decision = selection.byId.get(item.id);
      resolving.add(item.id);
      for (const requiredId of Array.isArray(item.requires) ? item.requires : []) {
        const required = conceptById.get(requiredId);
        if (!required || failed.has(requiredId)) {
          const reason = `requires unavailable ${requiredId}`;
          removeDecision(selection, decision, reason);
          if (decision.locked) selection.plan.warnings.push(`Explicit concept ${item.id} was rejected: ${reason}.`);
          failed.add(item.id);
          resolving.delete(item.id);
          return false;
        }
        if (!selection.byId.has(requiredId)) {
          addConcept(selection, required, {
            source: "inferred",
            score: decision.score,
            locked: decision.locked,
            reason: `required by ${item.id}`
          });
        }
        if (!selection.byId.has(item.id)
          || !selection.byId.has(requiredId)
          || !ensureRequirements(required, resolving, resolved)) {
          const reason = `requires ${requiredId}, which could not be selected`;
          if (selection.byId.has(item.id)) removeDecision(selection, decision, reason);
          if (decision.locked) selection.plan.warnings.push(`Explicit concept ${item.id} was rejected: ${reason}.`);
          failed.add(item.id);
          resolving.delete(item.id);
          return false;
        }
      }
      resolving.delete(item.id);
      resolved.add(item.id);
      return true;
    }

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const before = [...selection.byId.keys()].sort().join("\n");
      const resolving = new Set();
      const resolved = new Set();
      [...selection.byId.keys()].forEach((id) => ensureRequirements(conceptById.get(id), resolving, resolved));
      const after = [...selection.byId.keys()].sort().join("\n");
      if (before === after) break;
    }
  }

  function addEntity(selection, entity, source = "entity") {
    const existing = new Set(selection.plan.blocks.subject.map(normalizeForMatch));
    entity.promptTags.map(cleanCatalogPromptForOutput).filter(Boolean).forEach((prompt, index) => {
      const key = normalizeForMatch(prompt);
      if (existing.has(key)) return;
      selection.plan.blocks.subject.push(prompt);
      existing.add(key);
      selection.plan.decisions.push({
        conceptId: `${entity.id}:tag:${index}`,
        source,
        block: "subject",
        prompt,
        reason: `resolved ${entity.name} in ${entity.namespace}`,
        score: 80,
        locked: true,
        group: ""
      });
    });
  }

  function chooseRecipeItems(ids, count, random, memoryScores) {
    return ids
      .map((id) => ({
        id,
        value: random(),
        memory: Number(memoryScores?.[id] || memoryScores?.[conceptById.get(id)?.label] || 0)
      }))
      .sort((a, b) => b.memory - a.memory || b.value - a.value)
      .slice(0, count)
      .map((item) => item.id);
  }

  function applyRecipe(selection, selectedRecipe, random, memoryScores) {
    if (!selectedRecipe) return;
    const { recipe, score } = selectedRecipe;
    selection.plan.artRecipe = {
      id: recipe.id,
      name: recipe.name,
      score,
      familyId: recipe.familyId || "legacy",
      rationale: [...(selectedRecipe.rationale || [])],
      alternatives: [...(selectedRecipe.alternatives || [])]
    };
    Object.entries(recipe.ingredients).forEach(([slot, ids]) => {
      const targetBlock = slot === "motif" ? "motifs" : slot === "effect" ? "effects" : slot;
      const hasLockedUserChoice = selection.plan.decisions.some((decision) => decision.block === targetBlock && decision.locked);
      if (hasLockedUserChoice) return;
      const configured = Number(selectedRecipe.selectionCounts?.[slot] || recipe.selectionCounts?.[slot] || 0);
      const required = recipe.requiredSlots.includes(slot);
      const requestedCount = configured > 0
        ? Math.min(ids.length, configured)
        : required ? ids.length : Math.min(ids.length, slot === "motifs" ? 2 : 1);
      const slotCap = ["style", "lighting", "motifs", "effects"].includes(slot) ? 2 : 1;
      const count = Math.min(requestedCount, slotCap);
      chooseRecipeItems(ids, count, random, memoryScores).forEach((id) => {
        addConcept(selection, conceptById.get(id), {
          source: "recipe",
          score: 30 + score / 10,
          reason: `${recipe.name}: ${slot}`
        });
      });
    });
  }

  function addIfMissing(selection, id, reason, score = 18) {
    if (!selection.byId.has(id)) addConcept(selection, conceptById.get(id), { source: "inferred", score, reason });
  }

  function applySemanticInferences(selection, intent, random, selectedEntityIds) {
    const ids = selection.byId;
    const entityIds = selectedEntityIds || new Set(intent.entities.map((item) => item.id));

    if (ids.has("subject.oni-woman")) addIfMissing(selection, "anatomy.oni-horns", "oni anatomy dependency");
    if (ids.has("subject.dragon-girl")) {
      addIfMissing(selection, "anatomy.dragon-horns", "dragon anatomy dependency");
      addIfMissing(selection, "anatomy.dragon-tail", "dragon anatomy dependency");
    }
    if (ids.has("subject.ice-elf")) addIfMissing(selection, "anatomy.pointed-elf-ears", "elf anatomy dependency");
    if (ids.has("subject.mouse-woman")) {
      addIfMissing(selection, "anatomy.mouse-ears", "mouse anatomy dependency");
      addIfMissing(selection, "anatomy.mouse-tail", "mouse anatomy dependency");
    }

    if (ids.has("action.combat")) {
      addIfMissing(selection, "pose.dynamic-combat", "combat requires an active pose", 22);
      addIfMissing(selection, "expression.determined", "combat expression", 18);
      addIfMissing(selection, "composition.impact", "combat composition", 20);
      addIfMissing(selection, random() > 0.5 ? "camera.foreshortening" : "camera.three-quarter", "combat camera", 15);
    }
    if (ids.has("action.airborne") || ids.has("action.odm-gear")) {
      addIfMissing(selection, "pose.airborne-lunge", "airborne motion pose", 25);
      addIfMissing(selection, "camera.foreshortening", "airborne action camera", 24);
      addIfMissing(selection, "composition.leading-lines", "airborne motion direction", 22);
      addIfMissing(selection, "motif.speed-lines", "airborne motion cue", 17);
    }
    if (ids.has("action.charging")) {
      addIfMissing(selection, "pose.forward-lean", "charging body mechanics", 25);
      addIfMissing(selection, "camera.foreshortening", "charging perspective", 18);
    }
    if (entityIds.has("character.eren-yeager")) {
      addIfMissing(selection, "action.odm-gear", "Eren action equipment", 28);
      addIfMissing(selection, "environment.city", "ODM traversal environment", 18);
      addIfMissing(selection, "composition.city-depth", "ODM city depth", 24);
    }
    if (entityIds.has("character.android-18") && ids.has("action.combat")) {
      addIfMissing(selection, "environment.ruined-city", "Dragon Ball combat environment", 16);
      addIfMissing(selection, "lighting.dramatic", "high-impact combat light", 16);
    }
    if (ids.has("environment.city") || ids.has("environment.ruined-city")) {
      addIfMissing(selection, "composition.city-depth", "city spatial depth", 16);
    }
    if (ids.has("environment.hokusai-waves")) {
      addIfMissing(selection, "composition.decorative-frame", "ukiyo-e decorative framing", 20);
      addIfMissing(selection, "motif.cherry-petals", "Japanese decorative motif", 14);
    }
    if (ids.has("lighting.sunset")) addIfMissing(selection, "palette.sunset", "sunset color relationship", 18);
  }

  function ensureRequestedStyle(selection, intent) {
    if (selection.plan.blocks.style.length || !intent.artDirection?.requested) return;
    const text = intent.normalizedText;
    const styleId = /\b(?:cinematic|film still|key visual)\b/.test(text)
      ? "style.cinematic-anime"
      : /\b(?:graphic horror|horror)\b/.test(text)
        ? "style.horror"
        : /\b(?:fantasy|elf|dragon|magic)\b/.test(text)
          ? "style.fantasy"
          : /\b(?:semi realistic|semi-realistic)\b/.test(text)
            ? "style.semi-realistic-anime"
            : "style.premium-anime";
    addConcept(selection, conceptById.get(styleId), {
      source: "inferred",
      score: 42,
      reason: "fulfilled the requested art direction with an explicit style block"
    });
  }

  function textHas(text, expression) {
    return expression.test(String(text || ""));
  }

  function eligibleCompletionConcepts(selection, groups) {
    const seen = new Set();
    return groups
      .flatMap((group) => conceptsByGroup.get(group) || [])
      .filter((item) => {
        if (!item?.id || seen.has(item.id) || item.kind === "lora") return false;
        seen.add(item.id);
        if (selection.plan.contentMode === "sfw" && item.contentMode === "adult") return false;
        return conceptCompatibility(item, selection.plan.checkpointId).compatible;
      });
  }

  function chooseCompletion(selection, groups, random, memoryScores, reason, predicate = null) {
    let candidates = eligibleCompletionConcepts(selection, groups);
    if (predicate) {
      const narrowed = candidates.filter(predicate);
      if (narrowed.length) candidates = narrowed;
    }
    const ranked = candidates
      .map((item) => {
        const memory = Number(memoryScores?.[item.id] || memoryScores?.[item.label] || 0);
        const coherence = reasoning.scoreCandidate(item, {
          model: selection.plan.reasoning?.intentModel,
          variation: selection.plan.reasoning?.variation
        });
        return {
          item,
          memory,
          coherence,
          score: Number(item.priority || 0) * 2 + memory * 12 + coherence + random() * 11
        };
      })
      .filter((entry) => entry.memory > -4)
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
    if (!ranked.length) return false;
    return addConcept(selection, ranked[0].item, {
      source: ranked[0].memory > 0 ? "memory" : "inferred",
      score: 20 + ranked[0].memory,
      reason
    });
  }

  function ensurePlanAdultPartner(plan) {
    const verified = plan.participants.filter((item) => item.adultVerified === true);
    if (!verified.length) {
      plan.participants.push({
        id: "participant.original-adult",
        role: "subject",
        gender: "unspecified",
        identity: "original character",
        namespace: "",
        traits: ["original-character"],
        adultVerified: true
      });
    }
    if (plan.participants.filter((item) => item.adultVerified === true).length < 2) {
      plan.participants.push({
        id: "participant.original-adult-partner",
        role: "partner",
        gender: "unspecified",
        identity: "original partner",
        namespace: "",
        traits: ["original-character"],
        adultVerified: true
      });
    }
  }

  function applySceneCompletion(selection, intent, random, memoryScores) {
    const text = intent.normalizedText;
    if (!text) return;
    const blocks = selection.plan.blocks;
    const has = (block) => blocks[block]?.length > 0;
    const vibe = normalizeForMatch(intent.vibe);
    const isAction = textHas(text, /\b(?:action|attack|battle|charging|combat|fight|fighting|leap|running|sprint)\b/);
    const isMagic = textHas(text, /\b(?:cast|casting|magic|mage|spell|summon|witch)\b/);
    const isReading = textHas(text, /\b(?:book|library|read|reading)\b/);
    const isPortrait = textHas(text, /\b(?:bust|close up|headshot|portrait)\b/);
    const isInterior = textHas(text, /\b(?:apartment|bedroom|indoors|interior|library|room|studio)\b/);
    const isFantasy = textHas(text, /\b(?:castle|dragon|elf|fantasy|forest|magic|oni|sword)\b/);
    const isHorror = textHas(text, /\b(?:blood|gothic|haunted|horror|nightmare|occult|ritual)\b/);
    const isCyber = textHas(text, /\b(?:city|cyberpunk|hologram|neon|street|techwear)\b/);
    const adultRequested = intent.contentMode === "adult" && ADULT_OUTPUT_WORDS.test(text);
    const partnerRequested = adultRequested && textHas(text, /\b(?:anal|balls deep|creampie|fucked|fucking|intercourse|oral sex|penetration|sex scene)\b/);
    const preservedRequest = selection.plan.decisions.some((decision) => decision.source === "fallback");
    const preservesNeutralMood = [
      "phase9.staging.grounded-portrait",
      "phase9.staging.quiet-interior-moment",
      "phase9.staging.street-candid"
    ].includes(selection.plan.artRecipe?.familyId);

    if (!has("action") && !has("interaction") && !preservedRequest) {
      if (adultRequested) {
        if (partnerRequested || random() > 0.48) {
          ensurePlanAdultPartner(selection.plan);
          const groups = textHas(text, /\banal\b/)
            ? ["adult-fantasy.interaction.anal"]
            : textHas(text, /\b(?:oral|fellatio|cunnilingus|blowjob)\b/)
              ? ["adult-fantasy.interaction.oral"]
              : textHas(text, /\b(?:fuck(?:ed|ing)?|intercourse|penetration|sex scene)\b/)
                ? ["adult-fantasy.interaction.penis-vulva"]
                : ["adult-fantasy.interaction.penis-vulva", "adult-fantasy.interaction.vulva-focused"];
          const wantsActiveIntercourse = textHas(text, /\bfuck(?:ed|ing)?\b/);
          const interactionPredicate = (item) => {
            if (/\b(?:consent|agreement|stop signal|pause|verbally affirming)\b/i.test(item.label)) return false;
            if (!wantsActiveIntercourse) return true;
            return /\b(?:deep controlled|intercourse|rear-entry|penis-on-top|vulva-on-top)\b/i.test(item.label);
          };
          chooseCompletion(selection, groups, random, memoryScores, "completed an explicit adult interaction request", interactionPredicate);
        } else {
          const wantsMale = textHas(text, /\b(?:male|man|penis|cock)\b/);
          chooseCompletion(selection, [
            wantsMale ? "adult-fantasy.action.solo-penis" : "adult-fantasy.action.solo-vulva",
            "adult-fantasy.action.solo-toy"
          ], random, memoryScores, "completed an explicit solo adult request");
        }
      } else {
        const actionGroups = isAction
          ? ["character-performance.action.combat", "character-performance.action.movement"]
          : isMagic
            ? ["character-performance.action.magic"]
            : ["character-performance.action.everyday"];
        const predicate = isReading
          ? (item) => /\b(?:book|read|reading)\b/i.test(item.label)
          : null;
        chooseCompletion(selection, actionGroups, random, memoryScores, "filled an unspecified character action", predicate);
      }
    }

    if (!has("pose") && (!preservedRequest || isReading)) {
      const poseGroups = adultRequested
        ? [selection.plan.participants.filter((item) => item.adultVerified).length > 1
          ? "adult-fantasy.pose.partner"
          : "adult-fantasy.pose.solo"]
        : isAction
          ? ["character-performance.pose.combat-ready", "character-performance.pose.body-language"]
          : isReading
            ? ["character-performance.pose.seated"]
            : isPortrait
              ? ["character-performance.pose.portrait", "character-performance.pose.standing"]
              : ["character-performance.pose.standing", "character-performance.pose.body-language"];
      chooseCompletion(selection, poseGroups, random, memoryScores, "filled an unspecified pose");
    }

    if (!has("expression") && (!preservesNeutralMood || isReading) && (!preservedRequest || isReading)) {
      const expressionGroups = adultRequested
        ? [selection.plan.participants.filter((item) => item.adultVerified).length > 1
          ? "adult-fantasy.expression.partner"
          : "adult-fantasy.expression.solo"]
        : textHas(text, /\b(?:angry|rage|furious)\b/)
          ? ["character-performance.expression.anger"]
          : textHas(text, /\b(?:sad|crying|grief)\b/)
            ? ["character-performance.expression.sadness"]
            : isAction
              ? ["character-performance.expression.resolve"]
              : vibe.includes("cute")
                ? ["character-performance.expression.positive"]
                : ["character-performance.expression.calm", "character-performance.expression.thought"];
      const expressionPredicate = adultRequested && selection.plan.participants.filter((item) => item.adultVerified).length > 1
        ? (item) => !/\b(?:aftercare|post-climax|before penetration|verbal(?:ly)?|affirm|consent|reassuring)\b/i.test(item.label)
        : null;
      chooseCompletion(selection, expressionGroups, random, memoryScores, "filled an unspecified expression", expressionPredicate);
    }

    if (!has("wardrobe") && !adultRequested && !preservedRequest) {
      const wardrobeGroups = isAction
        ? ["wardrobe.complete-outfit.armor"]
        : isFantasy
          ? ["wardrobe.complete-outfit.fantasy"]
          : isCyber
            ? ["wardrobe.complete-outfit.science-fiction"]
            : ["wardrobe.complete-outfit.layering-style"];
      chooseCompletion(selection, wardrobeGroups, random, memoryScores, "filled a coordinated outfit");
    }

    if (!has("environment") && !preservedRequest) {
      const environmentGroups = adultRequested
        ? [isFantasy ? "adult-fantasy.environment.fantasy" : "adult-fantasy.environment.private"]
        : isHorror
          ? ["environment.horror"]
          : isCyber
            ? ["environment.urban", "environment.science-fiction"]
            : isFantasy
              ? ["environment.fantasy", "environment.natural"]
              : isInterior
                ? ["environment.interior"]
                : ["environment.natural", "environment.urban", "environment.interior"];
      const predicate = adultRequested && /\bbedroom\b/i.test(text)
        ? (item) => /\bbedroom\b/i.test(item.label)
        : isReading
          ? (item) => /\b(?:library|reading|study)\b/i.test(item.label)
          : null;
      chooseCompletion(selection, environmentGroups, random, memoryScores, "filled an unspecified environment", predicate);
    }

    if (!has("lighting")) {
      const lightingPredicate = isReading
        ? (item) => /\b(?:window|table lamp|skylight|doorway|softbox)\b/i.test(item.label)
        : null;
      chooseCompletion(selection, ["lighting.cinematic-source"], random, memoryScores, "filled motivated scene lighting", lightingPredicate);
    }
    if (!has("camera")) {
      const anglePredicate = isReading
        ? (item) => /\b(?:eye level|three-quarter|slightly high|high angle)\b/i.test(item.label)
        : null;
      chooseCompletion(selection, adultRequested ? ["adult-fantasy.camera"] : ["camera.angle"], random, memoryScores, "filled a camera angle", anglePredicate);
      const shotPredicate = isReading
        ? (item) => /\b(?:medium|waist|three-quarter|full body)\b/i.test(item.label)
        : null;
      if (!adultRequested) chooseCompletion(selection, ["camera.shot-size"], random, memoryScores, "filled a shot size", shotPredicate);
    }
    if (!has("composition")) {
      const compositionGroups = adultRequested
        ? ["adult-fantasy.composition"]
        : isAction
          ? ["composition.flow"]
        : isPortrait || isReading
            ? ["composition.portrait"]
            : has("environment")
              ? ["composition.landscape", "composition.negative-space"]
              : ["composition.portrait"];
      const compositionPredicate = isReading
        ? (item) => !/\b(?:walking|running|jump|combat|impact|motion)\b/i.test(item.label)
        : null;
      chooseCompletion(selection, compositionGroups, random, memoryScores, "filled scene composition", compositionPredicate);
    }
    if (!has("palette")) {
      const paletteGroups = isHorror
        ? ["palette.monochrome", "palette.cinematic"]
        : isCyber
          ? ["palette.neon-night"]
          : vibe.includes("cute")
            ? ["palette.soft-color"]
            : isFantasy
              ? ["palette.gemstone", "palette.mineral-earth"]
              : ["palette.cinematic", "palette.soft-color"];
      chooseCompletion(selection, paletteGroups, random, memoryScores, "filled a coordinated palette");
    }
    if (isAction && !has("effects")) {
      chooseCompletion(selection, ["effect.energy", "effect.weather"], random, memoryScores, "filled an action effect");
    }
  }

  function ensureAdultParticipants(intent) {
    if (intent.contentMode !== "adult") return;
    const requiredConcepts = intent.directives.required
      .map((item) => conceptById.get(item.conceptId))
      .filter(Boolean);
    const needsAdult = requiredConcepts.some((item) => item.contentMode === "adult")
      || ADULT_OUTPUT_WORDS.test(intent.normalizedText);
    if (!needsAdult) return;
    if (!intent.participants.some((item) => item.adultVerified === true)) {
      intent.participants.push({
        id: "participant.original-adult",
        role: "subject",
        gender: "unspecified",
        identity: "original character",
        namespace: "",
        traits: ["original-character"],
        adultVerified: true
      });
    }
    const needsPartner = requiredConcepts.some((item) => item.traits?.includes("participants:two"));
    if (needsPartner && intent.participants.filter((item) => item.adultVerified === true).length < 2) {
      intent.participants.push({
        id: "participant.original-adult-partner",
        role: "partner",
        gender: "unspecified",
        identity: "original partner",
        namespace: "",
        traits: ["original-character"],
        adultVerified: true
      });
    }
  }

  function applyLockedIngredients(selection, intent) {
    Object.entries(intent.artDirection?.lockedIngredients || {}).forEach(([slot, values]) => {
      const block = slot === "motif" ? "motifs" : slot === "effect" ? "effects" : slot;
      (Array.isArray(values) ? values : [values]).filter(Boolean).forEach((value) => {
        const concept = conceptById.get(String(value));
        if (concept) {
          addConcept(selection, concept, {
            source: "explicit",
            score: 950,
            locked: true,
            reason: "locked art-direction ingredient"
          });
        } else {
          addLiteral(selection, block, value, {
            source: "explicit",
            score: 950,
            locked: true,
            reason: "locked art-direction literal"
          });
        }
      });
    });
  }

  function applyLiteralBlocks(selection, literalBlocks) {
    Object.entries(literalBlocks || {}).forEach(([block, values]) => {
      (Array.isArray(values) ? values : [values]).filter(Boolean).forEach((value) => {
        addLiteral(selection, block, value, {
          source: "explicit",
          score: 920,
          locked: true,
          reason: "selected workspace control"
        });
      });
    });
  }

  function applyFallbackRequest(selection, intent) {
    if (intent.rejectedEntities?.length || selection.plan.rejected.some((item) => item.source === "entity")) return;
    const normalized = intent.normalizedText;
    if (!selection.plan.blocks.subject.length) {
      const subjectPattern = /\b(?:(?:generic|adult|anime|fantasy|female|male|masked|armored|cyberpunk|gothic|oni|dragon|demon|mouse|vampire|ice elf|science fiction)\s+){0,3}(?:androids?|archers?|assassins?|characters?|girls?|hero|heroes|knights?|mages?|man|men|mechanics?|ninjas?|people|persons?|pilots?|priestess|priestesses|samurai|soldiers?|sorcerers?|swordsman|swordsmen|swordswoman|swordswomen|vampires?|villains?|warriors?|witch|witches|woman|women)\b/g;
      const subjects = normalized.match(subjectPattern) || [];
      subjects.forEach((subject) => addLiteral(selection, "subject", subject, {
        source: "explicit",
        score: 900,
        locked: true,
        reason: "parsed a generic subject phrase from the request"
      }));
    }
    if (!selection.plan.blocks.interaction.length) {
      const interaction = normalized.match(/\b(?:embracing|hugging|kissing|holding hands)\b/)?.[0];
      if (interaction) addLiteral(selection, "interaction", interaction, {
        source: "explicit",
        score: 900,
        locked: true,
        reason: "parsed an interaction phrase from the request"
      });
    }
    if (!selection.plan.blocks.action.length) {
      const action = normalized.match(/\b(?:casting|charging|cooking|drinking|flying|holding|painting|preparing|reading|repairing|running|standing|walking|wielding|writing)(?:\s+(?!(?:at|in|inside|on|through|under|with)\b)[a-z0-9']+){0,4}/)?.[0];
      if (action) addLiteral(selection, "action", action, {
        source: "explicit",
        score: 900,
        locked: true,
        reason: "parsed an action phrase from the request"
      });
    }
    if (!selection.plan.blocks.environment.length) {
      const environment = normalized.match(/\b(?:(?:ancient|burning|candlelit|cozy|dark|frozen|gothic|intimate|modern|moonlit|neon|quiet|rain-covered|ruined|snowy)\s+){0,2}(?:apartment|battlefield|bridge|cathedral|chamber|city|cottage|courtyard|forest|garden|hotel room|interior|laboratory|rooftop|room|ruins|shrine|spacecraft|studio|suite|temple)\b/)?.[0];
      if (environment) addLiteral(selection, "environment", environment, {
        source: "explicit",
        score: 900,
        locked: true,
        reason: "parsed a setting phrase from the request"
      });
    }
    const coreBlocks = new Set(["subject", "anatomy", "action", "interaction", "environment"]);
    const hasExplicitContent = selection.plan.decisions.some((decision) => (
      coreBlocks.has(decision.block) && (decision.source === "explicit" || decision.source === "entity")
    ));
    if (hasExplicitContent) return;
    const cleaned = normalizeRequest(intent.rawText).cleaned
      .replace(/\b(?:rating\s*:\s*explicit|rating explicit|hentai|nsfw)\b/gi, "")
      .replace(/\b(?:no|without|avoid|exclude)\s+.+?(?=\s+(?:but|while|with)\b|[,;.\n]|$)/gi, "")
      .replace(/\s+/g, " ")
      .replace(/^\s*[,;]+|[,;]+\s*$/g, "")
      .trim();
    if (cleaned.length >= 3) {
      addLiteral(selection, "subject", cleaned, {
        source: "fallback",
        score: 10,
        locked: false,
        reason: "preserved an unmatched user request"
      });
    }
  }

  function planScene(intent, options = {}) {
    const validation = contracts.validatePromptIntent(intent);
    if (!validation.valid) throw new Error(`Invalid PromptIntent: ${validation.errors.join("; ")}`);
    ensureAdultParticipants(intent);
    const plan = contracts.createScenePlan(intent);
    plan.warnings.push(...(intent.warnings || []));
    const intentModel = reasoning.compileIntent(intent);
    plan.reasoning = {
      intentModel,
      sceneGraph: reasoning.buildSceneGraph(intent, intentModel),
      variation: reasoning.createVariationProfile(intentModel, { seed: intent.seed }),
      requiredConceptIds: intent.directives.required.map((item) => item.conceptId).filter(Boolean)
    };
    const forbidden = {
      phrases: intent.directives.forbidden.map((item) => item.phrase).filter(Boolean),
      conceptIds: new Set(intent.directives.forbidden.map((item) => item.conceptId).filter(Boolean))
    };
    const selection = createSelectionState(plan, forbidden);
    const random = createRandom(intent.seed);
    const selectedEntityIds = new Set();

    intent.entities.forEach((resolved) => {
      const entity = entityById.get(resolved.id);
      if (!entity) return;
      if (intent.contentMode === "adult" && entity.adultAllowed !== true) {
        const reason = adultEntityRejection(entity);
        if (!plan.warnings.includes(reason)) plan.warnings.push(reason);
        plan.rejected.push({ conceptId: entity.id, source: "entity", reason });
        return;
      }
      addEntity(selection, entity);
      selectedEntityIds.add(entity.id);
    });

    intent.directives.required
      .slice()
      .sort((a, b) => b.score - a.score)
      .forEach((required) => addConcept(selection, conceptById.get(required.conceptId), {
        source: "explicit",
        score: required.score,
        locked: true,
        reason: `matched '${required.matchedAlias}'`
      }));

    applyLockedIngredients(selection, intent);
    applyLiteralBlocks(selection, options.literalBlocks);
    applyFallbackRequest(selection, intent);

    const selectedRecipe = selectArtRecipe(intent, options);
    applyRecipe(selection, selectedRecipe, random, options.memoryScores || {});
    ensureRequestedStyle(selection, intent);
    fulfillRequirements(selection);
    applySemanticInferences(selection, intent, random, selectedEntityIds);
    applySceneCompletion(selection, intent, random, options.memoryScores || {});
    fulfillRequirements(selection);
    plan.participants = plan.participants
      .filter((item) => selectedEntityIds.has(item.id) || selection.byId.has(item.id) || (intent.contentMode === "adult" && item.adultVerified))
      .filter((item, index, values) => values.findIndex((other) => other.id === item.id) === index)
      .map((item) => ({ ...item }));
    reasoning.resolvePlan(plan, { model: intentModel });
    return plan;
  }

  function uniquePrompts(values) {
    const seen = new Set();
    return values.filter((value) => {
      const key = normalizeForMatch(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function estimateTokens(text) {
    return Math.ceil(String(text || "").length / 4);
  }

  // Pony derivatives are trained to expect a score_* prefix; without it the model
  // shifts quality badly. Detected from the prefix itself rather than the profile
  // id, so a new Pony checkpoint needs no engine change.
  function requiresScorePrefix(profile) {
    return (profile.qualityPrefix || []).some((tag) => /^score_\d/.test(String(tag)));
  }

  function cleanRenderedValues(values) {
    return uniquePrompts((values || []).map(cleanCatalogPromptForOutput).filter(Boolean));
  }

  const TAG_BLOCK_PRIORITY = Object.freeze({
    effects: 10,
    motifs: 15,
    palette: 20,
    composition: 30,
    expression: 35,
    wardrobe: 40,
    lighting: 45,
    camera: 50,
    environment: 55,
    pose: 60,
    quality: 85,
    style: 95,
    anatomy: 100,
    subject: 100,
    action: 100,
    interaction: 100,
    loras: 100
  });

  function renderedDecision(plan, block, value) {
    const key = normalizeForMatch(value);
    return (plan.decisions || []).find((decision) => (
      decision.block === block
      && normalizeForMatch(cleanCatalogPromptForOutput(decision.prompt)) === key
    ));
  }

  function assembleTagEntries(entries, profile, useBreak) {
    const active = entries.filter((entry) => entry.active !== false);
    const beforeNames = new Set(["quality", "style", "loras", "subject", "anatomy"]);
    const before = active.filter((entry) => beforeNames.has(entry.block)).map((entry) => entry.value);
    const after = active.filter((entry) => !beforeNames.has(entry.block)).map((entry) => entry.value);
    const parts = [...before];
    if (useBreak && before.length && after.length) parts.push("BREAK");
    parts.push(...after);
    return uniquePromptsExceptBreak(parts).join(profile.separator);
  }

  function renderTagPrompt(plan, profile, options) {
    const prefixIsRequiredSyntax = requiresScorePrefix(profile);
    const qualityPrefix = prefixIsRequiredSyntax || options.includeQualityPrefix !== false
      ? (profile.qualityPrefix || [])
      : [];
    const entries = [];
    const seen = new Set();
    const addEntries = (block, values, forceProtected = false) => {
      cleanRenderedValues(values).forEach((value) => {
        const key = normalizeForMatch(value);
        if (!key || seen.has(key)) return;
        seen.add(key);
        const decision = renderedDecision(plan, block, value);
        const coreBlock = ["style", "subject", "anatomy", "action", "interaction", "loras"].includes(block);
        entries.push({
          block,
          value,
          active: true,
          protected: forceProtected || coreBlock || decision?.locked === true,
          priority: Number(TAG_BLOCK_PRIORITY[block] || 0) + (decision?.source === "explicit" ? 100 : 0),
          index: entries.length
        });
      });
    };
    addEntries("quality", qualityPrefix, true);
    addEntries("quality", plan.blocks.quality || []);
    addEntries("style", options.styleTokens || [], true);
    addEntries("style", plan.blocks.style || []);
    addEntries("loras", [...(options.loras || []), ...(plan.blocks.loras || [])], true);
    addEntries("subject", plan.blocks.subject || []);
    addEntries("anatomy", plan.blocks.anatomy || []);
    const afterBreakNames = [
      "action", "interaction", "pose", "expression", "wardrobe", "environment",
      "lighting", "camera", "composition", "palette", "motifs", "effects"
    ];
    afterBreakNames.forEach((name) => addEntries(name, plan.blocks[name] || []));

    const useBreak = options.useBreak !== false;
    let positive = assembleTagEntries(entries, profile, useBreak);
    const removable = entries
      .filter((entry) => !entry.protected)
      .sort((left, right) => left.priority - right.priority || right.index - left.index);
    let trimmedCount = 0;
    while (estimateTokens(positive) > profile.maxEstimatedTokens && removable.length) {
      removable.shift().active = false;
      trimmedCount += 1;
      positive = assembleTagEntries(entries, profile, useBreak);
    }
    const renderedBlocks = [];
    [...new Set(entries.map((entry) => entry.block))].forEach((name) => {
      const values = entries.filter((entry) => entry.block === name && entry.active).map((entry) => entry.value);
      if (values.length) renderedBlocks.push({ name, values });
    });
    return { positive, renderedBlocks, trimmedCount };
  }

  function uniquePromptsExceptBreak(values) {
    const seen = new Set();
    return values.filter((value) => {
      if (value === "BREAK") return true;
      const key = normalizeForMatch(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderNaturalLanguage(plan, profile, options) {
    const subject = cleanRenderedValues([...(plan.blocks.subject || []), ...(plan.blocks.anatomy || [])]).join(", ");
    const action = cleanRenderedValues([
      ...(plan.blocks.action || []), ...(plan.blocks.interaction || []), ...(plan.blocks.pose || []), ...(plan.blocks.expression || [])
    ]).join(", ");
    const setting = cleanRenderedValues([
      ...(plan.blocks.wardrobe || []), ...(plan.blocks.environment || []), ...(plan.blocks.lighting || [])
    ]).join(", ");
    const direction = cleanRenderedValues([
      ...(options.styleTokens || []), ...(plan.blocks.style || []), ...(plan.blocks.camera || []),
      ...(plan.blocks.composition || []), ...(plan.blocks.palette || []), ...(plan.blocks.motifs || []), ...(plan.blocks.effects || [])
    ]).join(", ");
    const sentences = [];
    if (subject) sentences.push(`Create an image featuring ${subject}`);
    if (action) sentences.push(`Show ${action}`);
    if (setting) sentences.push(`Set the scene with ${setting}`);
    if (direction) sentences.push(`Use ${direction}`);
    const positive = `${sentences.join(". ")}.`.replace(/^\./, "").trim();
    return {
      positive,
      renderedBlocks: [
        { name: "subject", values: subject ? [subject] : [] },
        { name: "action", values: action ? [action] : [] },
        { name: "setting", values: setting ? [setting] : [] },
        { name: "direction", values: direction ? [direction] : [] }
      ].filter((item) => item.values.length)
    };
  }

  function compilePrompt(plan, options = {}) {
    const profile = checkpointProfile(plan.checkpointId);
    const rendered = profile.promptStyle === "natural_language"
      ? renderNaturalLanguage(plan, profile, options)
      : renderTagPrompt(plan, profile, options);
    const compiled = contracts.createCompiledPrompt(plan);
    compiled.positive = rendered.positive;
    compiled.negative = profile.supportsNegative && options.includeNegative
      ? String(options.negativePrompt || "")
      : "";
    compiled.renderedBlocks = rendered.renderedBlocks;
    compiled.estimatedTokens = estimateTokens(compiled.positive);
    if (rendered.trimmedCount) {
      compiled.warnings.push(`Trimmed ${rendered.trimmedCount} optional prompt fragments to fit ${profile.name}.`);
    }
    if (compiled.estimatedTokens > profile.maxEstimatedTokens) {
      compiled.warnings.push(`Estimated prompt length ${compiled.estimatedTokens} exceeds ${profile.name} target ${profile.maxEstimatedTokens}.`);
    }
    compiled.critic = reasoning.critique(plan, compiled, {
      model: plan.reasoning?.intentModel,
      requiredConceptIds: plan.reasoning?.requiredConceptIds || [],
      maxEstimatedTokens: profile.maxEstimatedTokens
    });
    if (compiled.critic.status === "poor") {
      compiled.warnings.push(`Prompt reasoning score is ${compiled.critic.score}/100; review the unresolved scene directions.`);
    }
    const validation = contracts.validateCompiledPrompt(compiled);
    if (!validation.valid) throw new Error(`Invalid CompiledPrompt: ${validation.errors.join("; ")}`);
    return compiled;
  }

  function generate(rawText, options = {}) {
    const intent = parseIntent(rawText, options);
    const plan = planScene(intent, options);
    const compiled = compilePrompt(plan, options);
    return {
      intent,
      plan,
      compiled,
      reasoning: {
        intentModel: plan.reasoning?.intentModel,
        sceneGraph: plan.reasoning?.sceneGraph,
        variation: plan.reasoning?.variation,
        constraints: plan.reasoning?.constraints,
        critic: compiled.critic
      }
    };
  }

  return Object.freeze({
    // Getters: registerCatalog rebinds these, so captured values would go stale.
    get ALL_CONCEPTS() { return ALL_CONCEPTS; },
    get ALL_ENTITIES() { return ALL_ENTITIES; },
    get ALL_ART_RECIPES() { return ALL_ART_RECIPES; },
    registerCatalog,
    hashString,
    createRandom,
    normalizeForMatch,
    normalizeRequest,
    parseForbidden,
    resolveEntities,
    parseIntent,
    selectArtRecipe,
    checkpointProfile,
    conceptCompatibility,
    cleanCatalogPromptForOutput,
    reasoning,
    planScene,
    compilePrompt,
    estimateTokens,
    generate
  });
});
