(function attachPromptBrainSeed(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainSeedKnowledge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSeedKnowledge() {
  "use strict";

  const SCHEMA_VERSION = 2;

  function profile(id, name, family, options) {
    return Object.freeze({ id, name, family, ...options });
  }

  const WAI = {
    base: "SDXL",
    type: "anime",
    promptStyle: "tags",
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    qualityPrefix: [
      "masterpiece",
      "best quality",
      "premium illustration",
      "clean polished anime shading",
      "anime style"
    ],
    maxEstimatedTokens: 220
  };

  const ILLUSTRIOUS = {
    ...WAI,
    qualityPrefix: ["masterpiece", "best quality", "very aesthetic", "absurdres", "newest", "anime style"]
  };

  const SDXL = {
    base: "SDXL",
    type: "semi-realistic",
    promptStyle: "tags",
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    qualityPrefix: ["masterpiece", "best quality", "high detail", "professional illustration"],
    maxEstimatedTokens: 210
  };

  const SD15_ANIME = {
    base: "SD1.5",
    type: "anime",
    promptStyle: "tags",
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    qualityPrefix: ["masterpiece", "best quality", "anime illustration", "detailed"],
    maxEstimatedTokens: 150
  };

  const SD15_REALISTIC = {
    base: "SD1.5",
    type: "realistic",
    promptStyle: "tags",
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    qualityPrefix: ["RAW photo", "photorealistic", "high detail", "natural skin texture"],
    maxEstimatedTokens: 150
  };

  const PONY = {
    base: "Pony",
    type: "anime",
    promptStyle: "score_tags",
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    qualityPrefix: ["score_9", "score_8_up", "score_7_up", "source_anime"],
    maxEstimatedTokens: 200
  };

  const FLUX = {
    base: "FLUX",
    type: "semi-realistic",
    promptStyle: "natural_language",
    separator: ". ",
    weightSyntax: "none",
    supportsNegative: false,
    qualityPrefix: [],
    maxEstimatedTokens: 260
  };

  const CHECKPOINT_PROFILES = Object.freeze({
    waiIllustriousXL: profile("waiIllustriousXL", "WAI-NSFW Illustrious SDXL", "wai", WAI),
    illustriousXL: profile("illustriousXL", "Illustrious XL", "illustrious", ILLUSTRIOUS),
    noobAIXL: profile("noobAIXL", "NoobAI XL", "illustrious", ILLUSTRIOUS),
    animagineXL: profile("animagineXL", "Animagine XL", "sdxl-anime", WAI),
    ponyDiffusionXL: profile("ponyDiffusionXL", "Pony Diffusion XL", "pony", PONY),
    autismMixPony: profile("autismMixPony", "AutismMix Pony", "pony", PONY),
    dreamShaperXL: profile("dreamShaperXL", "DreamShaper XL", "sdxl", SDXL),
    juggernautXL: profile("juggernautXL", "Juggernaut XL", "sdxl", SDXL),
    anythingV5: profile("anythingV5", "Anything V5", "sd15-anime", SD15_ANIME),
    meinaMix: profile("meinaMix", "MeinaMix", "sd15-anime", SD15_ANIME),
    counterfeitV3: profile("counterfeitV3", "Counterfeit V3", "sd15-anime", SD15_ANIME),
    realisticVisionV6: profile("realisticVisionV6", "Realistic Vision V6", "sd15-realistic", SD15_REALISTIC),
    absoluteReality: profile("absoluteReality", "AbsoluteReality", "sd15-realistic", SD15_REALISTIC),
    cyberRealistic: profile("cyberRealistic", "CyberRealistic", "sd15-realistic", SD15_REALISTIC),
    chilloutMix: profile("chilloutMix", "ChilloutMix", "sd15-realistic", SD15_REALISTIC),
    deliberate: profile("deliberate", "Deliberate", "sd15-realistic", SD15_REALISTIC),
    fluxDev: profile("fluxDev", "FLUX.1 Dev", "flux", FLUX)
  });

  const ENTITIES = Object.freeze([
    {
      id: "character.eren-yeager",
      kind: "named-character",
      name: "Eren Yeager",
      namespace: "Attack on Titan",
      aliases: ["eren yeager", "eren jaeger"],
      promptTags: ["eren yeager", "shingeki no kyojin", "1boy", "paradis military uniform", "green cloak"],
      traits: ["male"],
      adultAllowed: false
    },
    {
      id: "character.android-18",
      kind: "named-character",
      name: "Android 18",
      namespace: "Dragon Ball",
      aliases: ["android 18", "android eighteen"],
      promptTags: ["android 18", "dragon ball", "1girl", "blonde bob cut", "blue eyes"],
      traits: ["female"],
      adultAllowed: true
    },
    {
      id: "character.tohru-maidragon",
      kind: "named-character",
      name: "Tohru",
      namespace: "Miss Kobayashi's Dragon Maid",
      aliases: ["tohru maidragon", "tohru from maid dragon", "tohru kobayashi"],
      promptTags: ["tohru (maidragon)", "kobayashi-san chi no maid dragon", "1girl", "dragon horns", "dragon tail"],
      traits: ["female"],
      adultAllowed: true
    },
    {
      id: "character.power-chainsaw-man",
      kind: "named-character",
      name: "Power",
      namespace: "Chainsaw Man",
      aliases: ["power from chainsaw man", "power chainsaw man"],
      promptTags: ["power (chainsaw man)", "chainsaw man", "1girl", "blonde hair", "red horns"],
      traits: ["female"],
      adultAllowed: false
    },
    {
      id: "character.yor-forger",
      kind: "named-character",
      name: "Yor Forger",
      namespace: "Spy x Family",
      aliases: ["yor forger", "thorn princess"],
      promptTags: ["yor forger", "spy x family", "1girl", "long black hair", "red eyes"],
      traits: ["female"],
      adultAllowed: true
    },
    {
      id: "character.momo-ayase",
      kind: "named-character",
      name: "Momo Ayase",
      namespace: "Dan Da Dan",
      aliases: ["momo ayase"],
      promptTags: ["momo ayase", "dandadan", "1girl", "brown hair"],
      traits: ["female"],
      adultAllowed: false
    }
  ]);

  function concept(id, kind, prompt, aliases = [], options = {}) {
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id,
      kind,
      label: options.label || prompt,
      aliases: Object.freeze([prompt, ...aliases]),
      promptForms: Object.freeze({ default: prompt, ...(options.promptForms || {}) }),
      compatibility: Object.freeze({ bases: options.bases || [], checkpointIds: options.checkpointIds || [] }),
      requires: Object.freeze(options.requires || []),
      conflicts: Object.freeze(options.conflicts || []),
      contentMode: options.contentMode || "sfw",
      group: options.group || "",
      priority: options.priority || 0,
      traits: Object.freeze(options.traits || [])
    });
  }

  const CONCEPTS = Object.freeze([
    concept("style.extremely-artistic", "style", "extremely artistic", ["artistic", "highly artistic", "artistic image"], { priority: 20 }),
    concept("style.premium-anime", "style", "premium anime illustration", ["premium illustration", "high-end anime art"]),
    concept("style.graphic-anime", "style", "graphic anime illustration", ["graphic design", "graphic portrait", "poster design"]),
    concept("style.ukiyoe", "style", "ukiyo-e", ["ukiyoe", "japanese woodblock print"]),
    concept("style.sumi-e", "style", "sumi-e", ["ink wash", "ink wash painting"]),
    concept("style.semi-realistic-anime", "style", "semi realistic anime style", ["semi-realistic anime", "realistic anime"]),
    concept("style.cinematic-anime", "style", "cinematic anime illustration", ["cinematic anime", "anime cinematic"]),
    concept("style.horror", "style", "graphic horror illustration", ["horror", "horror theme", "dark horror"]),
    concept("style.fantasy", "style", "premium fantasy illustration", ["fantasy art", "fantasy illustration"]),
    concept("style.action-key-visual", "style", "dynamic anime action key visual", ["action key visual", "anime action shot"]),

    concept("subject.oni-woman", "subject", "oni woman", ["oni girl", "female oni"], { traits: ["female", "oni"] }),
    concept("subject.miqote-woman", "subject", "Miqo'te woman", ["miqote woman", "miqo te woman", "miqote girl"], { traits: ["female", "cat-eared"] }),
    concept("subject.dragon-girl", "subject", "dragon girl", ["dragon woman", "female dragon humanoid"], { traits: ["female", "dragon"] }),
    concept("subject.ice-elf", "subject", "ice elf woman", ["ice elf", "frost elf"], { traits: ["female", "elf"] }),
    concept("subject.mouse-woman", "subject", "mouse woman", ["mouse girl", "female mouse humanoid"], { traits: ["female", "mouse"] }),
    concept("subject.demon-woman", "subject", "demon woman", ["demon girl", "female demon"], { traits: ["female", "demon"] }),
    concept("subject.fantasy-swordswoman", "subject", "fantasy swordswoman", ["swordswoman", "female sword fighter"], { traits: ["female", "warrior"] }),
    concept("subject.adult-woman", "subject", "adult woman", ["adult female"], { contentMode: "adult", traits: ["female", "adult"] }),
    concept("subject.adult-man", "subject", "adult man", ["adult male"], { contentMode: "adult", traits: ["male", "adult"] }),
    concept("anatomy.oni-horns", "anatomy", "small oni horns", ["oni horns", "one oni horn"]),
    concept("anatomy.dragon-horns", "anatomy", "dragon horns", ["draconic horns"]),
    concept("anatomy.dragon-tail", "anatomy", "dragon tail", ["draconic tail"]),
    concept("anatomy.pointed-elf-ears", "anatomy", "pointed elf ears", ["elf ears"]),
    concept("anatomy.mouse-ears", "anatomy", "small round mouse ears", ["mouse ears"]),
    concept("anatomy.mouse-tail", "anatomy", "thin mouse tail", ["mouse tail"]),

    concept("action.combat", "action", "engaged in fast close-range combat", ["fighting", "fight", "combat", "battle"], { group: "action.primary", priority: 20 }),
    concept("action.airborne", "action", "flying through the city", ["flying", "mid-air", "airborne"], { group: "action.motion", priority: 25 }),
    concept("action.odm-gear", "action", "using three-dimensional maneuver gear", ["using odm gear", "odm gear", "three dimensional maneuver gear"], { priority: 30 }),
    concept("action.charging", "action", "charging forward", ["charging", "rushing forward", "sprinting into battle"], { group: "action.motion", priority: 25 }),
    concept("action.spear", "action", "wielding a long spear", ["with a spear", "holding a spear", "crystal spear"]),
    concept("action.sword", "action", "swinging a sword", ["wielding a sword", "using a sword", "sword attack"]),
    concept("action.psychic", "action", "releasing a psychic force wave", ["psychic attack", "psychic power"]),
    concept("action.standing", "action", "standing still", ["standing"], { group: "pose.base", conflicts: ["pose.lying", "pose.kneeling"] }),
    concept("pose.dynamic-combat", "pose", "dynamic combat pose", ["action pose", "dynamic pose"], { group: "pose.energy" }),
    concept("pose.forward-lean", "pose", "low forward-leaning stance", ["forward leaning combat stance"]),
    concept("pose.airborne-lunge", "pose", "airborne forward lunge", ["flying pose", "mid-air lunge"]),
    concept("pose.foreshortened-reach", "pose", "one hand reaching toward the viewer", ["hand toward camera", "reaching toward viewer"]),
    concept("pose.lying", "pose", "lying down", ["lying", "lying on bed"], { group: "pose.base", conflicts: ["action.standing", "pose.kneeling"] }),
    concept("pose.kneeling", "pose", "kneeling", ["kneeling pose"], { group: "pose.base", conflicts: ["action.standing", "pose.lying"] }),
    concept("pose.contrapposto", "pose", "contrapposto", ["relaxed standing pose"]),

    concept("expression.determined", "expression", "determined expression", ["determined", "focused expression"]),
    concept("expression.intense", "expression", "intense focused eyes", ["intense eyes", "fierce gaze"]),
    concept("expression.unreadable", "expression", "unreadable expression", ["expressionless", "blank expression"]),
    concept("expression.playful", "expression", "playful knowing smile", ["playful smile", "mischievous smile"]),
    concept("expression.dreamy", "expression", "dreamy expression", ["dreamy eyes", "dreamy gaze"]),

    concept("wardrobe.purple-kimono", "wardrobe", "purple kimono", ["violet kimono"]),
    concept("wardrobe.military-uniform", "wardrobe", "paradis military uniform", ["survey corps uniform"]),
    concept("wardrobe.green-cloak", "wardrobe", "green cloak", ["survey corps cloak"]),
    concept("wardrobe.battle-armor", "wardrobe", "layered fantasy battle armor", ["fantasy armor", "battle armor"]),
    concept("wardrobe.no-cape", "wardrobe", "cape", ["cloak"], { group: "wardrobe.cape" }),

    concept("environment.ancient-ruins", "environment", "ancient stone ruins", ["ancient ruins", "ruined temple"]),
    concept("environment.ruined-city", "environment", "ruined city", ["destroyed city", "city ruins"]),
    concept("environment.city", "environment", "dense city rooftops", ["city", "urban skyline"]),
    concept("environment.neon-hotel", "environment", "neon hotel room", ["neon-lit hotel room"]),
    concept("environment.moonlit-bedroom", "environment", "moonlit bedroom", ["bedroom at night"]),
    concept("environment.rooftop", "environment", "high city rooftop", ["rooftop"]),
    concept("environment.japanese-decorative", "environment", "decorative Japanese backdrop", ["japanese backdrop"]),
    concept("environment.hokusai-waves", "environment", "cresting Hokusai waves", ["hokusai waves", "great wave"]),
    concept("environment.cherry-blossoms", "environment", "cherry blossom branches", ["cherry blossoms", "sakura branches"]),

    concept("lighting.cinematic", "lighting", "cinematic lighting", ["cinematic light"]),
    concept("lighting.dramatic", "lighting", "dramatic high-contrast lighting", ["dramatic lighting"]),
    concept("lighting.rim", "lighting", "strong rim light", ["rim light", "rim lighting"]),
    concept("lighting.volumetric", "lighting", "volumetric light", ["volumetric lighting"]),
    concept("lighting.sunset", "lighting", "warm sunset rim light", ["at sunset", "sunset lighting", "sunset"]),
    concept("lighting.moonlight", "lighting", "cool moonlight", ["moonlight", "moonlit"]),
    concept("lighting.red-rim", "lighting", "hard red rim light", ["red rim light"]),
    concept("lighting.soft-ambient", "lighting", "soft ambient light", ["soft lighting"]),

    concept("camera.from-above", "camera", "from above", ["high angle", "overhead view"], { group: "camera.vertical", conflicts: ["camera.from-below"] }),
    concept("camera.from-below", "camera", "from below", ["low angle", "worm's-eye view", "worms eye view"], { group: "camera.vertical", conflicts: ["camera.from-above"] }),
    concept("camera.dutch-tilt", "camera", "dutch tilt", ["dutch angle", "tilted camera"]),
    concept("camera.close-up", "camera", "close-up", ["tight framing"], { group: "camera.distance", conflicts: ["camera.wide"] }),
    concept("camera.wide", "camera", "wide establishing shot", ["wide shot", "wide framing"], { group: "camera.distance", conflicts: ["camera.close-up"] }),
    concept("camera.three-quarter", "camera", "three-quarter view"),
    concept("camera.from-front", "camera", "from front", ["front view"]),
    concept("camera.from-side", "camera", "from side", ["side view", "profile view"]),
    concept("camera.foreshortening", "camera", "dramatic foreshortening", ["foreshortening", "forced perspective"]),
    concept("camera.wide-angle", "camera", "wide-angle lens"),
    concept("camera.shallow-dof", "camera", "shallow depth of field", ["depth of field"]),

    concept("composition.negative-space", "composition", "controlled negative space", ["negative space"]),
    concept("composition.asymmetric", "composition", "asymmetric framing", ["asymmetrical composition"]),
    concept("composition.circular-sun", "composition", "large circular sun backdrop", ["red sun circle", "circular backdrop"]),
    concept("composition.ring", "composition", "subject centered inside a circular ring", ["inside a ring", "ring composition"]),
    concept("composition.overhead", "composition", "symbolic overhead composition", ["overhead composition"]),
    concept("composition.diagonal", "composition", "strong diagonal composition", ["diagonal composition"]),
    concept("composition.leading-lines", "composition", "strong perspective leading lines", ["leading lines"]),
    concept("composition.city-depth", "composition", "deep layered city perspective", ["city depth"]),
    concept("composition.impact", "composition", "high-impact action composition", ["impact composition"]),
    concept("composition.decorative-frame", "composition", "decorative floral framing", ["floral framing"]),

    concept("palette.black-white-red", "palette", "limited jet black, bone white, and blood red palette", ["black white and red", "black white red", "red black white"], { group: "palette.primary", conflicts: ["palette.rainbow"] }),
    concept("palette.purple-gold", "palette", "deep purple, black, white, and gold palette", ["purple and gold palette"]),
    concept("palette.horror-red", "palette", "bone white, black, and saturated crimson palette", ["horror red palette"]),
    concept("palette.sunset", "palette", "muted blue-gray with warm orange sunset accents", ["sunset palette"]),
    concept("palette.fantasy-cold", "palette", "cold blue, silver, and ivory palette", ["icy palette"]),
    concept("palette.rainbow", "palette", "rainbow palette", ["rainbow colors"], { group: "palette.primary", conflicts: ["palette.black-white-red"] }),

    concept("motif.fractured-panels", "motif", "fractured red graphic panels", ["fractured panels", "red shards"]),
    concept("motif.black-feathers", "motif", "drifting black feathers", ["black feathers"]),
    concept("motif.japanese-type", "motif", "warped Japanese typography", ["japanese text", "warped text"]),
    concept("motif.ink-clouds", "motif", "stylized ink-wash clouds", ["ink clouds"]),
    concept("motif.blood-ring", "motif", "ring of blood around the subject", ["ring of blood", "blood circle"]),
    concept("motif.blood-splatter", "motif", "controlled blood splatter", ["blood splatter"]),
    concept("motif.speed-lines", "motif", "directional speed lines", ["speed lines", "motion lines"]),
    concept("motif.floating-debris", "motif", "floating debris", ["flying debris"]),
    concept("motif.cherry-petals", "motif", "drifting cherry blossom petals", ["sakura petals"]),

    concept("effect.film-grain", "effect", "subtle film grain", ["film grain"]),
    concept("effect.chromatic-aberration", "effect", "controlled chromatic aberration", ["chromatic aberration"]),
    concept("effect.motion-blur", "effect", "directional motion blur", ["motion blur"]),
    concept("effect.spark-trails", "effect", "bright spark trails", ["sparks", "spark trails"]),
    concept("effect.ink-texture", "effect", "visible ink and paper texture", ["paper texture", "ink texture"]),
    concept("effect.glowing-particles", "effect", "floating luminous particles", ["glowing particles", "light particles"])
  ]);

  function recipe(id, name, aliases, ingredients, options = {}) {
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      id,
      name,
      aliases: Object.freeze(aliases),
      contentModes: Object.freeze(options.contentModes || ["sfw", "adult"]),
      ingredients: Object.freeze(ingredients),
      requiredSlots: Object.freeze(options.requiredSlots || ["style", "composition", "palette"]),
      optionalSlots: Object.freeze(options.optionalSlots || ["lighting", "motifs", "effects"]),
      conflicts: Object.freeze(options.conflicts || []),
      triggers: Object.freeze(options.triggers || aliases),
      priority: options.priority || 0
    });
  }

  const ART_RECIPES = Object.freeze([
    recipe(
      "art.graphic-limited-palette-portrait",
      "Graphic limited-palette portrait",
      ["graphic design", "graphic portrait", "black white red", "poster design"],
      {
        style: ["style.extremely-artistic", "style.graphic-anime"],
        composition: ["composition.negative-space", "composition.asymmetric", "composition.circular-sun"],
        palette: ["palette.black-white-red"],
        lighting: ["lighting.red-rim", "lighting.dramatic"],
        motifs: ["motif.fractured-panels", "motif.black-feathers", "motif.japanese-type"],
        effects: ["effect.film-grain", "effect.chromatic-aberration"]
      },
      { priority: 80 }
    ),
    recipe(
      "art.ukiyoe-decorative-portrait",
      "Ukiyo-e decorative portrait",
      ["ukiyo-e", "ukiyoe", "hokusai", "sumi-e", "japanese woodblock"],
      {
        style: ["style.extremely-artistic", "style.ukiyoe", "style.sumi-e"],
        composition: ["composition.negative-space", "composition.decorative-frame", "composition.circular-sun"],
        palette: ["palette.purple-gold"],
        lighting: ["lighting.soft-ambient"],
        motifs: ["motif.ink-clouds", "motif.cherry-petals"],
        effects: ["effect.ink-texture"]
      },
      { priority: 90 }
    ),
    recipe(
      "art.symbolic-overhead-horror",
      "Symbolic overhead horror composition",
      ["horror", "ring of blood", "blood circle", "overhead horror"],
      {
        style: ["style.extremely-artistic", "style.horror", "style.graphic-anime"],
        composition: ["composition.overhead", "composition.ring"],
        palette: ["palette.horror-red"],
        lighting: ["lighting.dramatic", "lighting.red-rim"],
        motifs: ["motif.blood-ring", "motif.blood-splatter", "motif.japanese-type"],
        effects: ["effect.film-grain", "effect.chromatic-aberration"]
      },
      { priority: 100 }
    ),
    recipe(
      "art.cinematic-foreshortened-action",
      "Cinematic foreshortened action",
      ["cinematic action", "fighting", "flying", "action scene", "dynamic action"],
      {
        style: ["style.cinematic-anime", "style.action-key-visual"],
        composition: ["composition.diagonal", "composition.leading-lines", "composition.impact"],
        palette: ["palette.sunset"],
        lighting: ["lighting.sunset", "lighting.rim"],
        camera: ["camera.foreshortening", "camera.wide-angle"],
        motifs: ["motif.speed-lines", "motif.floating-debris"],
        effects: ["effect.motion-blur", "effect.spark-trails"]
      },
      { priority: 60 }
    ),
    recipe(
      "art.premium-fantasy-action",
      "Premium fantasy action illustration",
      ["fantasy", "fantasy combat", "swordswoman", "ice elf"],
      {
        style: ["style.extremely-artistic", "style.fantasy"],
        composition: ["composition.diagonal", "composition.impact"],
        palette: ["palette.fantasy-cold"],
        lighting: ["lighting.dramatic", "lighting.rim", "lighting.volumetric"],
        camera: ["camera.foreshortening"],
        motifs: ["motif.floating-debris"],
        effects: ["effect.glowing-particles", "effect.spark-trails"]
      },
      { priority: 50 }
    ),
    recipe(
      "art.cinematic-character-portrait",
      "Cinematic character portrait",
      ["portrait", "cinematic", "artistic"],
      {
        style: ["style.extremely-artistic", "style.premium-anime"],
        composition: ["composition.asymmetric", "composition.negative-space"],
        lighting: ["lighting.cinematic", "lighting.rim"],
        camera: ["camera.three-quarter", "camera.shallow-dof"],
        effects: ["effect.glowing-particles"]
      },
      { requiredSlots: ["style", "composition", "lighting"], optionalSlots: ["camera", "effects"], priority: 10 }
    )
  ]);

  return Object.freeze({
    SCHEMA_VERSION,
    CHECKPOINT_PROFILES,
    ENTITIES,
    CONCEPTS,
    ART_RECIPES
  });
});
