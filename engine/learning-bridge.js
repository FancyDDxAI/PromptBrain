(function attachPromptBrainLearningBridge(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainLearningBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLearningBridge() {
  "use strict";

  const SCHEMA_VERSION = 1;
  const PREFER_BOOST = 40;
  const CONTEXT_WEIGHTS = Object.freeze({
    checkpoint: 1,
    archetype: 1.25,
    theme: 0.8,
    vibe: 0.6,
    content: 0.4
  });

  function contextValue(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function contextKeys(context = {}) {
    const keys = [];
    const add = (kind, value) => {
      const normalized = contextValue(value);
      if (normalized) keys.push(`${kind}:${normalized}`);
    };
    add("checkpoint", context.checkpointId);
    add("archetype", context.archetype);
    (context.themes || []).forEach((theme) => add("theme", theme));
    add("vibe", context.vibe);
    add("content", context.contentMode);
    return [...new Set(keys)];
  }

  function toTerms(value, extractTerms) {
    if (typeof extractTerms !== "function") return [];
    return extractTerms(String(value || "")).filter(Boolean);
  }

  // Learned preferences become ranking hints only. The engine reads memoryScores by
  // concept id or label, so terms are recorded under both when they resolve.
  function memoryScoresFrom(entries, options = {}) {
    const pull = Number.isFinite(options.pull) ? options.pull : 1;
    const resolve = typeof options.resolveConceptId === "function" ? options.resolveConceptId : () => "";
    const scores = {};
    (entries || []).forEach((entry) => {
      const term = entry?.term;
      if (!term) return;
      const weight = (Number(entry.score ?? entry.weight ?? 1) || 0) * pull;
      scores[term] = weight;
      const conceptId = resolve(term);
      if (conceptId) scores[conceptId] = weight;
    });
    return scores;
  }

  function recordContextFeedback(buckets, context, terms, delta) {
    if (!buckets || typeof buckets !== "object" || !Number.isFinite(delta) || delta === 0) return 0;
    const cleanTerms = [...new Set((terms || []).map((term) => String(term || "").trim()).filter(Boolean))];
    let writes = 0;
    contextKeys(context).forEach((key) => {
      buckets[key] ||= {};
      cleanTerms.forEach((term) => {
        buckets[key][term] = (Number(buckets[key][term]) || 0) + delta;
        if (buckets[key][term] === 0) delete buckets[key][term];
        writes += 1;
      });
    });
    return writes;
  }

  function applyContextScores(scores, buckets, context, options = {}) {
    const resolve = typeof options.resolveConceptId === "function" ? options.resolveConceptId : () => "";
    const pull = Number.isFinite(options.pull) ? options.pull : 1;
    const applied = { buckets: 0, terms: 0 };
    contextKeys(context).forEach((key) => {
      const [kind] = key.split(":");
      const weight = Number(CONTEXT_WEIGHTS[kind] || 0) * pull;
      const entries = buckets?.[key];
      if (!entries || !weight) return;
      applied.buckets += 1;
      Object.entries(entries).forEach(([term, value]) => {
        const contribution = (Number(value) || 0) * weight;
        if (!contribution) return;
        scores[term] = (Number(scores[term]) || 0) + contribution;
        const conceptId = resolve(term);
        if (conceptId) scores[conceptId] = (Number(scores[conceptId]) || 0) + contribution;
        applied.terms += 1;
      });
    });
    return applied;
  }

  /**
   * Fold Prompt Training rules into an intent that already carries the user's
   * explicit requirements.
   *
   * `prefer` only boosts ranking. `avoid` forbids a concept, but stands down when
   * the user explicitly asked for it: training is learning, and learning must never
   * override an explicit request.
   *
   * Mutates `intent.directives.forbidden` and `memoryScores`; returns a report.
   */
  function applyTraining(rules, intent, memoryScores, options = {}) {
    const extractTerms = options.extractTerms;
    const resolve = typeof options.resolveConceptId === "function" ? options.resolveConceptId : () => "";
    const applied = { rules: 0, preferred: 0, forbidden: 0, skippedBecauseExplicit: [] };
    if (!intent?.directives) return applied;

    const explicitIds = new Set((intent.directives.required || []).map((item) => item.conceptId).filter(Boolean));
    const forbidden = intent.directives.forbidden || [];
    const list = Array.isArray(rules) ? rules : [];
    applied.rules = list.length;

    list.forEach((rule) => {
      toTerms(rule?.prefer, extractTerms).forEach((term) => {
        const key = resolve(term) || term;
        memoryScores[key] = (Number(memoryScores[key]) || 0) + PREFER_BOOST;
        applied.preferred += 1;
      });
      toTerms(rule?.avoid, extractTerms).forEach((term) => {
        // Unresolved terms are skipped: the engine only emits catalog concepts, and
        // a bare phrase is not enforced during selection.
        const conceptId = resolve(term);
        if (!conceptId) return;
        if (explicitIds.has(conceptId)) {
          if (!applied.skippedBecauseExplicit.includes(conceptId)) applied.skippedBecauseExplicit.push(conceptId);
          return;
        }
        if (forbidden.some((item) => item.conceptId === conceptId)) return;
        forbidden.push({ conceptId });
        applied.forbidden += 1;
      });
    });
    return applied;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    PREFER_BOOST,
    CONTEXT_WEIGHTS,
    contextKeys,
    memoryScoresFrom,
    recordContextFeedback,
    applyContextScores,
    applyTraining
  });
});
