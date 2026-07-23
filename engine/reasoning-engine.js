(function attachPromptBrainReasoning(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainReasoning = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createReasoningEngine() {
  "use strict";

  const VERSION = 1;
  const SOURCE_WEIGHT = Object.freeze({
    explicit: 5000,
    entity: 4400,
    checkpoint: 3600,
    recipe: 2400,
    memory: 1800,
    inferred: 1200,
    fallback: 200
  });
  const BLOCK_LIMITS = Object.freeze({
    quality: 12,
    style: 10,
    subject: 12,
    anatomy: 16,
    action: 5,
    interaction: 5,
    pose: 5,
    expression: 5,
    wardrobe: 10,
    environment: 6,
    lighting: 6,
    camera: 5,
    composition: 5,
    palette: 4,
    motifs: 5,
    effects: 6,
    loras: 12
  });

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9<>:._ -]+/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function unique(values) {
    const seen = new Set();
    return (values || []).filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function stableHash(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededIndex(seed, namespace, length) {
    if (!length) return 0;
    return stableHash(`${Number(seed || 0)}:${namespace}`) % length;
  }

  function has(text, expression) {
    return expression.test(String(text || ""));
  }

  function inferGoals(text) {
    const goals = [];
    if (has(text, /\b(?:attack|battle|charg(?:e|ing)|chas(?:e|ing)|combat|fight|fighting|flee|flying?|jump|leap|running?|sprint|swing)\b/)) goals.push("action");
    if (has(text, /\b(?:portrait|headshot|bust|close[ -]?up|profile picture|character study)\b/)) goals.push("portrait");
    if (has(text, /\b(?:conversation|embrace|hug|interact|kiss|meeting|pair|partners|together|two people)\b/)) goals.push("relationship");
    if (has(text, /\b(?:story|narrative|aftermath|discovery|journey|moment|scene|storytelling)\b/)) goals.push("narrative");
    if (has(text, /\b(?:artistic|artwork|illustration|painting|poster|editorial|key visual|concept art|graphic design)\b/)) goals.push("art-direction");
    if (has(text, /\b(?:calm|cozy|peaceful|quiet|reading|resting|soft|still)\b/)) goals.push("quiet");
    if (has(text, /\b(?:adult|intimate|nsfw|sexual)\b/)) goals.push("adult");
    return unique(goals.length ? goals : ["general"]);
  }

  function inferThemes(text, vibe) {
    const combined = `${text} ${normalize(vibe)}`;
    const themes = [];
    if (has(combined, /\b(?:fantasy|elf|dragon|oni|magic|mage|sword|castle|fae)\b/)) themes.push("fantasy");
    if (has(combined, /\b(?:cyberpunk|neon|android|hologram|science fiction|sci fi|techwear)\b/)) themes.push("science-fiction");
    if (has(combined, /\b(?:gothic|haunted|horror|occult|ritual|nightmare|blood)\b/)) themes.push("horror");
    if (has(combined, /\b(?:cute|kawaii|adorable|pastel|wholesome)\b/)) themes.push("cute");
    if (has(combined, /\b(?:realistic|photograph|photo|cinematic|film still)\b/)) themes.push("realistic");
    if (has(combined, /\b(?:anime|manga|cel shading|illustration)\b/)) themes.push("anime");
    return unique(themes);
  }

  function inferParticipantCount(text, participants) {
    if (has(text, /\b(?:solo|1girl|1boy|one woman|one man|single subject)\b/)) return 1;
    if (has(text, /\b(?:couple|pair|2girls|2boys|1girl and 1boy|two|partner)\b/)) return 2;
    if (has(text, /\b(?:crowd|group|team|squad|three people|four people)\b/)) return 3;
    return Math.max(1, Array.isArray(participants) ? participants.length : 0);
  }

  function inferRelationships(text) {
    const patterns = [
      ["combat", /\b(?:fighting|dueling|attacking|blocking an attack)\b/, true],
      ["pursuit", /\b(?:chasing|pursuing|fleeing from)\b/, true],
      ["conversation", /\b(?:talking|conversation|arguing|whispering to)\b/, true],
      ["affection", /\b(?:embracing|hugging|holding hands|kissing)\b/, true],
      ["cooperation", /\b(?:working together|back to back|team attack)\b/, true],
      ["observation", /\b(?:watching|looking at|facing)\b/, false]
    ];
    return patterns
      .filter(([, expression]) => expression.test(text))
      .map(([type, expression, requiresPartner]) => ({
        type,
        phrase: text.match(expression)?.[0] || type,
        requiresPartner
      }));
  }

  function inferArchetype(goals) {
    if (goals.includes("action")) return "kinetic";
    if (goals.includes("relationship")) return "relational";
    if (goals.includes("portrait")) return "portrait";
    if (goals.includes("quiet")) return "quiet";
    if (goals.includes("narrative")) return "narrative";
    return "general";
  }

  function explicitSlots(intent) {
    const slots = {};
    Object.entries(intent?.blocks || {}).forEach(([block, values]) => {
      if (Array.isArray(values) && values.length) slots[block] = unique(values);
    });
    return slots;
  }

  function compileIntent(intent, options = {}) {
    const text = normalize(intent?.normalizedText || intent?.rawText);
    const goals = inferGoals(text);
    const themes = inferThemes(text, intent?.vibe);
    if ((intent?.entities || []).length && !themes.includes("anime")) themes.push("anime");
    const relationships = inferRelationships(text);
    const requestedParticipants = Math.max(
      inferParticipantCount(text, intent?.participants),
      relationships.some((item) => item.requiresPartner) ? 2 : 1
    );
    const explicit = explicitSlots(intent);
    const forbidden = (intent?.directives?.forbidden || []).map((item) => item.conceptId || item.phrase).filter(Boolean);
    const openSlots = Object.keys(BLOCK_LIMITS).filter((block) => !explicit[block]?.length);
    return {
      version: VERSION,
      requestId: String(intent?.requestId || ""),
      text,
      checkpointId: String(intent?.checkpointId || ""),
      contentMode: intent?.contentMode === "adult" ? "adult" : "sfw",
      vibe: String(intent?.vibe || "Free"),
      seed: Number.isSafeInteger(intent?.seed) ? intent.seed : stableHash(text),
      goals,
      themes,
      archetype: inferArchetype(goals),
      requestedParticipants,
      relationships,
      explicitSlots: explicit,
      openSlots,
      forbidden,
      entityIds: (intent?.entities || []).map((item) => item.id).filter(Boolean),
      confidence: Math.min(1, 0.35 + Object.keys(explicit).length * 0.06 + (intent?.entities?.length || 0) * 0.15),
      policy: {
        preserveIdentity: true,
        inferOpenSlots: options.inferOpenSlots !== false,
        randomizeOpenSlots: options.randomizeOpenSlots !== false,
        memoryMayOverrideExplicit: false
      }
    };
  }

  function buildSceneGraph(intent, model = compileIntent(intent)) {
    const actors = (intent?.participants || []).map((participant, index) => ({
      id: participant.id || `actor.${index + 1}`,
      type: "actor",
      role: participant.role || (index ? "support" : "subject"),
      identity: participant.identity || "",
      gender: participant.gender || "unspecified",
      namespace: participant.namespace || "",
      traits: [...(participant.traits || [])],
      explicit: true
    }));
    if (!actors.length) {
      actors.push({
        id: "actor.subject",
        type: "actor",
        role: "subject",
        identity: "",
        gender: "unspecified",
        namespace: "",
        traits: [],
        explicit: false
      });
    }
    while (actors.length < model.requestedParticipants) {
      actors.push({
        id: `actor.support.${actors.length}`,
        type: "actor",
        role: actors.length === 1 ? "partner" : "support",
        identity: "",
        gender: "unspecified",
        namespace: "",
        traits: [],
        explicit: false
      });
    }

    const nodes = [...actors];
    if (model.explicitSlots.environment?.length) {
      nodes.push({
        id: "setting.primary",
        type: "setting",
        concepts: [...model.explicitSlots.environment],
        explicit: true
      });
    }
    if (model.explicitSlots.camera?.length || model.explicitSlots.composition?.length) {
      nodes.push({
        id: "camera.primary",
        type: "camera",
        concepts: unique([...(model.explicitSlots.camera || []), ...(model.explicitSlots.composition || [])]),
        explicit: true
      });
    }
    if (model.explicitSlots.style?.length) {
      nodes.push({
        id: "style.primary",
        type: "style",
        concepts: [...model.explicitSlots.style],
        explicit: true
      });
    }

    const edges = model.relationships.map((relationship, index) => ({
      id: `relationship.${index + 1}`,
      type: relationship.type,
      phrase: relationship.phrase,
      from: actors[0].id,
      to: relationship.requiresPartner ? actors[1]?.id || "" : "",
      explicit: true
    }));
    return {
      version: VERSION,
      requestId: model.requestId,
      nodes,
      edges,
      actorIds: actors.map((item) => item.id),
      primaryActorId: actors[0].id,
      settingId: nodes.some((item) => item.id === "setting.primary") ? "setting.primary" : "",
      cameraId: nodes.some((item) => item.id === "camera.primary") ? "camera.primary" : ""
    };
  }

  function createVariationProfile(model, options = {}) {
    const protectedBlocks = new Set(Object.keys(model.explicitSlots || {}));
    const axes = ["camera", "lighting", "palette", "composition", "environment", "pose", "expression"]
      .filter((block) => !protectedBlocks.has(block));
    const seed = Number.isSafeInteger(options.seed) ? options.seed : model.seed;
    const axis = axes[seededIndex(seed, "variation-axis", axes.length)] || "effects";
    const energy = model.archetype === "kinetic"
      ? "high"
      : model.archetype === "quiet" || model.archetype === "portrait"
        ? "low"
        : "medium";
    return {
      version: VERSION,
      seed,
      axis,
      archetype: model.archetype,
      energy,
      protectedBlocks: [...protectedBlocks],
      choiceIndex: seededIndex(seed, `variation:${axis}`, 97)
    };
  }

  const POSITIVE_FIT = Object.freeze({
    kinetic: /\b(?:action|airborne|attack|battle|combat|dynamic|foreshorten|impact|kinetic|lunge|motion|running|speed|sprint)\b/,
    portrait: /\b(?:bust|close|eye level|face|head|portrait|shoulder|studio|three quarter)\b/,
    relational: /\b(?:couple|interaction|pair|partner|shared|together|two)\b/,
    quiet: /\b(?:calm|cozy|gentle|quiet|reading|rest|seated|soft|still|window)\b/,
    narrative: /\b(?:aftermath|depth|environment|foreground|layered|narrative|story|wide)\b/
  });
  const NEGATIVE_FIT = Object.freeze({
    kinetic: /\b(?:sleep|resting|static passport|still standing)\b/,
    portrait: /\b(?:extreme wide|speed lines|sprinting|violent impact)\b/,
    relational: /\b(?:solo|single subject)\b/,
    quiet: /\b(?:explosion|high impact|speed lines|violent combat)\b/,
    narrative: /\b(?:blank background|isolated studio)\b/
  });
  const THEME_FIT = Object.freeze({
    fantasy: /\b(?:arcane|castle|dragon|elf|enchanted|fantasy|magic|medieval|oni|sword)\b/,
    "science-fiction": /\b(?:android|cyber|future|hologram|neon|science fiction|technology)\b/,
    horror: /\b(?:blood|gothic|haunted|horror|occult|ritual|shadow)\b/,
    cute: /\b(?:adorable|cute|gentle|kawaii|pastel|soft)\b/,
    realistic: /\b(?:cinematic|film|natural|photo|realistic)\b/,
    anime: /\b(?:anime|cel|illustration|manga)\b/
  });

  function scoreCandidate(item, context = {}) {
    const model = context.model || {};
    const variation = context.variation || {};
    const text = normalize(`${item?.label || ""} ${item?.group || ""} ${Object.values(item?.promptForms || {}).join(" ")}`);
    let score = 0;
    if (POSITIVE_FIT[model.archetype]?.test(text)) score += 18;
    if (NEGATIVE_FIT[model.archetype]?.test(text)) score -= 30;
    (model.themes || []).forEach((theme) => {
      if (THEME_FIT[theme]?.test(text)) score += 9;
    });
    if (variation.axis && (item?.kind === variation.axis || String(item?.group || "").startsWith(`${variation.axis}.`))) {
      score += 5;
    }
    if (variation.energy === "high" && /\b(?:dynamic|impact|motion|strong|dramatic)\b/.test(text)) score += 6;
    if (variation.energy === "low" && /\b(?:gentle|quiet|soft|subtle|still)\b/.test(text)) score += 6;
    return score;
  }

  function semanticClass(block, value) {
    const text = normalize(value);
    if (!text) return null;
    if (block === "camera" || block === "composition") {
      if (/\b(?:from above|high angle|overhead|birds eye|top down)\b/.test(text)) return { group: "camera.vertical", value: "above" };
      if (/\b(?:from below|low angle|worms eye|upward angle)\b/.test(text)) return { group: "camera.vertical", value: "below" };
      if (/\b(?:extreme close|close up|face close|macro portrait)\b/.test(text)) return { group: "camera.distance", value: "close" };
      if (/\b(?:wide establishing|extreme wide|full body|full length|long shot)\b/.test(text)) return { group: "camera.distance", value: "wide" };
    }
    if (block === "pose") {
      if (/\b(?:lying|reclining|on bed|on floor)\b/.test(text)) return { group: "pose.base", value: "lying" };
      if (/\b(?:seated|sitting)\b/.test(text)) return { group: "pose.base", value: "seated" };
      if (/\b(?:kneeling|on knees)\b/.test(text)) return { group: "pose.base", value: "kneeling" };
      if (/\b(?:crouching|crouched)\b/.test(text)) return { group: "pose.base", value: "crouching" };
      if (/\b(?:standing|upright stance)\b/.test(text)) return { group: "pose.base", value: "standing" };
      if (/\b(?:airborne|midair|leaping|flying pose)\b/.test(text)) return { group: "pose.base", value: "airborne" };
    }
    if (block === "subject" || block === "interaction") {
      if (/\b(?:solo|single subject)\b/.test(text)) return { group: "participants.count", value: "solo" };
      if (/\b(?:couple|pair|two people|group|crowd)\b/.test(text)) return { group: "participants.count", value: "multiple" };
    }
    if (["wardrobe", "anatomy", "action"].includes(block)) {
      if (/\b(?:nude|naked|unclothed|no clothing)\b/.test(text)) return { group: "wardrobe.state", value: "unclothed" };
    }
    if (block === "wardrobe") {
      if (/\b(?:armor|blouse|coat|dress|jacket|outfit|robe|shirt|suit|uniform)\b/.test(text)) return { group: "wardrobe.state", value: "clothed" };
    }
    return null;
  }

  function decisionFor(plan, block, prompt) {
    const key = normalize(prompt);
    return (plan.decisions || []).find((decision) => decision.block === block && normalize(decision.prompt) === key);
  }

  function decisionRank(decision, requestText) {
    const source = SOURCE_WEIGHT[decision?.source] || 0;
    const locked = decision?.locked ? 10000 : 0;
    const score = Number(decision?.score || 0);
    const phrase = normalize(decision?.prompt);
    const position = phrase ? requestText.indexOf(phrase) : -1;
    const requestOrder = position >= 0 ? Math.max(0, 1000 - position) : 0;
    return locked + source + score + requestOrder;
  }

  function removePrompt(plan, block, prompt, reason, audit) {
    const key = normalize(prompt);
    const decision = decisionFor(plan, block, prompt);
    plan.blocks[block] = (plan.blocks[block] || []).filter((value) => normalize(value) !== key);
    if (decision) {
      plan.decisions = plan.decisions.filter((item) => item !== decision);
      plan.locked = (plan.locked || []).filter((id) => id !== decision.conceptId);
      plan.rejected.push({
        conceptId: decision.conceptId,
        source: decision.source,
        reason
      });
    }
    audit.push({ block, prompt, conceptId: decision?.conceptId || "", reason });
  }

  function inspectConflicts(plan) {
    const conflicts = [];
    const byGroup = new Map();
    Object.entries(plan?.blocks || {}).forEach(([block, values]) => {
      (values || []).forEach((prompt) => {
        const semantic = semanticClass(block, prompt);
        if (!semantic) return;
        const entry = { block, prompt, semantic, decision: decisionFor(plan, block, prompt) };
        const previous = byGroup.get(semantic.group) || [];
        previous.forEach((other) => {
          if (other.semantic.value !== semantic.value) {
            conflicts.push({ group: semantic.group, left: other, right: entry });
          }
        });
        previous.push(entry);
        byGroup.set(semantic.group, previous);
      });
    });
    return conflicts;
  }

  function resolvePlan(plan, context = {}) {
    const model = context.model || plan?.reasoning?.intentModel || { text: "" };
    const audit = (plan.rejected || [])
      .filter((item) => /\b(?:conflicts?|lower score|replaced)\b/i.test(item.reason || ""))
      .map((item) => ({
        block: "",
        prompt: "",
        conceptId: item.conceptId || "",
        reason: `upstream planner repair: ${item.reason}`
      }));
    if (audit.length && !(plan.warnings || []).some((warning) => warning.includes("Conflicting explicit directions"))) {
      plan.warnings.push(`Conflicting explicit directions were resolved before final prompt assembly (${audit.length} repair${audit.length === 1 ? "" : "s"}).`);
    }
    const requestText = normalize(model.text);

    Object.entries(plan.blocks || {}).forEach(([block, values]) => {
      const seen = new Map();
      [...(values || [])].forEach((prompt) => {
        const key = normalize(prompt);
        if (!key) return;
        if (!seen.has(key)) {
          seen.set(key, prompt);
          return;
        }
        removePrompt(plan, block, prompt, "removed exact semantic duplicate", audit);
      });
    });

    const groups = new Map();
    Object.entries(plan.blocks || {}).forEach(([block, values]) => {
      [...(values || [])].forEach((prompt) => {
        const semantic = semanticClass(block, prompt);
        if (!semantic) return;
        const entry = { block, prompt, semantic, decision: decisionFor(plan, block, prompt) };
        const current = groups.get(semantic.group);
        if (!current) {
          groups.set(semantic.group, entry);
          return;
        }
        const currentRank = decisionRank(current.decision, requestText);
        const candidateRank = decisionRank(entry.decision, requestText);
        const winner = candidateRank > currentRank ? entry : current;
        const loser = winner === entry ? current : entry;
        const redundant = winner.semantic.value === loser.semantic.value;
        const reason = redundant
          ? `removed redundant ${semantic.group} direction`
          : `resolved ${semantic.group} conflict in favor of '${winner.prompt}'`;
        if (winner.decision?.locked && loser.decision?.locked && !redundant) {
          plan.warnings.push(`Conflicting explicit directions were resolved: '${winner.prompt}' replaced '${loser.prompt}'.`);
        }
        removePrompt(plan, loser.block, loser.prompt, reason, audit);
        groups.set(semantic.group, winner);
      });
    });

    Object.entries(BLOCK_LIMITS).forEach(([block, limit]) => {
      const values = [...(plan.blocks?.[block] || [])];
      if (values.length <= limit) return;
      const ranked = values
        .map((prompt, index) => {
          const decision = decisionFor(plan, block, prompt);
          return { prompt, index, decision, rank: decisionRank(decision, requestText) };
        })
        .sort((left, right) => right.rank - left.rank || left.index - right.index);
      ranked.slice(limit).forEach((entry) => {
        if (entry.decision?.locked) return;
        removePrompt(plan, block, entry.prompt, `pruned optional ${block} detail beyond coherence limit`, audit);
      });
    });

    plan.reasoning ||= {};
    plan.reasoning.constraints = {
      version: VERSION,
      changes: audit,
      remainingConflicts: inspectConflicts(plan).map((item) => ({
        group: item.group,
        left: item.left.prompt,
        right: item.right.prompt
      }))
    };
    return plan.reasoning.constraints;
  }

  function critique(plan, compiled, context = {}) {
    const model = context.model || plan?.reasoning?.intentModel || {};
    const issues = [];
    let score = 100;
    const addIssue = (code, severity, message, penalty) => {
      issues.push({ code, severity, message, penalty });
      score -= penalty;
    };
    const hasBlock = (block) => Array.isArray(plan?.blocks?.[block]) && plan.blocks[block].length > 0;
    const selectedIds = new Set((plan?.decisions || []).map((item) => item.conceptId));

    if (!hasBlock("subject")) addIssue("missing-subject", "error", "The scene has no resolved subject.", 28);
    if (model.goals?.includes("action") && !hasBlock("action") && !hasBlock("interaction")) {
      addIssue("missing-action", "error", "The request asks for action but no action survived planning.", 20);
    }
    const graphActors = (plan?.reasoning?.sceneGraph?.nodes || []).filter((item) => item.type === "actor");
    if (model.relationships?.some((item) => item.requiresPartner) && graphActors.length < 2) {
      addIssue("missing-partner", "warning", "A relationship was requested without a second scene actor.", 12);
    }
    (plan?.reasoning?.constraints?.remainingConflicts || []).forEach((conflict) => {
      addIssue("semantic-conflict", "error", `${conflict.left} conflicts with ${conflict.right}.`, 18);
    });
    (context.requiredConceptIds || []).forEach((id) => {
      const repaired = (plan?.rejected || []).some((item) => (
        item.conceptId === id
        && /\b(?:conflicts?|redundant|replaced)\b/i.test(item.reason || "")
      ));
      if (!selectedIds.has(id) && !repaired) {
        addIssue("missing-explicit", "error", `Explicit concept ${id} was not preserved.`, 16);
      }
    });
    Object.entries(plan?.blocks || {}).forEach(([block, values]) => {
      if ((values || []).length > (BLOCK_LIMITS[block] || 99)) {
        addIssue("overloaded-block", "warning", `${block} contains too many competing details.`, 5);
      }
    });
    if ((compiled?.estimatedTokens || 0) > Number(context.maxEstimatedTokens || Infinity)) {
      addIssue("token-budget", "error", "The compiled prompt exceeds the checkpoint token target.", 18);
    }
    if ((plan?.decisions || []).filter((item) => item.source === "fallback").length > 1) {
      addIssue("fallback-heavy", "warning", "Too much of the request remained semantically unresolved.", 8);
    }
    if (model.archetype === "kinetic") {
      const poseText = normalize(plan?.blocks?.pose?.join(" "));
      if (/\b(?:sleeping|resting|still standing)\b/.test(poseText)) {
        addIssue("action-pose-mismatch", "warning", "The selected pose weakens the requested action.", 10);
      }
    }

    const bounded = Math.max(0, Math.min(100, score));
    return {
      version: VERSION,
      score: bounded,
      status: bounded >= 92 ? "excellent" : bounded >= 80 ? "good" : bounded >= 65 ? "needs-review" : "poor",
      issues,
      metrics: {
        actors: graphActors.length || plan?.participants?.length || 0,
        decisions: plan?.decisions?.length || 0,
        explicitDecisions: (plan?.decisions || []).filter((item) => item.locked).length,
        inferredDecisions: (plan?.decisions || []).filter((item) => !item.locked).length,
        populatedBlocks: Object.values(plan?.blocks || {}).filter((values) => values?.length).length,
        estimatedTokens: Number(compiled?.estimatedTokens || 0)
      }
    };
  }

  return Object.freeze({
    VERSION,
    BLOCK_LIMITS,
    normalize,
    stableHash,
    compileIntent,
    buildSceneGraph,
    createVariationProfile,
    scoreCandidate,
    semanticClass,
    inspectConflicts,
    resolvePlan,
    critique
  });
});
