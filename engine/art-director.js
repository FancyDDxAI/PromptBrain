(function attachPromptBrainArtDirector(root, factory) {
  const curated = typeof module === "object" && module.exports
    ? require("./curated-knowledge.js")
    : root.PromptBrainCuratedKnowledge;
  const api = factory(curated);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainArtDirector = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArtDirector(curated) {
  "use strict";

  if (!curated) throw new Error("PromptBrain curated knowledge is missing.");

  const SCHEMA_VERSION = 2;
  const conceptIds = new Set(curated.CONCEPTS.map((item) => item.id));
  const conceptById = new Map(curated.CONCEPTS.map((item) => [item.id, item]));

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function phraseOccurs(text, phrase) {
    const haystack = ` ${normalize(text)} `;
    const needle = normalize(phrase);
    return !!needle && haystack.includes(` ${needle} `);
  }

  function stableNoise(seed, value) {
    let hash = (Number(seed) >>> 0) ^ 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function ids(kind, prompts) {
    return prompts.map((prompt) => {
      const id = curated.idFor(kind, prompt);
      if (!id) throw new Error(`Missing curated ${kind} concept: ${prompt}`);
      return id;
    });
  }

  const FAMILIES = Object.freeze([
    {
      id: "graphic-poster", name: "Graphic limited-palette poster", priority: 78,
      triggers: ["graphic", "poster", "bold shapes", "limited palette", "black white red", "design"],
      signals: ["portrait", "oni", "demon", "assassin"],
      styles: ["graphic anime poster", "screen-printed poster design"],
      compositions: ["central iconic composition", "asymmetric visual balance", "poster-like silhouette", "subject breaking the frame"],
      palettes: ["black white and crimson palette", "ivory black and gold palette", "limited three-color palette"],
      lights: ["bright graphic flat lighting", "bold red rim light"],
      cameras: ["close-up portrait", "three-quarter body shot"],
      motifs: ["large circular sun disc", "fractured graphic panels", "Japanese typography accents"],
      effects: ["screen-print texture", "subtle film grain"]
    },
    {
      id: "ukiyoe", name: "Ukiyo-e decorative print", priority: 92,
      triggers: ["ukiyo-e", "ukiyoe", "woodblock", "hokusai", "edo print", "japanese print"],
      signals: ["kimono", "kitsune", "oni", "samurai"],
      styles: ["ukiyo-e inspired illustration", "Japanese woodblock print aesthetic"],
      compositions: ["controlled negative space", "circular framing motif", "asymmetric visual balance", "frame-within-a-frame composition"],
      palettes: ["warm sepia and vermilion palette", "deep violet and antique gold palette", "monochrome ink palette"],
      lights: ["bright graphic flat lighting", "soft reflected fill"],
      cameras: ["three-quarter view", "profile view"],
      motifs: ["wave-pattern border", "falling cherry petals", "ink-brush circle"],
      effects: ["fine paper texture", "visible ink texture"]
    },
    {
      id: "sumi-ink", name: "Sumi-e expressive ink painting", priority: 88,
      triggers: ["sumi-e", "ink wash", "brush painting", "monochrome ink", "calligraphy"],
      signals: ["swordsman", "shrine", "mountain", "spirit"],
      styles: ["sumi-e ink wash illustration", "charcoal and ink rendering"],
      compositions: ["controlled negative space", "diagonal action composition", "single dominant focal point", "asymmetric visual balance"],
      palettes: ["monochrome ink palette", "warm sepia and vermilion palette", "desaturated blue-gray palette"],
      lights: ["diffused overcast light", "soft reflected fill"],
      cameras: ["wide establishing shot", "three-quarter view"],
      motifs: ["ink-brush circle", "smoke forming a spiral", "paper talismans"],
      effects: ["visible ink texture", "painterly edge breakup"]
    },
    {
      id: "art-nouveau", name: "Art Nouveau ornamental portrait", priority: 70,
      triggers: ["art nouveau", "ornamental", "floral border", "decorative portrait", "mucha"],
      signals: ["portrait", "elf", "angel", "gown"],
      styles: ["art nouveau anime illustration", "ornamental fantasy illustration"],
      compositions: ["symmetrical ceremonial framing", "circular framing motif", "central iconic composition", "frame-within-a-frame composition"],
      palettes: ["deep violet and antique gold palette", "soft blush and pearl palette", "emerald and moonlit blue palette"],
      lights: ["soft window light", "delicate rim light"],
      cameras: ["head-and-shoulders portrait", "three-quarter body shot"],
      motifs: ["art nouveau floral border", "ornamental gold filigree", "butterflies crossing the frame"],
      effects: ["fine paper texture", "soft bloom"]
    },
    {
      id: "gothic-glass", name: "Gothic stained-glass drama", priority: 72,
      triggers: ["gothic", "stained glass", "cathedral", "dark church", "religious iconography"],
      signals: ["vampire", "priestess", "demon", "knight"],
      styles: ["gothic stained-glass illustration", "dark fantasy concept art"],
      compositions: ["symmetrical ceremonial framing", "monumental low-angle framing", "triangular character composition", "frame-within-a-frame composition"],
      palettes: ["blood-red monochrome palette", "ivory black and gold palette", "low-key jewel-tone palette"],
      lights: ["stained-glass light patterns", "high-contrast chiaroscuro"],
      cameras: ["from below", "full body shot"],
      motifs: ["gothic rose-window pattern", "architectural arches", "ornamental gold filigree"],
      effects: ["dust caught in light", "subtle vignette"]
    },
    {
      id: "baroque-fantasy", name: "Baroque fantasy tableau", priority: 66,
      triggers: ["baroque", "royal", "opulent", "oil painting", "palace", "ceremonial"],
      signals: ["noble", "queen", "knight", "angel"],
      styles: ["baroque fantasy painting", "luxury character splash art"],
      compositions: ["triangular character composition", "layered depth composition", "central iconic composition", "counterbalanced opposing shapes"],
      palettes: ["ivory black and gold palette", "deep violet and antique gold palette", "low-key jewel-tone palette"],
      lights: ["high-contrast chiaroscuro", "warm practical lighting"],
      cameras: ["three-quarter body shot", "monumental low-angle framing"],
      motifs: ["ornamental gold filigree", "architectural arches", "ribbons caught in wind"],
      effects: ["painterly edge breakup", "subtle film grain"]
    },
    {
      id: "cinematic-action", name: "Cinematic foreshortened action", priority: 84,
      triggers: ["action", "combat", "fighting", "charging", "sprinting", "airborne", "dynamic", "attack"],
      signals: ["sword", "spear", "odm", "battle", "rooftop"],
      styles: ["cinematic anime key visual", "dynamic manga cover"],
      compositions: ["diagonal action composition", "strong leading lines", "subject breaking the frame", "layered depth composition"],
      palettes: ["teal and orange cinematic palette", "sunset amber palette", "stormy cool palette"],
      lights: ["sunset edge light", "delicate rim light"],
      cameras: ["strong foreshortening", "camera inside the action"],
      motifs: ["radiating speed lines", "floating weapon fragments", "scattered glass fragments"],
      effects: ["high-speed debris", "sharp spark trails"]
    },
    {
      id: "cyberpunk-neon", name: "Neon cyberpunk editorial", priority: 76,
      triggers: ["cyberpunk", "neon", "futuristic city", "techwear", "hologram", "night city"],
      signals: ["android", "cyborg", "street", "rain"],
      styles: ["neon cyberpunk anime", "science-fiction production art"],
      compositions: ["layered depth composition", "strong leading lines", "off-center editorial crop", "frame-within-a-frame composition"],
      palettes: ["cyan magenta and black palette", "acid green and ultraviolet palette", "cobalt blue and bright white palette"],
      lights: ["neon sign spill", "holographic glow"],
      cameras: ["wide-angle perspective", "three-quarter view"],
      motifs: ["holographic interface fragments", "constellation lines", "mechanical halo"],
      effects: ["wet reflective surfaces", "long-exposure light trails"]
    },
    {
      id: "epic-fantasy", name: "Epic fantasy story moment", priority: 75,
      triggers: ["fantasy", "elf", "dragon", "magic", "castle", "swordswoman", "enchanted"],
      signals: ["battle", "forest", "ruins", "ice", "storm"],
      styles: ["high fantasy book-cover illustration", "premium anime illustration"],
      compositions: ["layered depth composition", "diagonal action composition", "monumental low-angle framing", "panoramic environmental emphasis"],
      palettes: ["icy blue and silver palette", "emerald and moonlit blue palette", "opal iridescent palette"],
      lights: ["volumetric god rays", "bioluminescent ambient light"],
      cameras: ["wide-angle perspective", "full body shot"],
      motifs: ["glowing magical glyphs", "ribbons caught in wind", "floating weapon fragments"],
      effects: ["floating light particles", "volumetric mist layers"]
    },
    {
      id: "symbolic-horror", name: "Symbolic psychological horror", priority: 96,
      triggers: ["horror", "blood circle", "ritual", "nightmare", "disturbing", "occult", "haunted"],
      signals: ["oni", "demon", "eyes", "bones", "crimson"],
      styles: ["symbolic horror illustration", "psychological horror key visual"],
      compositions: ["top-down symbolic arrangement", "compressed claustrophobic framing", "central iconic composition", "radial composition"],
      palettes: ["blood-red monochrome palette", "black white and crimson palette", "desaturated blue-gray palette"],
      lights: ["low-key horror lighting", "bold red rim light"],
      cameras: ["bird's-eye view", "close-up portrait"],
      motifs: ["ritual blood circle", "shadowy hands in the background", "paper talismans"],
      effects: ["controlled chromatic aberration", "subtle film grain"]
    },
    {
      id: "surreal-dream", name: "Surreal dreamscape portrait", priority: 68,
      triggers: ["surreal", "dream", "dreamlike", "floating", "impossible", "ethereal"],
      signals: ["moon", "mirror", "cloud", "spirit"],
      styles: ["surreal dreamscape illustration", "experimental mixed-media anime"],
      compositions: ["controlled negative space", "radial composition", "subject breaking the frame", "counterbalanced opposing shapes"],
      palettes: ["opal iridescent palette", "rose pink and midnight purple palette", "high-key pastel palette"],
      lights: ["bioluminescent ambient light", "soft reflected fill"],
      cameras: ["wide-angle perspective", "close-up portrait"],
      motifs: ["constellation lines", "butterflies crossing the frame", "smoke forming a spiral"],
      effects: ["dreamlike particle haze", "soft bloom"]
    },
    {
      id: "fashion-editorial", name: "Luxury fashion editorial", priority: 64,
      triggers: ["fashion", "editorial", "luxury", "runway", "glamour", "outfit", "streetwear"],
      signals: ["portrait", "hotel", "studio", "dress"],
      styles: ["fashion editorial illustration", "editorial anime portrait"],
      compositions: ["off-center editorial crop", "asymmetric visual balance", "visual path toward the face", "single dominant focal point"],
      palettes: ["soft blush and pearl palette", "ivory black and gold palette", "rose pink and midnight purple palette"],
      lights: ["cinematic key light", "soft window light"],
      cameras: ["three-quarter body shot", "medium portrait"],
      motifs: ["ornamental gold filigree", "architectural arches", "ribbons caught in wind"],
      effects: ["lens flare used sparingly", "subtle film grain"]
    }
  ]);

  function recipe(family, composition, palette, light, variantIndex) {
    const recipeId = `art.${family.id}.${variantIndex + 1}`;
    const ingredients = {
      quality: ids("quality", [variantIndex % 2 ? "deliberate focal hierarchy" : "museum-quality illustration"]),
      style: ids("style", family.styles),
      composition: ids("composition", [composition]),
      palette: ids("palette", [palette]),
      lighting: ids("lighting", [light, family.lights[(variantIndex + 1) % family.lights.length]]),
      camera: ids("camera", [family.cameras[variantIndex % family.cameras.length]]),
      motifs: ids("motif", [
        family.motifs[variantIndex % family.motifs.length],
        family.motifs[(variantIndex + 1) % family.motifs.length]
      ]),
      effects: ids("effect", [family.effects[variantIndex % family.effects.length]])
    };
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id: recipeId,
      name: `${family.name} ${variantIndex + 1}`,
      aliases: Object.freeze([...family.triggers]),
      contentModes: Object.freeze(["sfw", "adult"]),
      ingredients: Object.freeze(Object.fromEntries(Object.entries(ingredients).map(([key, value]) => [key, Object.freeze(value)]))),
      requiredSlots: Object.freeze(["style", "composition", "palette", "lighting"]),
      optionalSlots: Object.freeze(["quality", "camera", "motifs", "effects"]),
      conflicts: Object.freeze([]),
      triggers: Object.freeze([...family.triggers]),
      signals: Object.freeze([...family.signals]),
      familyId: family.id,
      variantIndex,
      priority: family.priority,
      selectionCounts: Object.freeze({ quality: 1, style: 2, composition: 1, palette: 1, lighting: 2, camera: 1, motifs: 2, effects: 1 })
    });
  }

  let ART_RECIPES = Object.freeze(FAMILIES.flatMap((family) => {
    let index = 0;
    return family.compositions.flatMap((composition) => family.palettes.flatMap((palette) => family.lights.map((light) => (
      recipe(family, composition, palette, light, index++)
    ))));
  }));

  const familyById = new Map(FAMILIES.map((family) => [family.id, family]));

  // Families participating in intent scoring: the curated set plus any registered
  // through registerCatalog. Registered families carry no priority, so curated
  // families keep winning ties and only an explicit trigger hit promotes a
  // registered one.
  let scoringFamilies = FAMILIES.slice();

  function scoringFamily(family) {
    return {
      id: family.id,
      name: family.name,
      category: String(family.category || ""),
      priority: Number.isFinite(family.priority) ? family.priority : 0,
      triggers: Array.isArray(family.triggers) ? family.triggers : [],
      signals: Array.isArray(family.signals) ? family.signals : []
    };
  }

  function registerCatalog(catalog) {
    const added = { concepts: 0, families: 0, recipes: 0 };
    (catalog?.concepts || []).forEach((concept) => {
      if (!concept?.id || conceptIds.has(concept.id)) return;
      conceptIds.add(concept.id);
      conceptById.set(concept.id, concept);
      added.concepts += 1;
    });
    (catalog?.families || []).forEach((family) => {
      if (!family?.id || familyById.has(family.id)) return;
      familyById.set(family.id, family);
      scoringFamilies.push(scoringFamily(family));
      added.families += 1;
    });
    const known = new Set(ART_RECIPES.map((item) => item.id));
    const merged = ART_RECIPES.slice();
    (catalog?.recipes || []).forEach((item) => {
      if (!item?.id || known.has(item.id)) return;
      known.add(item.id);
      merged.push(item);
      added.recipes += 1;
    });
    if (added.recipes) ART_RECIPES = Object.freeze(merged);
    return added;
  }

  function analyzeIntent(intent) {
    const text = normalize(intent?.normalizedText || intent?.rawText);
    const flags = {
      artistic: !!intent?.artDirection?.requested || /\b(artistic|illustration|painting|poster|editorial|cinematic|graphic)\b/.test(text),
      action: /\b(action|combat|fight|fighting|charging|sprinting|running|airborne|attack|battle|flying|leaping)\b/.test(text),
      portrait: /\b(portrait|close up|face|headshot|bust)\b/.test(text),
      environment: /\b(city|forest|palace|cathedral|room|street|rooftop|battlefield|ruins|shrine|landscape)\b/.test(text),
      horror: /\b(horror|blood|ritual|nightmare|occult|haunted|disturbing)\b/.test(text),
      fantasy: /\b(fantasy|elf|dragon|oni|demon|angel|magic|sword|spear|castle|enchanted)\b/.test(text),
      cyberpunk: /\b(cyberpunk|neon|hologram|android|cyborg|futuristic|techwear)\b/.test(text),
      decorative: /\b(ornamental|decorative|ukiyo|woodblock|art nouveau|baroque|stained glass)\b/.test(text),
      fashion: /\b(fashion|editorial|luxury|runway|outfit|dress|streetwear)\b/.test(text),
      quiet: /\b(reading|book|calm|quiet|resting|relaxed|thoughtful|indoors)\b/.test(text),
      studio: /\b(studio|fashion shoot|editorial figure|backdrop)\b/.test(text),
      street: /\b(street|sidewalk|crosswalk|alley|candid|city walk)\b/.test(text),
      field: /\b(field|outdoor|outdoors|expedition|travelling|traveling|journey|hiking)\b/.test(text)
    };
    const familyScores = {};
    scoringFamilies.forEach((family) => {
      let score = family.priority;
      let triggerHits = 0;
      let semanticHits = 0;
      let maxTriggerLength = 0;
      family.triggers.forEach((trigger) => {
        if (phraseOccurs(text, trigger)) {
          // An exact authored family request must beat a broader curated signal.
          score += 280 + normalize(trigger).length;
          triggerHits += 1;
          maxTriggerLength = Math.max(maxTriggerLength, normalize(trigger).length);
        }
      });
      // Specific authored phrases such as "overhead graphic survey grammar"
      // must outrank broad words such as "graphic" that happen to occur inside
      // them. This preserves ordinary broad matching while making every named
      // recipe family directly reachable.
      score += maxTriggerLength * 24;
      family.signals.forEach((signal) => {
        if (phraseOccurs(text, signal)) score += 22;
      });
      if (flags.action && family.id === "cinematic-action") score += 100;
      if (flags.horror && family.id === "symbolic-horror") score += 120;
      if (flags.cyberpunk && family.id === "cyberpunk-neon") score += 100;
      if (flags.fantasy && family.id === "epic-fantasy") score += 70;
      if (flags.fashion && family.id === "fashion-editorial") score += 80;
      if (flags.decorative && ["ukiyoe", "sumi-ink", "art-nouveau", "gothic-glass", "baroque-fantasy"].includes(family.id)) score += 35;
      if (flags.portrait && ["graphic-poster", "art-nouveau", "fashion-editorial", "surreal-dream"].includes(family.id)) score += 24;
      if (family.category === "character-staging") {
        const id = family.id;
        if (flags.portrait && id.includes("grounded-portrait")) semanticHits += 1;
        if (flags.action && id.includes("combat-stance")) semanticHits += 1;
        if (flags.quiet && id.includes("quiet-interior")) semanticHits += 1;
        if (flags.studio && id.includes("editorial-studio")) semanticHits += 1;
        if (flags.field && id.includes("field-adventure")) semanticHits += 1;
        if (flags.street && id.includes("street-candid")) semanticHits += 1;
        score += semanticHits * 155;
      }
      familyScores[family.id] = { score, triggerHits, semanticHits, maxTriggerLength };
    });
    return { text, flags, familyScores };
  }

  function scoreRecipe(item, intent, analysis, memoryScores = {}) {
    if (!item.contentModes.includes(intent.contentMode)) return -Infinity;
    const familyScore = analysis.familyScores[item.familyId];
    if (!familyScore) return -Infinity;
    const specializedEligibility = {
      ukiyoe: familyScore.triggerHits > 0,
      "sumi-ink": familyScore.triggerHits > 0,
      "art-nouveau": familyScore.triggerHits > 0,
      "gothic-glass": familyScore.triggerHits > 0,
      "baroque-fantasy": familyScore.triggerHits > 0,
      "cinematic-action": analysis.flags.action || familyScore.triggerHits > 0,
      "cyberpunk-neon": analysis.flags.cyberpunk || familyScore.triggerHits > 0,
      "epic-fantasy": analysis.flags.fantasy || familyScore.triggerHits > 0,
      "symbolic-horror": analysis.flags.horror || familyScore.triggerHits > 0,
      "fashion-editorial": analysis.flags.fashion || familyScore.triggerHits > 0,
      "surreal-dream": familyScore.triggerHits > 0,
      "graphic-poster": true
    };
    // Curated families keep their hand-tuned eligibility. Registered families are
    // not listed, so they qualify only on an explicit trigger hit.
    const curatedEligibility = specializedEligibility[item.familyId];
    const family = familyById.get(item.familyId);
    const eligible = curatedEligibility === undefined
      ? familyScore.triggerHits > 0 || (family?.category === "character-staging" && familyScore.semanticHits > 0)
      : curatedEligibility;
    if (!eligible) return -Infinity;
    let score = familyScore.score;
    const requested = analysis.flags.artistic || analysis.flags.action || familyScore.triggerHits > 0 || familyScore.semanticHits > 0;
    if (!requested) return -Infinity;
    const text = analysis.text;
    Object.values(item.ingredients).flat().forEach((id) => {
      const concept = conceptById.get(id);
      if (concept && concept.aliases.some((alias) => phraseOccurs(text, alias))) score += 65;
    });
    const ingredientIds = Object.values(item.ingredients).flat();
    if (ingredientIds.length) {
      const memoryValues = ingredientIds.map((id) => {
        const concept = conceptById.get(id);
        return Number(memoryScores[id] || memoryScores[concept?.label] || 0);
      });
      const strongestPositive = Math.max(0, ...memoryValues);
      const negativeAverage = memoryValues.filter((value) => value < 0)
        .reduce((sum, value, _index, values) => sum + value / values.length, 0);
      // Memory is a bounded tie-breaker. It can choose a preferred variant for
      // an under-specified request, but cannot overpower a specific family
      // phrase whose specificity bonus is intentionally much larger.
      score += Math.min(80, strongestPositive * 8);
      score += Math.max(-60, negativeAverage * 8);
    }
    score += stableNoise(intent.seed, item.id) * 12;
    return score;
  }

  function direct(intent, options = {}) {
    const analysis = analyzeIntent(intent);
    const ranked = ART_RECIPES
      .map((item) => ({ recipe: item, score: scoreRecipe(item, intent, analysis, options.memoryScores || {}) }))
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
    if (!ranked.length) return null;
    const primary = ranked[0];
    const family = familyById.get(primary.recipe.familyId);
    const familyName = family?.name || primary.recipe.familyId;
    const direction = {
      recipe: primary.recipe,
      score: primary.score,
      analysis,
      selectionCounts: primary.recipe.selectionCounts,
      rationale: [
        `selected ${familyName}`,
        analysis.flags.action ? "action-driven composition" : "art-direction match",
        analysis.flags.portrait ? "portrait-aware framing" : "scene-aware framing"
      ],
      alternatives: ranked.slice(1, 4).map((item) => ({ id: item.recipe.id, name: item.recipe.name, score: item.score }))
    };
    const validation = validateDirection(direction);
    if (!validation.valid) throw new Error(`Invalid art direction: ${validation.errors.join("; ")}`);
    return direction;
  }

  function validateDirection(direction) {
    const errors = [];
    if (!direction || !direction.recipe) return { valid: false, errors: ["direction.recipe is required"] };
    direction.recipe.requiredSlots.forEach((slot) => {
      if (!direction.recipe.ingredients[slot]?.length) errors.push(`required slot ${slot} is empty`);
    });
    Object.entries(direction.recipe.ingredients).forEach(([slot, values]) => {
      values.forEach((id) => {
        if (!conceptIds.has(id)) errors.push(`${slot} references missing concept ${id}`);
      });
    });
    if (!Number.isFinite(direction.score)) errors.push("direction.score must be finite");
    return { valid: errors.length === 0, errors };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    FAMILIES,
    // Getter: registerCatalog rebinds ART_RECIPES, so a captured value would go stale.
    get ART_RECIPES() { return ART_RECIPES; },
    registerCatalog,
    analyzeIntent,
    scoreRecipe,
    direct,
    validateDirection
  });
});
