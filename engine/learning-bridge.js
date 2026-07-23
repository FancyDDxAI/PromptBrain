(function attachPromptBrainLearningBridge(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainLearningBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLearningBridge() {
  "use strict";

  const SCHEMA_VERSION = 1;
  const PREFER_BOOST = 40;

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

  return Object.freeze({ SCHEMA_VERSION, PREFER_BOOST, memoryScoresFrom, applyTraining });
});
