(function attachPromptBrainCuratedKnowledge(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainCuratedKnowledge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCuratedKnowledge() {
  "use strict";

  const SCHEMA_VERSION = 2;
  const entries = [];
  const ids = new Set();
  const promptIndex = new Map();

  function slug(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "item";
  }

  function unique(values) {
    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function defaultGroup(kind, prompt) {
    const text = String(prompt || "").toLowerCase();
    if (kind === "palette") return "palette.primary";
    if (kind === "composition") return "composition.primary";
    if (kind === "environment") return "environment.primary";
    if (kind === "camera") {
      if (/from above|bird's-eye|from below|worm's-eye|high-angle|low-angle|overhead|underlighting/.test(text)) return "camera.vertical";
      if (/close-up|close framing|head-and-shoulders|medium portrait|medium framing|full body|full-body|wide shot|wide framing|establishing|extreme wide/.test(text)) return "camera.distance";
    }
    if (kind === "pose" && /standing|kneeling|crouching|seated|sitting|reclining|lying|airborne/.test(text)) return "pose.base";
    return "";
  }

  function add(kind, prompt, options = {}) {
    const promptText = String(prompt || "").trim();
    if (!promptText) return null;
    const baseId = options.id || `curated.${kind}.${slug(promptText)}`;
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) id = `${baseId}-${suffix++}`;
    ids.add(id);
    const item = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id,
      kind,
      label: options.label || promptText,
      aliases: Object.freeze(unique([promptText, ...(options.aliases || [])])),
      promptForms: Object.freeze({ default: promptText, ...(options.promptForms || {}) }),
      compatibility: Object.freeze({
        bases: Object.freeze([...(options.bases || [])]),
        checkpointIds: Object.freeze([...(options.checkpointIds || [])])
      }),
      requires: Object.freeze([...(options.requires || [])]),
      conflicts: Object.freeze([...(options.conflicts || [])]),
      contentMode: options.contentMode === "adult" ? "adult" : "sfw",
      group: options.group || defaultGroup(kind, promptText),
      priority: Number(options.priority || 0),
      traits: Object.freeze([...(options.traits || [])]),
      provenance: Object.freeze({ source: "phase-5-curated", family: options.family || "direct" })
    });
    entries.push(item);
    promptIndex.set(`${kind}:${promptText.toLowerCase()}`, id);
    return item;
  }

  function addTerms(kind, terms, options = {}) {
    terms.forEach((term) => add(kind, term, options));
  }

  function addMatrix(kind, left, right, options = {}) {
    left.forEach((a) => right.forEach((b) => add(kind, `${a} ${b}`, {
      ...options,
      family: options.family || `${kind}-matrix`
    })));
  }

  const DIRECT = Object.freeze({
    quality: [
      "museum-quality illustration", "award-winning key visual", "publication-ready finish", "gallery-grade rendering",
      "exceptional draftsmanship", "precise visual storytelling", "high-end editorial finish", "polished production art",
      "intricate material rendering", "refined facial construction", "coherent environmental detail", "clean silhouette design",
      "controlled edge quality", "deliberate focal hierarchy", "rich tonal separation", "carefully resolved anatomy",
      "premium color grading", "crisp line confidence", "subtle surface detail", "professional concept art finish",
      "cinematic production value", "balanced microdetail", "strong visual readability", "finely controlled highlights"
    ],
    style: [
      "premium anime illustration", "cinematic anime key visual", "graphic anime poster", "editorial anime portrait",
      "semi-realistic anime rendering", "painterly anime realism", "clean cel animation style", "retro anime cel painting",
      "ukiyo-e inspired illustration", "sumi-e ink wash illustration", "Japanese woodblock print aesthetic",
      "art nouveau anime illustration", "gothic stained-glass illustration", "baroque fantasy painting",
      "dark fantasy concept art", "high fantasy book-cover illustration", "symbolic horror illustration",
      "psychological horror key visual", "surreal dreamscape illustration", "fashion editorial illustration",
      "neon cyberpunk anime", "science-fiction production art", "graphic noir illustration", "watercolor storybook art",
      "gouache character painting", "impasto digital painting", "risograph poster aesthetic", "screen-printed poster design",
      "linocut-inspired illustration", "etched storybook illustration", "charcoal and ink rendering", "soft pastel illustration",
      "ornamental fantasy illustration", "minimalist graphic portrait", "maximalist decorative portrait", "cinematic matte painting",
      "architectural fantasy visualization", "dynamic manga cover", "luxury character splash art", "experimental mixed-media anime"
    ],
    subject: [
      "adult woman", "adult man", "adult androgynous character", "battle-hardened heroine", "wandering swordsman",
      "ice elf woman", "forest elf ranger", "dark elf mage", "oni woman", "dragon woman", "demon woman",
      "angelic warrior", "fallen angel", "succubus woman", "vampire noblewoman", "kitsune woman", "cat woman",
      "wolf woman", "mouse woman", "harpy woman", "mermaid warrior", "cyborg woman", "android woman",
      "masked assassin", "royal knight", "arcane scholar", "street racer", "space pilot", "occult detective",
      "gothic priestess", "desert nomad", "storm witch", "mechanical doll", "celestial guardian", "monster hunter"
    ],
    anatomy: [
      "mature facial structure", "soft facial features", "sharp facial features", "high cheekbones", "defined jawline",
      "athletic build", "slender build", "curvy build", "muscular build", "statuesque build", "compact athletic build",
      "broad shoulders", "narrow shoulders", "long torso", "short torso", "long legs", "powerful thighs",
      "slim waist", "soft waist", "defined waist", "wide hips", "narrow hips", "strong arms", "delicate hands",
      "pointed elf ears", "swept-back oni horns", "single oni horn", "branching antlers", "curved demon horns",
      "small dragon horns", "scaled dragon tail", "fluffy fox tail", "wolf tail", "thin mouse tail", "feathered wings",
      "batlike wings", "translucent insect wings", "subtle facial scales", "glowing body markings", "mechanical limbs"
    ],
    action: [
      "charging forward", "sprinting through the scene", "leaping across a gap", "landing from a jump", "pivoting mid-strike",
      "drawing a sword", "swinging a katana", "thrusting a spear", "firing an arrow", "casting a spell",
      "summoning a barrier", "blocking an incoming strike", "dodging sideways", "sliding under an attack",
      "climbing a ruined wall", "falling through open air", "walking through heavy rain", "running toward the viewer",
      "turning toward the viewer", "reaching into the foreground", "holding a fragile artifact", "examining a glowing map",
      "lighting a lantern", "opening an ancient door", "stepping through a portal", "commanding a battlefield",
      "dancing under falling petals", "playing a string instrument", "painting a calligraphy stroke", "adjusting a glove"
    ],
    interaction: [
      "back-to-back with an ally", "protecting a wounded companion", "facing a towering opponent", "crossing blades with a rival",
      "reaching for another hand", "sharing a quiet glance", "embracing beneath the rain", "supporting an exhausted partner",
      "surrounded by spectral figures", "confronting a mirror reflection", "speaking to a hologram", "leading a squad forward",
      "dueling at arm's length", "circling an opponent", "pulling an ally to safety", "standing before a crowd",
      "kneeling beside a fallen weapon", "holding a companion close", "watching an enemy retreat", "guiding a childlike spirit"
    ],
    pose: [
      "low forward-leaning combat stance", "wide grounded combat stance", "one foot planted forward", "kneeling guard stance",
      "airborne lunge", "deep crouching stance", "twisted torso pose", "contrapposto stance", "upright heroic stance",
      "relaxed seated pose", "sitting on a ledge", "kneeling with straight posture", "lying on one side", "reclining elegantly",
      "leaning against a wall", "arms crossed", "one hand on hip", "both hands on a weapon", "hand reaching toward camera",
      "head tilted slightly", "looking back over shoulder", "shoulders turned away", "cape sweeping behind the body",
      "balanced dancer's pose", "mid-stride pose", "weight shifted onto one leg", "compact defensive posture",
      "open welcoming posture", "tense coiled posture", "silhouette-ready profile pose"
    ],
    expression: [
      "focused determined gaze", "quiet confidence", "cold defiant stare", "controlled anger", "battle-ready glare",
      "subtle knowing smile", "gentle relieved smile", "melancholic distant gaze", "haunted expression", "restrained grief",
      "wide-eyed wonder", "calm analytical expression", "playful smirk", "mischievous grin", "fierce concentration",
      "exhausted resolve", "startled recognition", "solemn composure", "serene closed-eye expression", "intense eye contact",
      "looking past the viewer", "looking toward the horizon", "downcast eyes", "eyes caught by reflected light"
    ],
    wardrobe: [
      "layered winter battle armor", "ornate ceremonial armor", "weathered leather armor", "fitted tactical uniform",
      "high-collared military coat", "long flowing battle coat", "embroidered silk kimono", "formal gothic dress",
      "structured black evening gown", "asymmetric futuristic dress", "luxury streetwear ensemble", "oversized raincoat",
      "cropped moto jacket", "tailored waistcoat", "mechanic's utility suit", "arcane scholar robes", "hooded travel cloak",
      "fur-trimmed mantle", "split combat skirt", "layered pleated skirt", "wide sash belt", "jeweled waist harness",
      "thigh-high combat boots", "polished ankle boots", "strapped armored sandals", "lace-up platform shoes",
      "translucent ice gauntlets", "fingerless leather gloves", "ornamental shoulder guards", "delicate gold jewelry"
    ],
    environment: [
      "frozen battlefield", "snow-covered fortress", "ancient mountain shrine", "misty bamboo forest", "moonlit flower garden",
      "rain-soaked neon alley", "crowded cyberpunk market", "quiet high-rise apartment", "abandoned subway platform",
      "ruined cathedral", "gothic palace corridor", "candlelit occult library", "crimson ritual chamber",
      "sunset city rooftops", "war-torn medieval city", "floating island kingdom", "crystal cavern", "enchanted forest",
      "desert temple courtyard", "storm-battered coastline", "underwater palace", "orbital observation deck",
      "industrial spaceship hangar", "sterile android laboratory", "retro diner at midnight", "luxury hotel lobby",
      "theater backstage", "fashion studio", "traditional tea house", "empty white gallery"
    ],
    lighting: [
      "cinematic key light", "soft window light", "hard side light", "delicate rim light", "bold red rim light",
      "warm practical lighting", "cold moonlight", "blue hour illumination", "golden-hour backlight", "sunset edge light",
      "volumetric god rays", "diffused overcast light", "flickering candlelight", "neon sign spill", "holographic glow",
      "underwater caustic light", "stained-glass light patterns", "lantern-lit atmosphere", "lightning flash illumination",
      "bioluminescent ambient light", "subsurface skin glow", "soft reflected fill", "high-contrast chiaroscuro",
      "low-key horror lighting", "bright graphic flat lighting", "spotlight through haze"
    ],
    camera: [
      "extreme close-up", "close-up portrait", "head-and-shoulders portrait", "medium portrait", "three-quarter body shot",
      "full body shot", "wide establishing shot", "extreme wide shot", "from above", "bird's-eye view", "from below",
      "worm's-eye perspective", "eye-level camera", "three-quarter view", "profile view", "rear three-quarter view",
      "over-the-shoulder view", "dutch tilt", "dynamic diagonal camera", "strong foreshortening", "deep perspective",
      "compressed telephoto perspective", "wide-angle perspective", "macro detail view", "shallow depth of field",
      "deep focus", "foreground framing", "camera close to the ground", "camera inside the action"
    ],
    composition: [
      "rule-of-thirds composition", "central iconic composition", "asymmetric visual balance", "diagonal action composition",
      "triangular character composition", "radial composition", "circular framing motif", "layered depth composition",
      "foreground-middle-background separation", "strong leading lines", "controlled negative space", "poster-like silhouette",
      "graphic shape hierarchy", "frame-within-a-frame composition", "symmetrical ceremonial framing",
      "off-center editorial crop", "panoramic environmental emphasis", "compressed claustrophobic framing",
      "monumental low-angle framing", "top-down symbolic arrangement", "subject breaking the frame", "visual path toward the face",
      "counterbalanced opposing shapes", "single dominant focal point"
    ],
    palette: [
      "black white and crimson palette", "ivory black and gold palette", "deep violet and antique gold palette",
      "icy blue and silver palette", "teal and orange cinematic palette", "cyan magenta and black palette",
      "muted earth-tone palette", "warm sepia and vermilion palette", "soft blush and pearl palette",
      "emerald and moonlit blue palette", "desaturated blue-gray palette", "acid green and ultraviolet palette",
      "cobalt blue and bright white palette", "burnt orange and charcoal palette", "rose pink and midnight purple palette",
      "monochrome ink palette", "high-key pastel palette", "low-key jewel-tone palette", "stormy cool palette",
      "sunset amber palette", "blood-red monochrome palette", "opal iridescent palette", "limited three-color palette"
    ],
    motif: [
      "large circular sun disc", "ink-brush circle", "fractured graphic panels", "ornamental gold filigree",
      "falling cherry petals", "black feathers", "floating ash", "scattered glass fragments", "ribbons caught in wind",
      "glowing magical glyphs", "Japanese typography accents", "art nouveau floral border", "gothic rose-window pattern",
      "ritual blood circle", "constellation lines", "mechanical halo", "holographic interface fragments",
      "wave-pattern border", "smoke forming a spiral", "shadowy hands in the background", "paper talismans",
      "butterflies crossing the frame", "floating weapon fragments", "radiating speed lines", "architectural arches"
    ],
    effect: [
      "subtle film grain", "fine paper texture", "visible ink texture", "screen-print texture", "soft bloom",
      "controlled chromatic aberration", "light motion blur", "sharp spark trails", "floating light particles",
      "shallow atmospheric haze", "rain streaks across the frame", "snow particles in motion", "dust caught in light",
      "painterly edge breakup", "graphic halftone shading", "wet reflective surfaces", "iridescent material highlights",
      "heat distortion", "long-exposure light trails", "volumetric mist layers", "lens flare used sparingly",
      "subtle vignette", "high-speed debris", "glowing embers"
    ]
  });

  Object.entries(DIRECT).forEach(([kind, terms]) => addTerms(kind, terms));

  addMatrix("style", [
    "refined", "expressive", "atmospheric", "graphic", "painterly", "ornamental", "minimalist", "maximalist",
    "cinematic", "editorial", "vintage", "contemporary", "dreamlike", "surreal", "dramatic", "delicate"
  ], [
    "anime illustration", "character painting", "fantasy key visual", "poster artwork", "book-cover art", "concept painting",
    "ink illustration", "watercolor painting", "gouache rendering", "cel-shaded artwork", "mixed-media collage", "fashion illustration"
  ], { family: "style-treatment" });

  addMatrix("action", [
    "carefully", "confidently", "urgently", "relentlessly", "gracefully", "explosively", "silently", "cautiously",
    "desperately", "defiantly", "effortlessly", "precisely", "recklessly", "steadily", "violently", "swiftly"
  ], [
    "advancing", "retreating", "sprinting", "turning", "striking", "blocking", "dodging", "leaping", "landing",
    "climbing", "falling", "reaching", "drawing a weapon", "casting magic", "breaking through debris"
  ], { family: "action-delivery" });

  addMatrix("pose", [
    "balanced", "coiled", "relaxed", "tense", "upright", "low", "wide", "compact", "open", "guarded",
    "asymmetric", "elegant", "aggressive", "defensive", "weight-shifted", "forward-driving"
  ], [
    "standing pose", "kneeling pose", "crouching pose", "seated pose", "reclining pose", "turning pose",
    "mid-stride pose", "airborne pose", "combat pose", "editorial pose", "silhouette pose", "three-quarter pose"
  ], { family: "pose-structure" });

  addMatrix("expression", [
    "barely restrained", "quietly", "openly", "intensely", "subtly", "coldly", "warmly", "playfully",
    "painfully", "proudly", "fearlessly", "nervously", "dreamily", "solemnly", "fiercely", "gently"
  ], [
    "confident expression", "angry expression", "melancholic expression", "joyful expression", "suspicious expression",
    "determined gaze", "distant gaze", "challenging stare", "curious look", "relieved smile", "knowing smile", "haunted gaze"
  ], { family: "expression-nuance" });

  addMatrix("wardrobe", [
    "embroidered silk", "weathered leather", "polished metal", "matte tactical", "translucent crystal", "fur-trimmed",
    "gold-accented", "silver-inlaid", "battle-damaged", "ceremonial", "asymmetric", "structured", "layered", "flowing",
    "high-collared", "ornamented", "minimal", "oversized", "form-fitted", "hand-painted"
  ], [
    "battle coat", "travel cloak", "formal dress", "combat uniform", "kimono", "armor set", "streetwear outfit",
    "evening gown", "mage robe", "pilot suit", "rider jacket", "winter outfit", "festival outfit", "stage costume", "royal ensemble"
  ], { family: "wardrobe-material" });

  const environmentFamilies = [
    [["rain-soaked", "foggy", "neon-lit", "crowded", "deserted", "midnight", "blue-hour", "storm-battered"],
      ["city alley", "rooftop district", "train platform", "market street", "industrial harbor"]],
    [["overgrown", "moonlit", "mist-covered", "ancient", "enchanted", "snow-covered", "autumnal", "sun-dappled"],
      ["forest shrine", "mountain path", "ruined garden", "stone courtyard", "hidden valley"]],
    [["candlelit", "gothic", "abandoned", "opulent", "haunted", "dust-filled", "crimson-lit", "echoing"],
      ["cathedral nave", "palace corridor", "ritual chamber", "grand library", "underground crypt"]],
    [["zero-gravity", "holographic", "sterile", "battle-damaged", "deep-space", "reactor-lit", "retro-futurist", "alien"],
      ["spaceship bridge", "orbital hangar", "research laboratory", "observation deck", "colony corridor"]]
  ];
  environmentFamilies.forEach(([modifiers, anchors]) => addMatrix("environment", modifiers, anchors, { family: "environment-atmosphere" }));

  addMatrix("lighting", [
    "soft", "hard", "diffused", "directional", "sculpted", "flickering", "radiant", "muted", "high-contrast",
    "low-key", "high-key", "colored", "silvery", "golden", "crimson", "cool blue"
  ], [
    "window lighting", "rim lighting", "backlighting", "side lighting", "overhead lighting", "underlighting",
    "practical lighting", "volumetric lighting", "spot lighting", "ambient lighting", "reflected lighting", "silhouette lighting"
  ], { family: "lighting-quality" });

  addMatrix("camera", [
    "intimate", "distant", "kinetic", "observational", "confrontational", "heroic", "vulnerable", "monumental",
    "claustrophobic", "expansive", "documentary", "editorial", "subjective", "surveillance-like", "dreamlike"
  ], [
    "close framing", "medium framing", "full-body framing", "wide framing", "low-angle framing", "high-angle framing",
    "profile framing", "over-the-shoulder framing", "foreground-obstructed framing", "deep-perspective framing"
  ], { family: "camera-intent" });

  addMatrix("composition", [
    "precise", "bold", "restrained", "layered", "rhythmic", "geometric", "organic", "ceremonial", "kinetic",
    "intimate", "monumental", "claustrophobic", "expansive", "editorial", "symbolic"
  ], [
    "asymmetric composition", "central composition", "diagonal composition", "radial composition", "triangular composition",
    "negative-space composition", "frame-within-frame composition", "leading-line composition", "silhouette composition", "depth-layered composition"
  ], { family: "composition-intent" });

  addMatrix("palette", [
    "muted", "luminous", "desaturated", "saturated", "high-contrast", "low-contrast", "dusty", "jewel-toned",
    "pastel", "monochromatic", "duotone", "triadic", "analogous", "complementary", "cold", "warm"
  ], [
    "crimson and ivory palette", "violet and gold palette", "cyan and magenta palette", "blue and silver palette",
    "emerald and black palette", "amber and charcoal palette", "rose and midnight palette", "teal and orange palette",
    "sepia and vermilion palette", "white and cobalt palette"
  ], { family: "palette-treatment" });

  addMatrix("motif", [
    "scattered", "radiating", "spiraling", "falling", "floating", "fractured", "repeating", "oversized", "miniature",
    "foreground", "background", "bordered", "silhouetted", "glowing", "ink-painted"
  ], [
    "petal motifs", "feather motifs", "glass motifs", "ribbon motifs", "glyph motifs", "halo motifs", "wave motifs",
    "floral motifs", "architectural motifs", "constellation motifs"
  ], { family: "motif-arrangement" });

  addMatrix("effect", [
    "subtle", "fine", "controlled", "layered", "directional", "localized", "soft", "sharp", "cinematic", "graphic",
    "painterly", "atmospheric", "high-speed", "dreamlike", "tactile"
  ], [
    "film grain", "paper grain", "ink bleed", "bloom", "motion blur", "light trails", "particle haze", "rain streaks",
    "snow spray", "spark debris"
  ], { family: "effect-treatment" });

  addMatrix("anatomy", [
    "subtle", "delicate", "prominent", "swept-back", "forward-curving", "asymmetric", "glowing", "translucent",
    "armored", "feathered", "scaled", "velvet-furred"
  ], [
    "fantasy horns", "elf ears", "dragon tail", "demon tail", "angel wings", "demon wings", "facial markings",
    "body markings", "clawed hands", "mechanical prosthetics"
  ], { family: "fantasy-anatomy" });

  const adultActs = [
    "consensual intimate embrace", "consensual kissing", "consensual oral intimacy", "consensual vaginal intercourse",
    "consensual anal intercourse", "consensual mutual touching", "consensual masturbation", "consensual manual stimulation",
    "consensual standing intimacy", "consensual seated intimacy", "consensual side-lying intimacy", "consensual face-to-face intimacy",
    "consensual rear-entry intimacy", "consensual partner-on-top intimacy", "consensual group intimacy"
  ];
  addTerms("interaction", adultActs, { contentMode: "adult", family: "adult-interaction" });
  addMatrix("pose", ["close", "entwined", "side-lying", "seated", "standing", "kneeling", "reclining", "face-to-face"],
    ["adult intimate pose", "adult partner pose", "adult embrace pose"], { contentMode: "adult", family: "adult-pose" });

  function idFor(kind, prompt) {
    return promptIndex.get(`${kind}:${String(prompt || "").toLowerCase()}`) || "";
  }

  const CONCEPTS = Object.freeze(entries.slice());
  const COUNTS_BY_KIND = Object.freeze(CONCEPTS.reduce((counts, item) => {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
    return counts;
  }, {}));

  return Object.freeze({
    SCHEMA_VERSION,
    CONCEPTS,
    COUNTS_BY_KIND,
    idFor,
    slug
  });
});
