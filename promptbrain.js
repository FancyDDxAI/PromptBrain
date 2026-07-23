const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const storageKey = "promptbrain.v2.backup";
const legacyStorageKey = "promptbrain.v1";
const apiClientHeaders = Object.freeze({ "X-PromptBrain-Client": "PromptBrainDesktop" });
const defaultNegative = "low quality, blurry, bad anatomy, extra fingers, missing fingers, deformed hands, distorted face, watermark, text, logo, jpeg artifacts, duplicate limbs";
const defaultRules = "Use clear comma-separated prompt chunks. Put quality and style first, then subject, action, pose, expression, wardrobe, environment, lighting, camera, and finishing details.";
const legacyDefaultRules = "Use clear comma-separated prompt chunks. Include subject, pose, expression, outfit, lighting, camera, background, composition, quality tags, and a separate negative prompt.";
const BAD_DEFAULT_SELECTED_TAGS = new Set([
  "lighting a cigarette",
  "lying on stomach",
  "angry stare",
  "quiet apartment",
  "cinematic lighting",
  "worm's-eye perspective",
  "low angle",
  "full body shot",
  "pastel colors"
]);
const CHECKPOINT_RULES = {
  realisticVisionV6: {
    id: "realisticVisionV6",
    name: "Realistic Vision V6",
    type: "realistic",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["RAW photo", "photorealistic", "high detail", "realistic skin texture"],
    qualitySuffix: ["sharp focus", "natural lighting", "professional color grading"],
    negativeBase: ["EasyNegative", "bad anatomy", "deformed hands", "extra fingers", "low quality", "blurry", "cartoon", "cgi", "plastic skin", "overprocessed"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Works best with concrete camera, lens, lighting, and realistic material details."
  },
  absoluteReality: {
    id: "absoluteReality",
    name: "AbsoluteReality",
    type: "realistic",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["RAW photo", "realistic", "detailed face", "natural skin"],
    qualitySuffix: ["cinematic light", "high resolution", "realistic proportions"],
    negativeBase: ["bad anatomy", "deformed", "lowres", "worst quality", "bad hands", "extra limbs", "cartoon", "painting", "oversaturated"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Good all-round realistic model. Avoid too many anime tags."
  },
  cyberRealistic: {
    id: "cyberRealistic",
    name: "CyberRealistic",
    type: "realistic",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["RAW photo", "photorealistic", "cinematic realism", "detailed skin"],
    qualitySuffix: ["dramatic lighting", "sharp focus", "high detail"],
    negativeBase: ["bad anatomy", "deformed face", "bad hands", "low quality", "blurry", "cgi", "3d render", "cartoon", "watermark"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Strong for realistic portraits, moody light, urban scenes, and cyberpunk styling."
  },
  dreamShaperXL: {
    id: "dreamShaperXL",
    name: "DreamShaper XL",
    type: "semi-realistic",
    base: "SDXL",
    promptStyle: "tags",
    qualityPrefix: ["masterpiece", "best quality", "high detail"],
    qualitySuffix: ["cinematic composition", "detailed background", "atmospheric depth"],
    negativeBase: ["low quality", "blurry", "bad anatomy", "extra fingers", "deformed", "text", "watermark"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Flexible SDXL checkpoint. Longer descriptive tag chains work well."
  },
  illustriousXL: {
    id: "illustriousXL",
    name: "Illustrious XL",
    type: "anime",
    base: "SDXL",
    promptStyle: "tags",
    qualityPrefix: ["masterpiece", "best quality", "amazing quality", "very aesthetic", "absurdres", "newest"],
    qualitySuffix: ["official art", "premium illustration", "clean polished anime shading", "detailed background"],
    negativeBase: ["worst quality", "low quality", "bad quality", "lowres", "jpeg artifacts", "bad anatomy", "bad hands", "extra fingers", "missing fingers", "text", "watermark", "signature", "logo", "censored"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Illustrious-style SDXL anime model. Use clean Danbooru-style tags with quality tags first."
  },
  waiIllustriousXL: {
    id: "waiIllustriousXL",
    name: "WAI-NSFW Illustrious SDXL",
    type: "anime",
    base: "SDXL",
    promptStyle: "tags",
    qualityPrefix: ["masterpiece", "best quality", "premium illustration", "clean polished anime shading", "anime style"],
    qualitySuffix: [],
    negativeBase: ["worst quality", "low quality", "bad quality", "lowres", "scan artifacts", "jpeg artifacts", "sketch", "bad anatomy", "bad hands", "extra fingers", "missing fingers", "text", "watermark", "signature", "username", "logo", "censored", "mosaic censor", "bar censor"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "WAI/Illustrious anime style. Best with explicit Danbooru tags, clean anatomy tags, and direct action wording."
  },
  noobAIXL: {
    id: "noobAIXL",
    name: "NoobAI XL",
    type: "anime",
    base: "SDXL",
    promptStyle: "tags",
    qualityPrefix: ["very awa", "masterpiece", "best quality", "newest", "highres", "absurdres"],
    qualitySuffix: ["anime coloring", "detailed face", "detailed eyes", "clean lineart"],
    negativeBase: ["worst quality", "low quality", "normal quality", "lowres", "bad anatomy", "bad hands", "extra digits", "missing fingers", "fused fingers", "text", "watermark", "signature", "censored"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "NoobAI XL understands Danbooru-style tags well. Keep subject, action, pose, outfit, and camera tags explicit."
  },
  animagineXL: {
    id: "animagineXL",
    name: "Animagine XL",
    type: "anime",
    base: "SDXL",
    promptStyle: "tags",
    qualityPrefix: ["rating: general"],
    qualitySuffix: ["masterpiece", "high score", "great score", "absurdres"],
    negativeBase: ["lowres", "bad anatomy", "bad hands", "text", "error", "missing fingers", "extra digit", "fewer digits", "cropped", "worst quality", "low quality", "normal quality", "jpeg artifacts", "signature", "watermark", "username", "blurry"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Animagine-style anime SDXL. Use rating tags plus clear character, act, pose, and outfit tags."
  },
  autismMixPony: {
    id: "autismMixPony",
    name: "AutismMix / Pony XL",
    type: "anime",
    base: "Pony",
    promptStyle: "score_tags",
    qualityPrefix: ["score_9", "score_8_up", "score_7_up", "score_6_up"],
    qualitySuffix: ["source_anime", "masterpiece", "best quality", "ultra detailed"],
    negativeBase: ["score_4", "score_3", "score_2", "score_1", "source_furry", "source_pony", "bad anatomy", "bad hands", "extra fingers", "missing fingers", "censored", "watermark", "signature"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Pony-line anime model. Keep score tags first, then source and Danbooru-style subject/action tags."
  },
  deliberate: {
    id: "deliberate",
    name: "Deliberate",
    type: "semi-realistic",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["masterpiece", "best quality", "highly detailed"],
    qualitySuffix: ["strong composition", "sharp details", "balanced lighting"],
    negativeBase: ["low quality", "worst quality", "bad anatomy", "bad hands", "extra limbs", "deformed", "mutated", "watermark"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Works well with deliberate composition and clear subject/background separation."
  },
  juggernautXL: {
    id: "juggernautXL",
    name: "Juggernaut XL",
    type: "realistic",
    base: "SDXL",
    promptStyle: "tags",
    qualityPrefix: ["cinematic photo", "high detail", "professional photography"],
    qualitySuffix: ["realistic lighting", "sharp focus", "8k detail"],
    negativeBase: ["low quality", "blurry", "deformed", "bad anatomy", "extra fingers", "text", "watermark", "logo"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Great for polished realism. Use natural camera terms and fewer old SD1.5 negatives."
  },
  anythingV5: {
    id: "anythingV5",
    name: "Anything V5",
    type: "anime",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["masterpiece", "best quality", "ultra detailed", "official art", "premium illustration"],
    qualitySuffix: ["clean polished anime shading", "beautiful detailed eyes", "detailed hair", "detailed clothing"],
    negativeBase: ["EasyNegative", "worst quality", "low quality", "bad anatomy", "bad hands", "extra fingers", "text", "watermark"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Classic anime tags and quality prefixes matter a lot."
  },
  meinaMix: {
    id: "meinaMix",
    name: "MeinaMix",
    type: "anime",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["masterpiece", "best quality", "ultra detailed", "official art", "premium illustration"],
    qualitySuffix: ["soft anime shading", "clean polished anime shading", "beautiful detailed eyes"],
    negativeBase: ["EasyNegative", "bad anatomy", "bad hands", "low quality", "worst quality", "extra limbs", "signature", "watermark"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Soft anime rendering. Good with cute, fantasy, portrait, and detailed outfit tags."
  },
  chilloutMix: {
    id: "chilloutMix",
    name: "ChilloutMix",
    type: "realistic",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["RAW photo", "realistic", "detailed skin", "portrait photography"],
    qualitySuffix: ["soft light", "natural face", "realistic texture"],
    negativeBase: ["bad anatomy", "bad hands", "low quality", "blurry", "cgi", "cartoon", "deformed", "watermark"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Strong for portraits. Use camera/lens terms and realistic styling."
  },
  counterfeitV3: {
    id: "counterfeitV3",
    name: "Counterfeit V3",
    type: "anime",
    base: "SD1.5",
    promptStyle: "tags",
    qualityPrefix: ["masterpiece", "best quality", "ultra detailed", "official art", "premium illustration"],
    qualitySuffix: ["clean lineart", "clean polished anime shading", "detailed character"],
    negativeBase: ["EasyNegative", "worst quality", "low quality", "bad anatomy", "bad hands", "extra digits", "text", "logo"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Anime illustration style. Keep tags concise and character-focused."
  },
  ponyDiffusionXL: {
    id: "ponyDiffusionXL",
    name: "Pony Diffusion XL",
    type: "anime",
    base: "Pony",
    promptStyle: "score_tags",
    qualityPrefix: ["score_9", "score_8_up", "score_7_up", "score_6_up"],
    qualitySuffix: ["source_anime", "masterpiece", "best quality", "ultra detailed", "official art"],
    negativeBase: ["score_4", "score_3", "score_2", "score_1", "bad anatomy", "bad hands", "censored", "watermark"],
    separator: ", ",
    weightSyntax: "classic",
    supportsNegative: true,
    tips: "Pony needs score tags first. Use tag-style prompts and source tags."
  },
  fluxDev: {
    id: "fluxDev",
    name: "FLUX.1 Dev",
    type: "realistic",
    base: "FLUX",
    promptStyle: "natural_language",
    qualityPrefix: [],
    qualitySuffix: [],
    negativeBase: [],
    separator: ". ",
    weightSyntax: "none",
    supportsNegative: false,
    tips: "Use natural language. Avoid old weight syntax and negative prompt blocks."
  }
};

let catalogLoraKb = [];

const STYLE_TOKEN_KB = [
  { id: "usnr", label: "usnr", prompt: "usnr", description: "prompt: usnr / USNR STYLE", compatibleBases: ["SDXL", "Pony"], compatibleTypes: ["anime"] },
  { id: "bbg_style", label: "bbg_style", prompt: "bbg_style", description: "prompt: bbg_style / Beagan Bong style", compatibleBases: ["SDXL", "Pony"], compatibleTypes: ["anime"] },
  { id: "748cmstyle", label: "748cmstyle", prompt: "748cmstyle", description: "prompt: 748cmstyle / 748cm style", compatibleBases: ["SDXL", "Pony"], compatibleTypes: ["anime"] }
];

const BUILDER_CATEGORIES = ["Style", "Quality", "Character", "Act", "Pose", "Expression", "Clothing", "Hair", "Environment", "Lighting", "Camera/Composition", "Color Palette", "Negative"];
const VIBES = ["Free", "Sexy", "Badass", "Dark & Moody", "Soft & Cute", "Sci-Fi", "Fantasy", "Portrait", "Horror", "Action"];
const WEIGHT_STEPS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 0.9, 0.8];
const CHECKPOINT_ORDER = ["anythingV5", "illustriousXL", "waiIllustriousXL", "noobAIXL", "animagineXL", "ponyDiffusionXL", "autismMixPony", "meinaMix", "counterfeitV3", "dreamShaperXL", "juggernautXL", "deliberate", "realisticVisionV6", "absoluteReality", "cyberRealistic", "chilloutMix", "fluxDev"];

const CATEGORY_BASE = {
  "Style": ["anime style", "official art", "premium illustration", "anime key visual", "light novel cover", "manga cover art", "visual novel CG", "character splash art", "high-end anime illustration", "clean polished anime shading", "cel shading", "soft anime rendering", "semi-realistic anime", "detailed anime painting", "dynamic anime illustration", "fantasy anime art", "battle anime key art", "beautiful anime face", "sharp lineart", "clean lineart", "expressive linework", "studio anime style", "crisp digital painting", "polished character art", "high contrast anime art", "dramatic anime poster", "cinematic anime scene", "detailed background art", "production art", "concept art"],
  "Quality": ["masterpiece", "best quality", "ultra detailed", "official art", "premium illustration", "absurdres", "highres", "very aesthetic", "detailed face", "beautiful detailed eyes", "detailed hair", "detailed clothing", "detailed background", "clean polished anime shading", "sharp focus", "clean anatomy", "beautiful composition", "dynamic composition", "strong silhouette", "clear subject focus", "crisp details", "polished rendering", "high fidelity", "smooth shading", "intricate details", "finely detailed", "clean color separation", "professional anime finish", "no text", "no watermark"],
  "Character": ["1girl", "1boy", "solo", "adult", "young adult", "ice elf woman", "dark elf woman", "fire mage woman", "sword princess", "battle maiden", "demon girl", "angel girl", "catgirl", "fox girl", "dragon girl", "vampire woman", "witch girl", "samurai girl", "knight girl", "ninja girl", "idol girl", "office lady", "school uniform character", "slim waist", "soft curves", "big breasts", "medium breasts", "small breasts", "wide hips", "elegant hips", "thick thighs", "athletic body", "muscular body", "petite body", "tall body", "sharp beautiful face", "pointed elf ears", "blue eyes", "red eyes", "golden eyes", "freckles", "beauty mark"],
  "Act": ["standing still", "walking forward", "running forward", "charging forward", "leaping through the air", "attacking with a sword", "swinging a katana", "aiming a bow", "casting a spell", "summoning magic", "blocking an attack", "dodging sideways", "landing from a jump", "sliding across ice", "crushing the ground under one foot", "cape whipping violently behind her", "holding a long crystal spear", "raising a glowing weapon", "reaching toward the viewer", "turning around suddenly", "looking over shoulder while walking", "kneeling in snow", "sitting on ruins", "standing on a rooftop", "floating above the ground", "dancing in the wind", "adjusting gloves", "pulling cloak tighter", "touching hair", "holding mask near face", "riding a motorcycle"],
  "Pose": ["low forward-leaning combat stance", "wide combat stance", "contrapposto", "dynamic action pose", "heroic pose", "power stance", "one foot forward", "one knee bent", "kneeling pose", "crouching pose", "reclining pose", "laying on side", "sitting on edge", "arms crossed", "one hand on hip", "both hands on weapon", "hands behind back", "hands on chest", "hand reaching out", "head tilted down", "chin raised", "arched back", "twisted torso", "legs crossed", "one leg raised", "looking back over shoulder", "full body pose", "upper body pose", "close-up face pose", "asymmetrical pose"],
  "Expression": ["serious expression", "focused eyes", "determined gaze", "angry stare", "battle-ready glare", "cold expression", "confident smirk", "soft smile", "gentle smile", "shy smile", "embarrassed blush", "flustered expression", "teary eyes", "sad eyes", "wide-eyed surprise", "mysterious smile", "playful grin", "open mouth", "parted lips", "biting lip", "heavy-lidded eyes", "half-closed eyes", "looking at viewer", "looking away", "looking down", "looking up", "side glance", "intense eye contact", "smug expression", "calm expression"],
  "Clothing": ["white and pale blue fitted battle outfit", "layered winter armor", "fur-trimmed shoulders", "jeweled waist harness", "split combat skirt", "thigh-high boots", "translucent ice gauntlets", "cape", "long flowing cloak", "battle dress", "armored bodysuit", "fantasy armor", "kimono armor", "school uniform", "sailor uniform", "maid outfit", "idol outfit", "witch robe", "gothic dress", "black bodysuit", "white bodysuit", "leather jacket", "cropped jacket", "oversized sweater", "short skirt", "pleated skirt", "thighhighs", "garter straps", "ribbon", "choker", "gloves", "detached sleeves", "high heels", "combat boots"],
  "Hair": ["long icy blue hair", "silver-blue highlights", "long hair", "short hair", "medium hair", "very long hair", "flowing hair", "windblown hair", "messy hair", "straight hair", "wavy hair", "curly hair", "twin tails", "ponytail", "high ponytail", "side ponytail", "braided hair", "hair over one eye", "bangs", "hime cut", "bob cut", "black hair", "white hair", "silver hair", "blonde hair", "red hair", "blue hair", "pink hair", "purple hair", "green hair", "gradient hair"],
  "Environment": ["frozen battlefield", "snowy battlefield", "blizzard battlefield", "ice ruins", "frozen lake", "cracked ice floor", "snowy forest", "enchanted forest", "ancient temple", "ruined cathedral", "fantasy castle", "burning battlefield", "stormy sky", "moonlit rooftop", "neon city street", "rain-soaked alley", "cyberpunk city", "spaceship corridor", "desert ruins", "flower field", "misty forest", "mountain pass", "ocean cliff", "underwater ruins", "magic academy", "throne room", "bedroom interior", "studio backdrop", "empty white background", "dramatic black background"],
  "Lighting": ["dramatic lighting", "heroic rim light", "blue-white energy glow", "cold moonlight", "volumetric light", "backlighting", "strong rim light", "cinematic lighting", "soft studio lighting", "golden hour", "neon lighting", "firelight", "light rays", "sparkling magic light", "glowing weapon light", "storm light", "high contrast lighting", "low-key lighting", "soft ambient light", "bloom", "reflected light", "subsurface glow", "dark shadows", "bright highlights", "atmospheric lighting"],
  "Camera/Composition": ["worm's-eye perspective", "low angle", "from below", "dynamic perspective", "wide angle", "full body shot", "medium shot", "close-up", "portrait close-up", "three-quarter view", "side view", "front view", "back view", "over the shoulder", "dutch angle", "cinematic framing", "diagonal composition", "very dynamic composition", "centered composition", "rule of thirds", "leading lines", "foreground snow particles", "depth of field", "motion blur", "speed lines", "wide battlefield shot", "extreme close-up", "looking up at subject", "looking down at subject", "dramatic foreshortening"],
  "Color Palette": ["blue-white palette", "silver and pale blue", "icy cyan palette", "white and gold", "black and red", "red and black", "purple and cyan", "blue and magenta", "gold and crimson", "cold colors", "warm colors", "pastel colors", "muted colors", "vivid colors", "high contrast colors", "monochrome", "sepia tone", "neon colors", "dark palette", "bright palette", "soft gradients", "glowing cyan accents", "amber highlights", "deep shadows", "snowy whites"],
  "Negative": ["low quality", "worst quality", "normal quality", "lowres", "blurry", "jpeg artifacts", "bad anatomy", "bad hands", "extra fingers", "missing fingers", "fused fingers", "extra arms", "extra legs", "missing limbs", "duplicate limbs", "deformed face", "distorted face", "bad eyes", "cross-eye", "bad proportions", "long neck", "mutated hands", "poorly drawn hands", "cropped", "out of frame", "text", "watermark", "signature", "logo", "censored", "bar censor", "mosaic censor", "flat lighting", "messy background"]
};

const VIBE_CATEGORY_TAGS = {
  "Free": {},
  "Sexy": {
    "Act": ["touching hair", "adjusting thighhighs", "pulling down shoulder strap", "sitting on bed", "laying on side", "kneeling on bed", "looking back over shoulder", "stretching arms above head", "holding bedsheet", "hand on chest", "hand on thigh", "soft tease pose", "posing in mirror", "slowly removing glove", "leaning close to viewer", "sitting with legs crossed", "arched back", "biting lip", "bedroom pose", "pin-up pose"],
    "Pose": ["reclining pose", "laying on side", "kneeling pose", "arched back", "legs crossed", "one leg raised", "looking over shoulder", "hands on chest", "hand on thigh", "close-up chest framing", "soft pin-up pose", "bed pose"],
    "Expression": ["half-closed eyes", "biting lip", "flustered expression", "embarrassed blush", "playful grin", "inviting look", "heavy-lidded eyes", "soft smile"],
    "Clothing": ["loose oversized shirt", "off-shoulder sweater", "thighhighs", "garter straps", "black bodysuit", "short skirt", "lace lingerie", "open shirt", "see-through fabric", "tight dress"],
    "Environment": ["bedroom interior", "soft sheets", "window light bedroom", "night room", "vanity mirror", "private room", "warm interior"]
  },
  "Badass": {
    "Act": ["charging forward", "attacking with a sword", "raising a glowing weapon", "blocking an attack", "walking through fire", "standing over shattered ground", "aiming a gun", "swinging a katana", "cape whipping violently behind her", "crushing the ground under one foot"],
    "Pose": ["low forward-leaning combat stance", "wide combat stance", "power stance", "heroic pose", "one foot forward", "both hands on weapon"],
    "Expression": ["battle-ready glare", "angry stare", "determined gaze", "cold expression", "confident smirk"],
    "Clothing": ["battle armor", "torn cape", "black bodysuit", "combat boots", "armored gloves", "weapon harness", "leather jacket"],
    "Environment": ["burning battlefield", "shattered city", "stormy sky", "battlefield smoke", "ruined castle"]
  },
  "Dark & Moody": {
    "Style": ["dark anime illustration", "noir anime scene", "moody anime painting", "gothic anime art"],
    "Lighting": ["low-key lighting", "cold moonlight", "dim blue light", "deep shadows", "single rim light", "rain reflections"],
    "Environment": ["rain-soaked alley", "abandoned building", "ruined cathedral", "moonlit rooftop", "foggy street", "dark bedroom"],
    "Color Palette": ["dark palette", "muted colors", "black and blue", "purple shadows", "cold colors"]
  },
  "Soft & Cute": {
    "Style": ["soft anime rendering", "kawaii anime style", "pastel anime illustration", "gentle light novel art"],
    "Act": ["holding plush toy", "sitting with knees up", "waving shyly", "holding flowers", "eating sweets", "hugging pillow", "touching hair"],
    "Expression": ["soft smile", "shy smile", "embarrassed blush", "wide-eyed surprise", "gentle smile"],
    "Clothing": ["oversized sweater", "ribbon", "frilly dress", "school uniform", "pajamas", "cardigan"],
    "Color Palette": ["pastel colors", "pink and white", "soft gradients", "warm colors"]
  },
  "Sci-Fi": {
    "Character": ["android girl", "cyborg girl", "space pilot", "mecha pilot", "hacker girl"],
    "Act": ["piloting a mech", "aiming laser pistol", "walking through holograms", "charging plasma blade", "floating in zero gravity"],
    "Clothing": ["skintight pilot suit", "techwear jacket", "armored bodysuit", "holographic visor", "mechanical gauntlets"],
    "Environment": ["spaceship corridor", "neon city street", "cyberpunk city", "hologram room", "alien planet"],
    "Color Palette": ["blue and magenta", "neon colors", "purple and cyan", "glowing cyan accents"]
  },
  "Fantasy": {
    "Character": ["ice elf woman", "dark elf woman", "fire mage woman", "sword princess", "dragon girl", "witch girl"],
    "Act": ["casting a spell", "summoning magic", "holding a long crystal spear", "charging through a frozen battlefield", "raising a glowing weapon", "riding a dragon"],
    "Clothing": ["layered winter armor", "fur-trimmed shoulders", "fantasy armor", "witch robe", "jeweled waist harness", "cape"],
    "Environment": ["frozen battlefield", "enchanted forest", "fantasy castle", "ancient temple", "magic academy"],
    "Lighting": ["blue-white energy glow", "sparkling magic light", "glowing weapon light", "volumetric light"]
  },
  "Portrait": {
    "Act": ["looking at viewer", "touching hair", "holding collar", "turning face toward camera", "adjusting earring"],
    "Pose": ["portrait close-up", "upper body pose", "three-quarter view", "head tilted down", "chin raised"],
    "Camera/Composition": ["portrait close-up", "85mm lens", "depth of field", "centered composition", "soft background"],
    "Lighting": ["soft studio lighting", "catchlight", "soft rim light", "window light"],
    "Quality": ["detailed face", "beautiful detailed eyes", "detailed hair", "sharp focus"]
  },
  "Horror": {
    "Style": ["horror anime illustration", "dark fantasy anime", "psychological horror scene"],
    "Act": ["standing in fog", "reaching from darkness", "holding broken mask", "walking through abandoned hallway", "turning toward unseen threat"],
    "Expression": ["wide-eyed fear", "blank expression", "cold expression", "teary eyes", "disturbed expression"],
    "Environment": ["abandoned building", "ruined cathedral", "foggy street", "dark bedroom", "haunted hallway"],
    "Lighting": ["flickering light", "cold moonlight", "deep shadows", "single rim light"]
  },
  "Action": {
    "Act": ["charging forward", "leaping through the air", "attacking with a sword", "dodging sideways", "landing from a jump", "running forward", "blocking an attack"],
    "Pose": ["dynamic action pose", "low forward-leaning combat stance", "wide combat stance", "twisted torso", "dramatic foreshortening"],
    "Camera/Composition": ["dynamic perspective", "worm's-eye perspective", "motion blur", "speed lines", "diagonal composition", "very dynamic composition"],
    "Environment": ["battlefield smoke", "shattered ground", "flying debris", "stormy sky"],
    "Lighting": ["dramatic lighting", "strong rim light", "glowing weapon light"]
  }
};

const VIBE_CATEGORY_EXPANSIONS = {
  "Sexy": {
    "Style": ["pin-up anime illustration", "romantic anime CG", "soft adult-adjacent glamour", "boudoir anime lighting", "intimate visual novel CG", "polished bedroom illustration", "soft skin rendering", "warm romantic shading", "fashion magazine anime", "elegant pin-up composition", "tasteful tease illustration", "soft-focus anime portrait", "high-end character CG", "clean mature anime style", "silky shading", "glossy eye highlights", "warm blush rendering", "private-room scene", "romantic close framing", "soft sensual atmosphere"],
    "Character": ["adult woman", "mature anime woman", "confident woman", "soft curves", "slim waist", "elegant hips", "curvy figure", "petite adult woman", "tall elegant woman", "long legs", "soft thighs", "hourglass body", "gentle face", "sharp beautiful face", "sleepy eyes", "flushed cheeks", "beauty mark", "collarbone detail", "smooth skin", "delicate hands"],
    "Act": ["adjusting hair ribbon", "slipping off jacket", "loosening collar", "pulling sleeve over hand", "stretching after waking up", "leaning over table", "sitting at vanity", "putting on lipstick", "touching necklace", "pulling blanket close", "turning in doorway", "posing by window", "crossing legs slowly", "playing with hair strand", "resting chin on hand", "tilting head toward viewer", "standing in doorway light", "holding wine glass", "walking barefoot across room", "looking back from bed edge"],
    "Pose": ["knees together sitting pose", "side-sitting pose", "leaning on elbows", "lying on stomach", "one shoulder forward", "hand behind head", "knees pulled close", "one leg folded under", "standing hip tilt", "soft S-curve pose", "over-shoulder portrait pose", "crossed ankles", "sitting on bed edge", "leaning against doorway", "relaxed couch pose", "one knee raised on chair", "hands resting on lap", "soft arched pose", "close waist framing", "gentle twist pose"],
    "Expression": ["warm teasing smile", "sleepy smile", "bashful eyes", "soft blush", "gentle gaze", "playful wink", "quiet confidence", "relaxed mouth", "soft parted lips", "dreamy eyes", "tender look", "mischievous smile", "nervous smile", "warm eye contact", "shy side glance", "soft embarrassed look", "calm inviting eyes", "gentle smirk", "melting gaze", "sweet smile"],
    "Clothing": ["silk robe", "slip dress", "oversized dress shirt", "satin camisole", "lace-trimmed top", "loose cardigan", "soft pajama set", "black stockings", "garter straps", "off-shoulder blouse", "fitted cocktail dress", "open blazer", "ribbon choker", "delicate necklace", "soft sweater dress", "thin strap dress", "sheer sleeves", "high-waist skirt", "bedroom robe", "velvet dress"],
    "Hair": ["messy bed hair", "loose long hair", "side-swept bangs", "soft waves", "wet-look hair", "hair tucked behind ear", "loose braid", "low ponytail", "sleepy tousled hair", "silky straight hair", "long black hair", "warm brown hair", "blonde waves", "pink gradient hair", "hair over shoulder", "curled ends", "ribbon in hair", "half-up hairstyle", "soft flyaway hairs", "glossy hair highlights"],
    "Environment": ["warm bedroom", "hotel room", "vanity corner", "curtained window", "soft morning bed", "candlelit room", "private balcony", "silk sheets", "quiet apartment", "makeup table", "dressing room", "warm lamplit room", "rainy window bedroom", "luxury suite", "flower petals on bed", "soft carpet floor", "moonlit bed", "bathroom mirror", "cozy couch corner", "city lights outside window"],
    "Lighting": ["warm lamplight", "soft window light", "candle glow", "subtle rim light", "golden bedroom light", "moonlit highlights", "gentle bloom", "silky highlights", "low contrast soft light", "warm skin light", "diffused lamp light", "soft shadow falloff", "curtain-filtered light", "pink ambient glow", "cinematic warm key light", "soft specular highlights", "intimate low light", "vanity bulb light", "backlit silhouette", "dreamy haze"],
    "Camera/Composition": ["intimate close-up", "waist-up portrait", "soft over-shoulder framing", "bed edge framing", "mirror composition", "doorway framing", "low bed-level angle", "gentle diagonal composition", "cropped shoulder framing", "close hands detail", "full body pin-up framing", "soft foreground blur", "window-side composition", "slight dutch angle", "centered bedroom portrait", "rule of thirds portrait", "gentle foreshortening", "viewer-facing composition", "private snapshot feel", "clean negative space"],
    "Color Palette": ["warm rose palette", "cream and wine red", "soft pink shadows", "black and gold", "champagne colors", "warm skin tones", "muted red accents", "soft violet lighting", "peach and ivory", "midnight blue accents", "warm brown shadows", "rose gold highlights", "silk white palette", "soft burgundy", "low-saturation warmth", "pink amber glow", "lavender shadows", "moody red black", "soft pastel blush", "golden room tones"]
  },
  "Badass": {
    "Style": ["battle anime poster", "sharp action key visual", "heroic splash art", "high-impact anime illustration", "weapon-focused character art", "dark heroic anime", "cinematic battle art", "storm-lit key art", "rival battle poster", "epic boss-fight composition", "clean shonen illustration", "impact-frame anime art", "high contrast action render", "polished armor concept", "anime fight scene", "manga impact style", "bold silhouette art", "dynamic combat illustration", "trailer key art", "power fantasy anime"],
    "Character": ["warrior woman", "battle mage", "sword saint", "demon hunter", "armored knight", "rogue assassin", "dragon slayer", "cyber ninja", "battle queen", "scarred fighter", "elite soldier", "samurai woman", "gunner girl", "spear fighter", "rival swordsman", "masked warrior", "tall fighter", "athletic body", "muscular body", "battle-damaged hero"],
    "Act": ["drawing a sword", "slamming weapon into ground", "parrying a strike", "launching forward", "breaking through smoke", "walking away from explosion", "kicking down a door", "catching a blade", "firing twin pistols", "charging a spear thrust", "spinning with a scythe", "deflecting bullets", "raising fist in challenge", "tearing off cloak", "stepping over rubble", "cracking knuckles", "summoning battle aura", "shattering chains", "holding enemy blade back", "standing in falling ash"],
    "Pose": ["weapon-over-shoulder pose", "ready-to-strike stance", "blade pointed at viewer", "half-crouched stance", "wide planted stance", "one foot on rubble", "backlit hero pose", "turned torso attack pose", "kneeling after landing", "crossed swords pose", "gun kata stance", "fist raised pose", "shoulder-forward stance", "low sprint start pose", "cloak-swept stance", "profile battle stance", "dominant full-body pose", "hands on weapon hilt", "triangular silhouette pose", "mid-swing action pose"]
  },
  "Dark & Moody": {
    "Act": ["lighting a cigarette", "walking through rain", "standing under streetlamp", "opening a forbidden door", "holding a cracked photograph", "pressing hand to glass", "waiting in an alley", "turning away in silence", "kneeling in rain", "reaching toward dim light", "pulling hood over face", "watching city lights", "standing in church aisle", "holding a black umbrella", "stepping through fog", "touching a broken mirror", "looking at bloodless hands", "sitting alone on stairs", "hiding a dagger", "closing eyes in sorrow"],
    "Pose": ["slouched wall lean", "hands in pockets", "hooded face down pose", "one hand covering face", "sitting on wet steps", "silhouette side profile", "head bowed pose", "looking down in rain", "arms folded tight", "kneeling silhouette", "leaning on railing", "standing alone centered", "overcoat blowing pose", "close-up side profile", "half-hidden face pose", "hand on window pose", "turned-away portrait", "low shoulder angle", "lonely full-body pose", "quiet seated pose"],
    "Expression": ["empty stare", "tired eyes", "melancholy gaze", "cold calm stare", "suppressed anger", "distant look", "quiet sadness", "haunted expression", "bitter smile", "expressionless face", "downcast eyes", "thin-lipped frown", "numb expression", "wet eyelashes", "heavy shadowed eyes", "lonely gaze", "resigned look", "subtle pain", "dark smirk", "suspicious glance"],
    "Character": ["lonely detective", "gothic girl", "fallen angel", "vampire woman", "rain-soaked wanderer", "mourning knight", "urban witch", "black-haired woman", "pale skin", "shadowy figure", "scarred woman", "masked stranger", "elegant vampire", "stoic assassin", "tired office lady", "runaway princess", "silent swordsman", "graveyard keeper", "noir heroine", "dark elf woman"]
  },
  "Soft & Cute": {
    "Character": ["catgirl", "bunny girl", "fox girl", "shy girl", "cheerful girl", "soft magical girl", "flower girl", "sleepy girl", "cozy sweater girl", "idol girl", "bakery girl", "maid girl", "angel girl", "pink-haired girl", "small adult woman", "round soft face", "sparkly eyes", "soft cheeks", "tiny fangs", "fluffy ears"],
    "Act": ["holding a plush bunny", "feeding a small bird", "carrying a basket of flowers", "making a heart sign", "waving with both hands", "spinning in a skirt", "holding a warm mug", "reading a picture book", "tying a ribbon", "watering flowers", "sharing an umbrella", "hugging a pillow", "pouting cutely", "peeking from behind curtain", "sitting in a flower field", "catching falling petals", "holding a kitten plush", "putting on oversized hoodie", "decorating cake", "sleeping under blanket"],
    "Pose": ["knees-up sitting pose", "pigeon-toed standing pose", "hands clasped pose", "double peace sign pose", "small wave pose", "hugging knees pose", "tilted head cute pose", "one foot lifted pose", "sitting cross-legged", "lying with plush toy", "jumping happily", "twirling pose", "shy shoulder raise", "hands near face", "heart hands pose", "cheek poke pose", "curled-up cozy pose", "looking up pose", "tiny bowing pose", "gentle side sit pose"],
    "Expression": ["sparkly smile", "pouty face", "shy blush", "happy tears", "gentle giggle", "sleepy eyes", "innocent smile", "wide bright eyes", "tiny fang smile", "soft surprise", "nervous laugh", "warm blush", "cheerful grin", "adoring gaze", "cute confused look", "bashful smile", "sweet closed-eye smile", "fluffy happy face", "soft open mouth", "gentle pout"]
  },
  "Sci-Fi": {
    "Act": ["activating hologram controls", "drawing a plasma blade", "running across neon bridge", "hacking a terminal", "piloting starfighter", "floating through zero gravity", "deploying drone swarm", "scanning alien artifact", "jumping between rooftops", "charging railgun", "opening airlock door", "repairing android arm", "syncing with mech cockpit", "walking through digital rain", "materializing from pixels", "dodging laser fire", "launching jet boots", "holding glowing data core", "standing inside stasis pod", "calling down orbital strike"],
    "Pose": ["zero-gravity curl pose", "pilot cockpit pose", "weapon-ready tech stance", "hologram interaction pose", "one hand on visor", "floating full-body pose", "cyber ninja crouch", "plasma blade stance", "kneeling terminal pose", "backlit helmet pose", "wide sci-fi hero stance", "mech cockpit seated pose", "running in neon pose", "arm cannon aiming pose", "data-screen profile pose", "anti-gravity lean", "spacewalk pose", "visor close-up pose", "drone-commanding pose", "sleek standing pose"],
    "Expression": ["cool focused eyes", "calm pilot gaze", "cybernetic stare", "emotionless android look", "confident tech smirk", "alert expression", "mission-ready focus", "hologram-lit eyes", "cold analytical gaze", "neon reflection eyes", "surprised system alert look", "quiet determination", "battle AI expression", "serious headset look", "soft synthetic smile", "calm under pressure", "sharp tactical stare", "curious alien gaze", "digital glitch expression", "helmet visor reflection"]
  },
  "Fantasy": {
    "Act": ["charging through a frozen battlefield", "casting a barrier spell", "summoning a dragon spirit", "pulling sword from stone", "raising crystal spear", "opening ancient tome", "riding through mist", "dueling under moonlight", "kneeling before a magic circle", "calling down lightning", "walking through flower magic", "breaking ice with one step", "drawing a glowing rune", "standing before castle gates", "commanding summoned familiars", "lifting enchanted lantern", "aiming magic bow", "pouring potion into fire", "flying on wind magic", "shielding ally with cloak"],
    "Pose": ["spellcasting stance", "spear-forward combat pose", "cloak-whipping stance", "kneeling magic circle pose", "heroic sword raise", "floating mage pose", "archer draw pose", "rider pose", "princess battle stance", "one foot on ice pose", "staff planted pose", "two-handed sword stance", "wind-swept standing pose", "summoner hand pose", "dragon-rider silhouette", "shield-bearing pose", "rune-drawing pose", "elegant court pose", "battle dress full-body pose", "low fantasy duel stance"]
  },
  "Portrait": {
    "Character": ["elegant woman", "anime heroine", "idol portrait", "office lady portrait", "elf portrait", "witch portrait", "knight portrait", "vampire portrait", "cyberpunk portrait", "soft girl portrait", "mature beauty", "sharp beautiful face", "symmetrical face", "delicate jawline", "expressive eyes", "long eyelashes", "beautiful lips", "smooth skin", "detailed hair strands", "distinct facial features"],
    "Act": ["turning face toward camera", "touching cheek", "adjusting earring", "holding flower near face", "brushing hair aside", "looking through window", "lifting chin slightly", "smiling softly", "closing eyes in sunlight", "holding collar", "touching pendant", "resting head on hand", "holding mask near face", "standing in profile", "tilting head at camera", "touching lips lightly", "looking over shoulder", "leaning toward lens", "framing face with hand", "holding ribbon near chin"],
    "Pose": ["clean bust portrait", "three-quarter bust pose", "face close-up", "shoulder-up portrait", "hands near face pose", "one hand on cheek", "profile portrait pose", "straight-on portrait pose", "chin raised portrait", "downcast portrait pose", "hair over shoulder portrait", "soft seated portrait", "elegant neckline pose", "symmetrical portrait framing", "over-shoulder portrait", "head tilt portrait", "collarbone framing", "eyes-only close crop", "upper body centered", "dramatic face crop"]
  },
  "Horror": {
    "Character": ["ghost girl", "cursed doll", "vampire woman", "possessed priestess", "masked killer", "haunted schoolgirl", "dark nun", "witch in fog", "pale woman", "shadow creature", "undead queen", "black-eyed figure", "lonely spirit", "cursed bride", "monster hunter", "bloodless vampire", "eerie childlike doll", "faceless figure", "graveyard girl", "creeping silhouette"],
    "Act": ["opening creaking door", "reaching from under bed", "standing in mirror reflection", "dragging a broken weapon", "walking through graveyard fog", "holding a candle in darkness", "turning head too slowly", "appearing behind glass", "lifting a cracked mask", "following bloody footprints", "standing at end of hallway", "covering mouth in terror", "writing symbols on wall", "holding cursed doll", "stepping out of shadow", "looking into broken mirror", "floating above floor", "scratching at locked door", "staring from closet darkness", "summoning black smoke"],
    "Pose": ["creeping hallway pose", "hands against glass", "floating limp pose", "head tilted unnaturally", "candle-holding pose", "kneeling in ritual circle", "mirror reflection pose", "half-hidden doorway pose", "reaching hand close-up", "crouched monster pose", "turned-back horror pose", "stiff standing silhouette", "face in shadow pose", "wide-eyed close-up pose", "one hand over mouth", "clutching chest pose", "limp arms pose", "low floor-level shot pose", "tilted neck pose", "ritual kneeling pose"]
  },
  "Action": {
    "Act": ["sprinting through debris", "diving under attack", "kicking enemy weapon away", "slashing through energy wave", "vaulting over railing", "landing in superhero crouch", "breaking through glass", "firing a bow mid-jump", "throwing dagger forward", "blocking with shield", "spinning through sword slash", "riding shockwave", "grabbing ledge mid-fall", "charging with spear", "punching through stone wall", "sliding under laser fire", "jumping from rooftop", "dodging explosion", "catching falling ally", "launching upward attack"],
    "Pose": ["mid-air attack pose", "superhero landing pose", "sprint start pose", "sliding action pose", "weapon swing arc pose", "shield block pose", "jump kick pose", "falling perspective pose", "rooftop leap pose", "one arm extended pose", "fast turn pose", "twisted torso strike", "explosive crouch pose", "diagonal body line pose", "dynamic spear thrust pose", "bow draw midair pose", "motion-blur running pose", "wide action silhouette", "impact landing pose", "forward momentum pose"]
  }
};

Object.entries(VIBE_CATEGORY_EXPANSIONS).forEach(([vibe, categories]) => {
  VIBE_CATEGORY_TAGS[vibe] ||= {};
  Object.entries(categories).forEach(([category, tags]) => {
    VIBE_CATEGORY_TAGS[vibe][category] = unique([...(VIBE_CATEGORY_TAGS[vibe][category] || []), ...tags]);
  });
});

const ADULT_TAGS = {
  "Style": ["hentai", "doujinshi style", "ero anime style", "visual novel CG"],
  "Character": ["soft curves", "big breasts", "huge breasts", "small breasts", "medium breasts", "wide hips", "thick thighs", "slim waist", "puffy nipples", "large nipples", "small nipples", "pink nipples", "pussy", "wet pussy", "visible clit", "cameltoe", "penis", "large penis", "thick penis", "visible balls", "shaved pussy", "trimmed pubic hair"],
  "Act": ["masturbating", "touching herself", "fingering herself", "spreading pussy", "oral sex", "fellatio", "cunnilingus", "vaginal sex", "missionary sex", "cowgirl sex", "reverse cowgirl sex", "doggystyle sex", "standing sex", "against wall sex", "deep penetration", "balls deep", "creampie", "cum inside", "cum on body", "handjob", "thigh sex", "paizuri", "titjob", "69 position", "riding penis", "pussy licking", "clit rubbing", "grinding on lap", "after sex", "pulling panties aside", "lifting hips during sex", "holding legs open", "penis inside pussy", "wet penetration", "oral climax", "cum dripping", "dirty talk expression", "teasing partner", "straddling partner", "bedroom sex scene"],
  "Pose": ["legs spread", "knees apart", "arched back", "reclining nude pose", "on all fours", "bent over pose", "lying on back", "sitting on lap", "straddling pose", "pinned wrists", "hands above head", "ass up pose", "knees to chest", "legs lifted", "one leg over shoulder", "missionary position pose", "cowgirl position pose", "doggystyle position pose", "side lying sex pose", "standing bent-forward pose", "back arched on bed", "hips raised", "partner between legs", "spread eagle pose", "kneeling on bed", "over-the-shoulder nude pose", "close-up lower body framing", "full body nude pose", "lap sitting pose", "against wall pose"],
  "Expression": ["ahegao", "pleasure face", "heavy-lidded eyes", "open mouth", "tongue out", "drooling", "flushed face", "teary eyes", "biting lip"],
  "Clothing": ["open shirt", "lifted shirt", "pulled aside panties", "panties around one leg", "ripped clothing", "lace lingerie", "see-through lingerie", "garter belt", "thighhighs", "nude"],
  "Negative": ["minor", "underage", "child", "childlike", "loli", "shota", "teen", "schoolgirl", "non-consensual", "rape", "forced", "incest", "bestiality", "gore", "blood"]
};

const ADULT_VIBE_TAGS = {
  "Sexy": {
    "Act": ["slowly undressing", "teasing with panties", "pulling shirt open", "touching nipples", "spreading legs on bed", "stroking inner thigh", "pressing breasts together", "masturbating on bed", "fingering herself on bed", "posing nude in mirror", "rubbing clit", "sliding panties aside", "biting finger", "holding bedsheet over chest", "arch-backed teasing", "sensual lap dance", "grinding hips", "teasing close-up", "nipple play", "wet pussy close framing"],
    "Pose": ["reclining nude pin-up", "knees apart on bed", "one knee raised nude pose", "lying on side nude pose", "sitting with panties aside", "legs open on bed", "arched back pin-up", "hand between thighs pose", "one leg lifted pose", "bedroom mirror nude pose", "soft spread pose", "kneeling nude pose", "topless over-shoulder pose", "close thighs framing", "curled on sheets pose", "hands covering chest pose", "open shirt nude pose", "hip-forward pose", "side profile nude pose", "warm bed pose"],
    "Expression": ["pleasure smile", "heavy-lidded teasing gaze", "open-mouth blush", "soft moan expression", "biting lip blush", "shy horny expression", "flushed inviting eyes", "wet lips", "bedroom eyes", "teasing tongue out"]
  },
  "Badass": {
    "Act": ["dominant straddling", "rough riding", "pinning partner down", "commanding partner", "pulling partner by collar", "weapon set aside during sex", "aggressive cowgirl sex", "standing wall sex", "grabbing hips", "biting shoulder", "scratching back", "messy after-battle sex", "armor partly removed", "pulling gloves off with teeth", "thigh riding", "dominant handjob", "dominant oral sex", "battlefield tent sex", "hard deep penetration", "post-fight creampie"],
    "Pose": ["dominant cowgirl pose", "standing against wall pose", "one boot on bed pose", "armor half-off pose", "pinned-down pose", "hips-grabbed pose", "partner under her pose", "rough kneeling pose", "leaning over partner pose", "weapon nearby nude pose", "strong thighs framing", "ass up battle pose", "one hand pinning wrist", "dominant straddle pose", "after-battle bed pose"]
  },
  "Dark & Moody": {
    "Act": ["moonlit nude scene", "slow wall sex", "hands pressed to window", "secret bedroom sex", "vampire bite during sex", "black lingerie teasing", "shadowy masturbation", "quiet after sex", "pulling partner into darkness", "foggy bath sex", "candlelit oral sex", "dark mirror nude pose", "rainy window sex", "gothic bed sex", "slow deep penetration", "gripping black sheets", "touching collarbone", "biting neck", "kneeling in candlelight", "wet skin close-up"],
    "Pose": ["candlelit kneeling nude pose", "window pressed pose", "black sheets reclining pose", "shadow-covered body pose", "gothic bed pose", "one hand on throat pose", "vampire bite pose", "low-key nude silhouette", "mirror nude pose", "rainy window pose", "hands on glass pose", "kneeling oral pose", "dark side profile nude", "arched under moonlight", "covered by black sheets pose"]
  },
  "Soft & Cute": {
    "Act": ["shy first nude pose", "embarrassed undressing", "pulling sweater over chest", "covering breasts with pillow", "soft self-touching", "timid masturbation", "gentle fingering herself", "cute lingerie reveal", "blushing with panties aside", "holding plush while nude", "shy bed pose", "soft thigh squeeze", "cute open-shirt pose", "gentle oral tease", "sweet cowgirl sex", "soft missionary sex", "warm aftercare cuddle", "holding hands during sex", "blushing creampie scene", "cute moan expression"],
    "Pose": ["shy nude sitting pose", "covered-with-pillow pose", "knees together nude pose", "cute legs open pose", "soft bed curl pose", "hands covering nipples pose", "timid kneeling pose", "blushing blanket pose", "one leg tucked nude pose", "cute straddling pose", "small arched pose", "gentle missionary pose", "soft cowgirl pose", "cuddled after-sex pose", "plush toy nude pose"]
  },
  "Sci-Fi": {
    "Act": ["zero gravity sex", "hologram-lit nude pose", "android masturbation", "cyber suit unzipped", "neon shower sex", "cockpit sex scene", "VR pleasure scene", "tentacle-free alien intimacy", "cybernetic hand stimulation", "glowing lubricant", "latex bodysuit pulled aside", "space station bed sex", "holographic strip tease", "robot partner handjob", "neon oral sex", "gravity lock cowgirl", "stasis pod nude scene", "data cable teasing", "android after sex", "sci-fi creampie"],
    "Pose": ["zero gravity nude pose", "cockpit straddle pose", "neon shower pose", "hologram bed pose", "bodysuit unzipped pose", "floating legs spread pose", "android kneeling pose", "cyber chair sex pose", "glowing visor nude pose", "space station reclining pose", "anti-gravity arched pose", "latex pin-up pose", "tech wall sex pose", "VR headset nude pose", "stasis pod spread pose"]
  },
  "Fantasy": {
    "Act": ["elf nude ritual", "magic binding consensual pose", "spell-lit masturbation", "monster girl sex", "dragon girl cowgirl", "witch oral sex", "succubus riding", "fairy dust nude scene", "paladin armor removed", "elf bath sex", "magic circle sex", "crystal bed nude pose", "enchanted forest sex", "mage fingering herself", "royal bedroom sex", "nymph self-touching", "fantasy romance sex", "spell glow creampie", "witch after sex", "elf spreading pussy"],
    "Pose": ["magic circle nude pose", "elf bath pose", "royal bed pose", "forest knees-apart pose", "witch kneeling pose", "succubus straddle pose", "crystal altar reclining pose", "armor half-off pose", "spell-lit arched pose", "enchanted sheets pose", "nude cloak pose", "fairy glow pose", "fantasy cowgirl pose", "ritual kneeling pose", "elf over-shoulder nude pose"]
  },
  "Portrait": {
    "Act": ["topless portrait", "nude bust portrait", "pulling lingerie strap", "touching lips", "covering breasts with hands", "holding shirt open", "biting finger", "nipple close-up implied", "wet lips portrait", "blushing nude portrait", "looking down at viewer", "mirror selfie nude", "soft self-touch portrait", "lingerie portrait", "open robe portrait", "collarbone touch", "hand between thighs crop", "half-lidded portrait", "teasing close-up", "after-sex face portrait"],
    "Pose": ["topless bust framing", "nude shoulder portrait", "open robe close-up", "hands covering chest crop", "lingerie bust pose", "wet hair nude portrait", "low angle face and chest", "mirror portrait nude", "bedroom eyes close-up", "parted lips portrait", "neck and collarbone crop", "half-body nude portrait", "soft side profile nude", "face and hand framing", "after-sex close-up pose"]
  },
  "Horror": {
    "Act": ["cursed erotic ritual", "vampire seduction", "possessed nude pose", "gothic candle sex", "dark witch self-touch", "horror intimacy", "bloodless vampire bite tease", "haunted mirror nude pose", "black lace masturbation", "ritual bed sex", "shadow hand teasing", "foggy graveyard nude pose", "candle wax tease", "dark altar sex", "cold hands on skin", "eerie after-sex stare", "gothic oral sex", "creepy doll lingerie pose", "moonlit cemetery tease", "haunted bedroom sex"],
    "Pose": ["ritual altar nude pose", "vampire over-shoulder pose", "black lace kneeling pose", "haunted mirror pose", "candlelit spread pose", "possessed arched pose", "gothic bed reclining pose", "cold moon nude silhouette", "hands-on-glass nude pose", "dark kneeling oral pose", "shadow-covered spread pose", "eerie straddle pose", "cursed bride nude pose", "black veil nude pose", "low horror close-up pose"]
  },
  "Action": {
    "Act": ["quickie after battle", "armor pulled aside", "standing wall sex after chase", "sweaty training sex", "dominant post-fight sex", "riding partner after fight", "grabbing hips hard", "bent over after battle", "battlefield tent oral sex", "weapon belt removed", "hard cowgirl sex", "missionary with legs lifted", "doggystyle after training", "deep penetration after fight", "cum inside after battle", "rough handjob", "breathless after sex", "stripping combat suit", "sweaty locker room sex", "adrenaline-fueled sex"],
    "Pose": ["sweaty wall sex pose", "armor pulled aside pose", "training room straddle pose", "post-fight bent-over pose", "legs lifted action pose", "hard cowgirl pose", "doggystyle action pose", "weapon belt on floor pose", "dominant full-body nude pose", "breathless kneeling pose", "sweaty bed pose", "locker room nude pose", "after-battle spread pose", "hips held tight pose", "standing sex action pose"]
  }
};

const MEGA_TAG_LIBRARY = {
  quality: ["masterpiece", "best quality", "gorgeous", "premium illustration", "official art", "clean polished anime shading", "semi-realistic", "anime style", "anime screencap", "visual novel cg", "doujinshi style", "highres", "absurdres", "very aesthetic", "ultra detailed", "finely detailed", "sharp focus", "crisp lineart", "clean lineart", "beautiful detailed eyes", "detailed face", "detailed hair", "detailed clothing", "detailed skin", "smooth shading", "glossy rendering", "strong composition", "dynamic composition", "expressive pose", "clear silhouette", "cinematic framing", "professional anime finish"],
  body: ["slim body", "curvy slim body", "curvy body", "soft curvy body", "petite body", "tall body", "athletic body", "toned body", "voluptuous body", "hourglass body", "pear-shaped body", "soft body", "plump body", "chubby body", "muscular body", "lean body", "lithe body", "mature body", "sexy body", "bishoujo", "kawaii", "cute", "wide hips", "narrow hips", "elegant hips", "round hips", "thick thighs", "slender thighs", "soft thighs", "long legs", "smooth stomach", "flat stomach", "soft belly", "collarbone", "round ass", "thick ass", "soft ass", "narrow waist", "slim waist", "tiny waist", "cinched waist", "defined waist"],
  breasts: ["small breasts", "medium breasts", "large breasts", "huge breasts", "gigantic breasts", "flat chest", "modest breasts", "perky breasts", "round breasts", "soft breasts", "heavy breasts", "natural breasts", "cleavage", "deep cleavage", "sideboob", "underboob", "areolae", "large areolae", "small areolae", "pink areolae", "dark areolae", "nipples", "perky nipples", "puffy nipples", "large nipples", "small nipples", "erect nipples", "hard nipples", "pink nipples", "dark nipples", "visible nipples", "nipple outline", "nipple slip", "breasts squeezed", "breasts pressed together", "hand on breast", "grabbing breast"],
  fantasy: ["elf", "elf girl", "elf woman", "pointed elf ears", "long elf ears", "dark elf", "ice elf", "forest elf", "high elf", "oni", "oni girl", "oni horns", "one oni horn", "broken oni horn", "succubus", "succubus wings", "succubus tail", "demon girl", "demon horns", "demon tail", "demon wings", "angel wings", "halo", "vampire", "vampire fangs", "catgirl", "cat ears", "cat tail", "fox girl", "fox ears", "fox tail", "dragon girl", "dragon horns", "dragon tail", "dragon wings", "lamia", "mermaid", "harpy girl", "fairy wings", "witch", "mage girl", "monster girl", "slime girl", "spider girl", "moth girl", "bunny girl", "rabbit ears", "cow horns", "cow ears"],
  normalActs: ["standing", "walking", "running", "sitting", "kneeling", "lying", "lying on side", "lying on back", "lying on stomach", "stretching", "turning around", "looking back", "looking down", "looking up", "looking at viewer", "looking away", "reaching out", "touching hair", "fixing hair", "holding weapon", "holding staff", "holding spear", "holding sword", "holding umbrella", "holding book", "holding flower", "holding phone", "holding drink", "holding bedsheet", "pulling blanket", "adjusting gloves", "adjusting collar", "adjusting thighhighs", "pulling sleeve", "lifting skirt", "sitting on bed", "sitting on chair", "sitting on floor", "sitting on lap", "leaning against wall", "leaning forward", "crawling", "dancing", "jumping", "falling", "floating", "sleeping", "waking up", "posing in mirror", "taking selfie", "hugging", "kissing", "biting lip", "covering mouth", "covering chest", "hands behind back", "hands above head", "arms crossed", "hands on hips", "one hand on hip"],
  adultActs: ["nude", "topless", "bottomless", "completely nude", "uncensored", "sex", "fucking", "being fucked", "getting fucked", "fucked deep", "deep penetration", "full penetration", "rough sex", "slow sex", "gentle sex", "passionate sex", "messy sex", "vaginal sex", "anal sex", "oral sex", "fellatio", "cunnilingus", "handjob", "titjob", "paizuri", "thigh sex", "missionary", "cowgirl", "reverse cowgirl", "doggystyle", "spooning", "standing sex", "against wall sex", "bent over sex", "prone bone", "mating press", "69 position", "riding penis", "straddling penis", "penis inside", "penis in pussy", "penis in ass", "balls deep", "deep inside", "cum inside", "creampie", "anal creampie", "cum on body", "cum on face", "cum on breasts", "cum on stomach", "cum dripping", "cum overflow", "after sex", "masturbating", "touching herself", "fingering herself", "rubbing clit", "spreading pussy", "holding pussy open", "pussy spread", "wet pussy", "gaping pussy", "stretched pussy", "stretched vagina", "visible clit", "clit", "labia", "asshole", "gaping asshole", "stretched asshole", "anal insertion", "orgasm", "ahegao", "saliva", "drooling", "sweat", "heart pupils", "deepthroat", "cum in mouth"],
  monsterActs: ["tentacles", "tentacle sex", "tentacle penetration", "tentacle wrap", "tentacles around body", "tentacles holding legs", "tentacles spreading legs", "tentacle in pussy", "tentacle in ass", "tentacle in mouth", "monster sex", "monster girl sex", "monster partner", "fantasy monster partner", "beastman partner", "werewolf humanoid partner", "dragon humanoid partner", "demon partner", "orc partner", "minotaur partner", "slime tentacles", "eldritch tentacles", "plant tentacles", "magic tentacles", "summoned tentacles"],
  poses: ["full body", "upper body", "close-up", "extreme close-up", "portrait pose", "pin-up pose", "bed pose", "reclining pose", "side lying pose", "lying on side pose", "lying on back pose", "lying on stomach pose", "arched back", "back arched", "ass up", "hips raised", "knees apart", "legs spread", "legs crossed", "one leg raised", "legs lifted", "knees to chest", "one leg over shoulder", "on all fours", "bent over", "kneeling pose", "kneeling on bed", "sitting on bed", "sitting on edge", "sitting on lap", "straddling pose", "cowgirl position", "reverse cowgirl position", "missionary position", "doggystyle position", "spooning position", "standing position", "pinned wrists", "hands above head", "arms pinned", "wrists held", "hands behind back", "hands on breast", "hands on thighs", "one hand on hip", "hand between thighs", "hand on pussy", "hand on ass", "grabbing sheets", "biting pillow", "over shoulder pose", "looking back over shoulder", "spread eagle", "lap sitting", "wall pinned pose", "against wall pose", "shower pose", "bath pose", "mirror pose", "low combat stance", "wide stance", "power stance", "contrapposto", "dynamic action pose", "twisted torso", "leaning forward", "leaning back", "all fours pose", "squatting pose"],
  expressions: ["blush", "heavy blush", "embarrassed blush", "flushed face", "red face", "sweaty face", "pleasure face", "ahegao", "open mouth", "parted lips", "tongue out", "drooling", "saliva", "tears", "teary eyes", "watery eyes", "crying", "half-closed eyes", "heavy-lidded eyes", "bedroom eyes", "heart-shaped pupils", "heart pupils", "rolling eyes", "looking at viewer", "looking down", "looking up", "looking away", "side glance", "intense eye contact", "angry eyes", "angry stare", "clenched teeth", "gritted teeth", "teeth", "biting lip", "biting finger", "smirk", "confident smirk", "playful grin", "cute smile", "soft smile", "shy smile", "nervous smile", "sad expression", "blank expression", "cold expression", "determined gaze", "lustful gaze", "seductive gaze", "desperate expression", "submissive expression", "dominant expression", "annoyed expression", "surprised expression", "sleepy eyes", "orgasm face", "moaning expression"],
  outfits: ["nude", "completely nude", "topless", "bottomless", "lingerie", "lace lingerie", "black lingerie", "white lingerie", "red lingerie", "see-through lingerie", "sheer lingerie", "bra", "panties", "thong", "garter belt", "garter straps", "stockings", "thighhighs", "knee socks", "fishnet stockings", "pantyhose", "tights", "bodystocking", "open shirt", "unbuttoned shirt", "lifted shirt", "pulled aside panties", "panties around one leg", "ripped clothing", "torn clothes", "wet clothes", "transparent clothes", "oversized shirt", "oversized sweater", "cropped top", "crop top", "tank top", "tube top", "halter top", "bikini top", "sports bra", "hoodie", "jacket", "leather jacket", "blazer", "shirt", "dress shirt", "short shorts", "denim shorts", "jeans", "skinny jeans", "ripped jeans", "leggings", "yoga pants", "miniskirt", "pleated skirt", "dress", "cocktail dress", "maid outfit", "maid dress", "nurse outfit", "bunny suit", "bikini", "swimsuit", "one-piece swimsuit", "kimono", "yukata", "cheongsam", "wedding dress", "gothic dress", "witch robe", "nun outfit", "office lady outfit", "business suit", "armor", "fantasy armor", "battle outfit", "bodysuit", "latex bodysuit", "plug suit", "pilot suit", "apron", "high heels", "stilettos", "boots", "thigh-high boots", "combat boots", "barefoot", "choker", "collar", "ribbon", "gloves", "long gloves", "detached sleeves"],
  environments: ["bed", "messy bed", "bedroom", "warm bedroom", "gothic room", "gothic bedroom", "love hotel", "hotel room", "bathroom", "shower", "bathtub", "bathhouse", "onsen", "pool", "beach", "locker room", "dressing room", "mirror room", "vanity mirror", "couch", "sofa", "floor", "tatami room", "kitchen", "office", "studio backdrop", "photo studio", "stage", "alley", "rainy alley", "neon alley", "cyberpunk city", "rooftop", "balcony", "car interior", "train interior", "spaceship corridor", "laboratory", "dungeon", "castle bedroom", "throne room", "ritual chamber", "magic circle", "forest", "enchanted forest", "dark forest", "flower field", "frozen battlefield", "cave", "tentacle cave", "monster lair", "demon realm", "succubus room", "gothic cathedral", "ruined temple", "moonlit room", "candlelit room", "window light room", "empty white background", "dramatic black background", "silk sheets", "black sheets", "white sheets"],
  lighting: ["soft light", "soft lighting", "dramatic lighting", "cinematic lighting", "rim light", "strong rim light", "backlight", "backlighting", "front light", "side light", "low-key lighting", "high-key lighting", "harsh flash", "camera flash", "warm lamp light", "candlelight", "moonlight", "sunlight", "window light", "morning light", "golden hour", "blue hour", "neon light", "red neon light", "pink neon light", "purple neon light", "screen glow", "phone screen glow", "monitor glow", "firelight", "magic glow", "glowing aura", "volumetric light", "light rays", "bloom", "wet skin highlights", "glossy highlights", "specular highlights", "soft shadows", "deep shadows", "dramatic shadows", "silhouette lighting", "underlighting", "spotlight", "stage lighting"],
  camera: ["pov", "first person view", "third person view", "from above", "from below", "low angle", "high angle", "worm's-eye view", "bird's-eye view", "dutch angle", "tilted angle", "diagonal composition", "front view", "back view", "side view", "profile view", "three-quarter view", "over-the-shoulder view", "close-up", "extreme close-up", "medium shot", "wide shot", "full body shot", "cowboy shot", "bust shot", "portrait close-up", "face close-up", "lower body close-up", "chest close-up", "ass close-up", "pussy close-up", "penis close-up", "feet close-up", "hands close-up", "macro shot", "zoomed in", "zoomed out", "fisheye lens", "wide angle lens", "telephoto lens", "85mm lens", "35mm lens", "depth of field", "shallow depth of field", "foreground blur", "motion blur", "speed lines", "dynamic angle", "dynamic perspective", "dramatic foreshortening", "centered composition", "rule of thirds", "cropped composition", "anime screencap framing"],
  interaction: ["solo", "1girl", "1boy", "2girls", "2boys", "multiple girls", "multiple boys", "hetero", "yuri", "yaoi", "girl on top", "boy on top", "faceless male", "faceless partner", "male focus", "female focus", "couple", "pair", "threesome", "group", "size difference", "height difference", "big partner", "monster partner", "tentacle monster", "dominant female", "submissive female", "dominant male", "submissive male", "mutual eye contact", "looking at partner", "looking at viewer during sex", "partner behind", "partner in front", "partner holding hips", "hands on waist", "hands on hips", "holding wrists", "pinning down", "spooning couple", "embracing", "kissing", "french kiss", "neck kiss", "aftercare", "cuddling after sex"]
};

const GENERATED_TAG_AXES = {
  "Character": [["black", "white", "silver", "blonde", "red", "blue", "pink", "purple", "green", "brown", "icy blue", "two-tone", "gradient"], ["long hair", "short hair", "medium hair", "messy hair", "wavy hair", "straight hair", "curly hair", "twin tails", "ponytail", "braided hair", "hime cut", "hair over one eye"], ["ice", "fire", "dark", "forest", "moon", "demon", "angel", "succubus", "oni", "elf", "dragon", "vampire", "witch"], ["girl", "woman", "princess", "queen", "maid", "warrior", "mage", "priestess", "assassin"]],
  "Act": [["rough", "deep", "slow", "gentle", "messy", "passionate", "sweaty", "bedroom", "standing", "spooning", "doggystyle", "cowgirl", "missionary", "anal", "oral"], ["sex", "fucking", "penetration", "creampie", "after sex"], ["bed", "mirror", "shower", "couch", "floor", "bath", "window", "soft", "messy", "teasing"], ["masturbating", "fingering herself", "rubbing clit", "spreading pussy", "touching nipples"]],
  "Pose": [["bed", "floor", "wall", "mirror", "shower", "couch", "chair", "lap", "window", "bath"], ["pose", "pin-up pose", "reclining pose", "kneeling pose", "sitting pose", "spread pose", "arched pose", "over-shoulder pose"], ["missionary", "cowgirl", "reverse cowgirl", "doggystyle", "spooning", "standing", "against wall", "bent over", "prone bone", "mating press"], ["pose", "position", "sex pose", "close-up pose", "full body pose"]],
  "Clothing": [["black", "white", "red", "blue", "pink", "purple", "transparent", "wet", "ripped", "open", "tight", "loose", "latex", "lace", "silk"], ["lingerie", "dress", "shirt", "bodysuit", "stockings", "thighhighs", "panties", "bra", "skirt", "jeans", "shorts", "boots", "gloves", "robe"], ["maid", "nurse", "office lady", "succubus", "witch", "elf", "demon", "oni", "bunny", "idol", "gothic", "cyberpunk", "fantasy armor", "kimono"], ["outfit", "costume", "dress", "uniform", "cosplay"]],
  "Environment": [["gothic", "luxury", "messy", "moonlit", "candlelit", "neon", "warm", "dark", "pink", "red", "blue", "cyberpunk", "fantasy", "demon", "succubus", "tentacle"], ["bedroom", "room", "bathroom", "hotel room", "dungeon", "studio", "lair", "chamber", "castle room", "shower"]],
  "Lighting": [["soft", "warm", "cold", "red", "pink", "blue", "purple", "golden", "harsh", "dim", "dramatic", "cinematic", "moody", "neon", "candle", "moon", "window"], ["lighting", "rim light", "backlight", "glow", "highlights", "shadows"]],
  "Camera/Composition": [["low angle", "high angle", "close-up", "extreme close-up", "wide angle", "pov", "from below", "from above", "side view", "back view", "front view", "over-the-shoulder"], ["shot", "view", "composition", "framing", "perspective"], ["face", "chest", "breasts", "nipples", "waist", "hips", "ass", "thighs", "pussy", "penis", "hands", "feet"], ["close-up", "focus", "framing", "crop"]],
  "Expression": [["angry", "shy", "embarrassed", "lustful", "pleasured", "teary", "sweaty", "desperate", "dominant", "submissive", "sleepy", "cute", "kawaii", "annoyed", "confident", "ecstatic"], ["eyes", "expression", "face", "gaze", "smile", "stare"]],
  "Style": [["semi-realistic", "anime", "doujinshi", "visual novel", "screencap", "manga", "hentai", "pin-up", "gothic", "fantasy", "cyberpunk", "succubus", "monster girl"], ["style", "illustration", "art", "rendering", "cg", "key visual"]]
};

function generatedMegaTags(category) {
  const axes = GENERATED_TAG_AXES[category] || [];
  const tags = [];
  for (let i = 0; i < axes.length; i += 2) {
    (axes[i] || []).forEach((a) => (axes[i + 1] || []).forEach((b) => tags.push(`${a} ${b}`)));
  }
  return tags;
}

function addPromptTags(bucket, category, tags) {
  bucket[category] = unique([...(bucket[category] || []), ...tags]);
}

function expandPromptKnowledgeBase() {
  addPromptTags(CATEGORY_BASE, "Quality", MEGA_TAG_LIBRARY.quality);
  addPromptTags(CATEGORY_BASE, "Character", [...MEGA_TAG_LIBRARY.body, ...MEGA_TAG_LIBRARY.breasts, ...MEGA_TAG_LIBRARY.fantasy, ...MEGA_TAG_LIBRARY.interaction, ...generatedMegaTags("Character")]);
  addPromptTags(CATEGORY_BASE, "Act", [...MEGA_TAG_LIBRARY.normalActs, ...generatedMegaTags("Act")]);
  addPromptTags(CATEGORY_BASE, "Pose", [...MEGA_TAG_LIBRARY.poses, ...generatedMegaTags("Pose")]);
  addPromptTags(CATEGORY_BASE, "Expression", [...MEGA_TAG_LIBRARY.expressions, ...generatedMegaTags("Expression")]);
  addPromptTags(CATEGORY_BASE, "Clothing", [...MEGA_TAG_LIBRARY.outfits, ...generatedMegaTags("Clothing")]);
  addPromptTags(CATEGORY_BASE, "Environment", [...MEGA_TAG_LIBRARY.environments, ...generatedMegaTags("Environment")]);
  addPromptTags(CATEGORY_BASE, "Lighting", [...MEGA_TAG_LIBRARY.lighting, ...generatedMegaTags("Lighting")]);
  addPromptTags(CATEGORY_BASE, "Camera/Composition", [...MEGA_TAG_LIBRARY.camera, ...generatedMegaTags("Camera/Composition")]);
  addPromptTags(CATEGORY_BASE, "Style", [...MEGA_TAG_LIBRARY.quality, ...generatedMegaTags("Style")]);

  addPromptTags(ADULT_TAGS, "Character", [...MEGA_TAG_LIBRARY.body, ...MEGA_TAG_LIBRARY.breasts, ...MEGA_TAG_LIBRARY.fantasy, ...MEGA_TAG_LIBRARY.interaction]);
  addPromptTags(ADULT_TAGS, "Act", [...MEGA_TAG_LIBRARY.adultActs, ...MEGA_TAG_LIBRARY.monsterActs, ...generatedMegaTags("Act")]);
  addPromptTags(ADULT_TAGS, "Pose", [...MEGA_TAG_LIBRARY.poses, ...generatedMegaTags("Pose")]);
  addPromptTags(ADULT_TAGS, "Expression", MEGA_TAG_LIBRARY.expressions);
  addPromptTags(ADULT_TAGS, "Clothing", MEGA_TAG_LIBRARY.outfits);
  addPromptTags(ADULT_TAGS, "Environment", MEGA_TAG_LIBRARY.environments);
  addPromptTags(ADULT_TAGS, "Lighting", MEGA_TAG_LIBRARY.lighting);
  addPromptTags(ADULT_TAGS, "Camera/Composition", MEGA_TAG_LIBRARY.camera);

  Object.keys(ADULT_VIBE_TAGS).forEach((vibe) => {
    addPromptTags(ADULT_VIBE_TAGS[vibe], "Act", MEGA_TAG_LIBRARY.adultActs);
    addPromptTags(ADULT_VIBE_TAGS[vibe], "Pose", MEGA_TAG_LIBRARY.poses);
    addPromptTags(ADULT_VIBE_TAGS[vibe], "Expression", MEGA_TAG_LIBRARY.expressions);
    addPromptTags(ADULT_VIBE_TAGS[vibe], "Character", [...MEGA_TAG_LIBRARY.body, ...MEGA_TAG_LIBRARY.breasts, ...MEGA_TAG_LIBRARY.fantasy, ...MEGA_TAG_LIBRARY.interaction]);
    addPromptTags(ADULT_VIBE_TAGS[vibe], "Clothing", MEGA_TAG_LIBRARY.outfits);
    if (["Fantasy", "Horror", "Sci-Fi"].includes(vibe)) addPromptTags(ADULT_VIBE_TAGS[vibe], "Act", MEGA_TAG_LIBRARY.monsterActs);
  });
}

expandPromptKnowledgeBase();

const FEMALE_CHARACTERS = ["Makima, Chainsaw Man", "Power, Chainsaw Man", "Reze, Chainsaw Man", "Himeno, Chainsaw Man", "Kobeni Higashiyama, Chainsaw Man", "Frieren, Frieren", "Fern, Frieren", "Aura, Frieren", "Ubel, Frieren", "Yor Forger, Spy x Family", "Anya Forger, Spy x Family", "Nobara Kugisaki, Jujutsu Kaisen", "Maki Zenin, Jujutsu Kaisen", "Mei Mei, Jujutsu Kaisen", "Shoko Ieiri, Jujutsu Kaisen", "Mikasa Ackerman, Attack on Titan", "Annie Leonhart, Attack on Titan", "Hange Zoe, Attack on Titan", "Rukia Kuchiki, Bleach", "Orihime Inoue, Bleach", "Yoruichi Shihouin, Bleach", "Rangiku Matsumoto, Bleach", "Nami, One Piece", "Nico Robin, One Piece", "Boa Hancock, One Piece", "Yamato, One Piece", "Tsunade, Naruto", "Hinata Hyuga, Naruto", "Sakura Haruno, Naruto", "Temari, Naruto", "Ino Yamanaka, Naruto", "Mitsuri Kanroji, Demon Slayer", "Shinobu Kocho, Demon Slayer", "Nezuko Kamado, Demon Slayer", "Rias Gremory, High School DxD", "Akeno Himejima, High School DxD", "Esdeath, Akame ga Kill", "Akame, Akame ga Kill", "Mai Sakurajima, Bunny Girl Senpai", "Zero Two, Darling in the Franxx", "Marin Kitagawa, My Dress-Up Darling", "Holo, Spice and Wolf", "Violet Evergarden, Violet Evergarden", "Saber Artoria, Fate", "Rin Tohsaka, Fate", "Medusa Rider, Fate", "Tohru, Miss Kobayashi's Dragon Maid", "Lucoa, Miss Kobayashi's Dragon Maid", "Faye Valentine, Cowboy Bebop", "Motoko Kusanagi, Ghost in the Shell", "Asuka Langley, Evangelion", "Rei Ayanami, Evangelion", "Misato Katsuragi, Evangelion", "Android 18, Dragon Ball", "Bulma, Dragon Ball", "Haruhi Suzumiya, Haruhi Suzumiya", "Yuki Nagato, Haruhi Suzumiya", "Kurisu Makise, Steins Gate", "Rem, Re Zero", "Ram, Re Zero", "Emilia, Re Zero", "Aqua, Konosuba", "Megumin, Konosuba", "Darkness, Konosuba"];
const MALE_CHARACTERS = ["Gojo Satoru, Jujutsu Kaisen", "Nanami Kento, Jujutsu Kaisen", "Toji Fushiguro, Jujutsu Kaisen", "Geto Suguru, Jujutsu Kaisen", "Yuji Itadori, Jujutsu Kaisen", "Megumi Fushiguro, Jujutsu Kaisen", "Denji, Chainsaw Man", "Aki Hayakawa, Chainsaw Man", "Kishibe, Chainsaw Man", "Eren Yeager, Attack on Titan", "Levi Ackerman, Attack on Titan", "Erwin Smith, Attack on Titan", "Reiner Braun, Attack on Titan", "Tanjiro Kamado, Demon Slayer", "Zenitsu Agatsuma, Demon Slayer", "Inosuke Hashibira, Demon Slayer", "Kyojuro Rengoku, Demon Slayer", "Tengen Uzui, Demon Slayer", "Giyu Tomioka, Demon Slayer", "Ichigo Kurosaki, Bleach", "Byakuya Kuchiki, Bleach", "Aizen Sosuke, Bleach", "Grimmjow Jaegerjaquez, Bleach", "Luffy, One Piece", "Roronoa Zoro, One Piece", "Sanji, One Piece", "Trafalgar Law, One Piece", "Portgas D. Ace, One Piece", "Shanks, One Piece", "Naruto Uzumaki, Naruto", "Sasuke Uchiha, Naruto", "Kakashi Hatake, Naruto", "Itachi Uchiha, Naruto", "Madara Uchiha, Naruto", "Minato Namikaze, Naruto", "Goku, Dragon Ball", "Vegeta, Dragon Ball", "Gohan, Dragon Ball", "Trunks, Dragon Ball", "Jotaro Kujo, JoJo", "Dio Brando, JoJo", "Joseph Joestar, JoJo", "Guts, Berserk", "Griffith, Berserk", "Spike Spiegel, Cowboy Bebop", "Vash the Stampede, Trigun", "Alucard, Hellsing", "Archer, Fate", "Gilgamesh, Fate", "Kiritsugu Emiya, Fate", "Subaru Natsuki, Re Zero", "Kazuma Satou, Konosuba", "Loid Forger, Spy x Family", "Mob, Mob Psycho 100", "Saitama, One Punch Man", "Genos, One Punch Man", "Edward Elric, Fullmetal Alchemist", "Roy Mustang, Fullmetal Alchemist"];
const REVIEWED_ADULT_CHARACTER_FALLBACK = new Set([
  "Android 18, Dragon Ball",
  "Tohru, Miss Kobayashi's Dragon Maid",
  "Yor Forger, Spy x Family"
]);

const ANIME_SERIES_LIBRARY = [
  { series: "Dan Da Dan", female: ["Momo Ayase, Dan Da Dan", "Seiko Ayase, Dan Da Dan", "Aira Shiratori, Dan Da Dan", "Vamola, Dan Da Dan", "Rin Sawaki, Dan Da Dan"], male: ["Okarun, Dan Da Dan", "Jiji, Dan Da Dan", "Kinta Sakata, Dan Da Dan"], adult: ["Seiko Ayase, Dan Da Dan"] },
  { series: "Chainsaw Man", female: ["Makima, Chainsaw Man", "Power, Chainsaw Man", "Reze, Chainsaw Man", "Himeno, Chainsaw Man", "Kobeni Higashiyama, Chainsaw Man", "Quanxi, Chainsaw Man", "Fami, Chainsaw Man", "Asa Mitaka, Chainsaw Man", "Yoru, Chainsaw Man"], male: ["Denji, Chainsaw Man", "Aki Hayakawa, Chainsaw Man", "Kishibe, Chainsaw Man", "Angel Devil, Chainsaw Man", "Hirofumi Yoshida, Chainsaw Man"], adult: ["Makima, Chainsaw Man", "Himeno, Chainsaw Man", "Quanxi, Chainsaw Man", "Kishibe, Chainsaw Man", "Aki Hayakawa, Chainsaw Man"] },
  { series: "Frieren", female: ["Frieren, Frieren", "Fern, Frieren", "Ubel, Frieren", "Aura, Frieren", "Flamme, Frieren", "Serie, Frieren", "Lawine, Frieren", "Kanne, Frieren"], male: ["Stark, Frieren", "Himmel, Frieren", "Heiter, Frieren", "Eisen, Frieren", "Wirbel, Frieren", "Denken, Frieren"], adult: ["Frieren, Frieren", "Ubel, Frieren", "Flamme, Frieren", "Serie, Frieren", "Himmel, Frieren", "Heiter, Frieren", "Eisen, Frieren", "Wirbel, Frieren", "Denken, Frieren"] },
  { series: "Spy x Family", female: ["Yor Forger, Spy x Family", "Fiona Frost, Spy x Family", "Sylvia Sherwood, Spy x Family", "Becky Blackbell, Spy x Family", "Anya Forger, Spy x Family"], male: ["Loid Forger, Spy x Family", "Yuri Briar, Spy x Family", "Franky Franklin, Spy x Family", "Damian Desmond, Spy x Family"], adult: ["Yor Forger, Spy x Family", "Fiona Frost, Spy x Family", "Sylvia Sherwood, Spy x Family", "Loid Forger, Spy x Family", "Yuri Briar, Spy x Family", "Franky Franklin, Spy x Family"] },
  { series: "Jujutsu Kaisen", female: ["Nobara Kugisaki, Jujutsu Kaisen", "Maki Zenin, Jujutsu Kaisen", "Mai Zenin, Jujutsu Kaisen", "Mei Mei, Jujutsu Kaisen", "Shoko Ieiri, Jujutsu Kaisen", "Utahime Iori, Jujutsu Kaisen", "Yuki Tsukumo, Jujutsu Kaisen", "Miwa Kasumi, Jujutsu Kaisen"], male: ["Gojo Satoru, Jujutsu Kaisen", "Nanami Kento, Jujutsu Kaisen", "Toji Fushiguro, Jujutsu Kaisen", "Geto Suguru, Jujutsu Kaisen", "Yuji Itadori, Jujutsu Kaisen", "Megumi Fushiguro, Jujutsu Kaisen", "Sukuna, Jujutsu Kaisen", "Choso, Jujutsu Kaisen", "Kento Nanami, Jujutsu Kaisen"], adult: ["Mei Mei, Jujutsu Kaisen", "Shoko Ieiri, Jujutsu Kaisen", "Utahime Iori, Jujutsu Kaisen", "Yuki Tsukumo, Jujutsu Kaisen", "Gojo Satoru, Jujutsu Kaisen", "Nanami Kento, Jujutsu Kaisen", "Toji Fushiguro, Jujutsu Kaisen", "Geto Suguru, Jujutsu Kaisen", "Sukuna, Jujutsu Kaisen", "Choso, Jujutsu Kaisen", "Kento Nanami, Jujutsu Kaisen"] },
  { series: "Bleach", female: ["Rukia Kuchiki, Bleach", "Orihime Inoue, Bleach", "Yoruichi Shihouin, Bleach", "Rangiku Matsumoto, Bleach", "Soi Fon, Bleach", "Retsu Unohana, Bleach", "Nelliel Tu Odelschwanck, Bleach", "Tier Harribel, Bleach", "Bambietta Basterbine, Bleach"], male: ["Ichigo Kurosaki, Bleach", "Byakuya Kuchiki, Bleach", "Aizen Sosuke, Bleach", "Grimmjow Jaegerjaquez, Bleach", "Renji Abarai, Bleach", "Kisuke Urahara, Bleach", "Kyoraku Shunsui, Bleach", "Toshiro Hitsugaya, Bleach", "Kenpachi Zaraki, Bleach"], adult: ["Yoruichi Shihouin, Bleach", "Rangiku Matsumoto, Bleach", "Soi Fon, Bleach", "Retsu Unohana, Bleach", "Nelliel Tu Odelschwanck, Bleach", "Tier Harribel, Bleach", "Byakuya Kuchiki, Bleach", "Aizen Sosuke, Bleach", "Grimmjow Jaegerjaquez, Bleach", "Renji Abarai, Bleach", "Kisuke Urahara, Bleach", "Kyoraku Shunsui, Bleach", "Kenpachi Zaraki, Bleach"] },
  { series: "One Piece", female: ["Nami, One Piece", "Nico Robin, One Piece", "Boa Hancock, One Piece", "Yamato, One Piece", "Nefertari Vivi, One Piece", "Perona, One Piece", "Ulti, One Piece", "Carrot, One Piece", "Jewelry Bonney, One Piece", "Tashigi, One Piece", "Reiju Vinsmoke, One Piece"], male: ["Monkey D. Luffy, One Piece", "Roronoa Zoro, One Piece", "Sanji, One Piece", "Trafalgar Law, One Piece", "Portgas D. Ace, One Piece", "Shanks, One Piece", "Sabo, One Piece", "Mihawk, One Piece", "Crocodile, One Piece"], adult: ["Nami, One Piece", "Nico Robin, One Piece", "Boa Hancock, One Piece", "Yamato, One Piece", "Nefertari Vivi, One Piece", "Perona, One Piece", "Jewelry Bonney, One Piece", "Tashigi, One Piece", "Reiju Vinsmoke, One Piece", "Roronoa Zoro, One Piece", "Sanji, One Piece", "Trafalgar Law, One Piece", "Portgas D. Ace, One Piece", "Shanks, One Piece", "Sabo, One Piece", "Mihawk, One Piece", "Crocodile, One Piece"] },
  { series: "Naruto", female: ["Tsunade, Naruto", "Hinata Hyuga, Naruto", "Sakura Haruno, Naruto", "Temari, Naruto", "Ino Yamanaka, Naruto", "Mei Terumi, Naruto", "Kurenai Yuhi, Naruto", "Anko Mitarashi, Naruto", "Konan, Naruto", "Kaguya Otsutsuki, Naruto"], male: ["Naruto Uzumaki, Naruto", "Sasuke Uchiha, Naruto", "Kakashi Hatake, Naruto", "Itachi Uchiha, Naruto", "Madara Uchiha, Naruto", "Minato Namikaze, Naruto", "Jiraiya, Naruto", "Obito Uchiha, Naruto", "Gaara, Naruto"], adult: ["Tsunade, Naruto", "Mei Terumi, Naruto", "Kurenai Yuhi, Naruto", "Anko Mitarashi, Naruto", "Konan, Naruto", "Kaguya Otsutsuki, Naruto", "Kakashi Hatake, Naruto", "Itachi Uchiha, Naruto", "Madara Uchiha, Naruto", "Minato Namikaze, Naruto", "Jiraiya, Naruto", "Obito Uchiha, Naruto"] },
  { series: "Demon Slayer", female: ["Mitsuri Kanroji, Demon Slayer", "Shinobu Kocho, Demon Slayer", "Nezuko Kamado, Demon Slayer", "Kanao Tsuyuri, Demon Slayer", "Daki, Demon Slayer", "Tamayo, Demon Slayer"], male: ["Tanjiro Kamado, Demon Slayer", "Zenitsu Agatsuma, Demon Slayer", "Inosuke Hashibira, Demon Slayer", "Kyojuro Rengoku, Demon Slayer", "Tengen Uzui, Demon Slayer", "Giyu Tomioka, Demon Slayer", "Muzan Kibutsuji, Demon Slayer", "Akaza, Demon Slayer"], adult: ["Mitsuri Kanroji, Demon Slayer", "Shinobu Kocho, Demon Slayer", "Daki, Demon Slayer", "Tamayo, Demon Slayer", "Kyojuro Rengoku, Demon Slayer", "Tengen Uzui, Demon Slayer", "Giyu Tomioka, Demon Slayer", "Muzan Kibutsuji, Demon Slayer", "Akaza, Demon Slayer"] },
  { series: "Dragon Ball", female: ["Android 18, Dragon Ball", "Bulma, Dragon Ball", "Videl, Dragon Ball", "Chi-Chi, Dragon Ball", "Caulifla, Dragon Ball", "Kale, Dragon Ball", "Launch, Dragon Ball"], male: ["Goku, Dragon Ball", "Vegeta, Dragon Ball", "Gohan, Dragon Ball", "Trunks, Dragon Ball", "Piccolo, Dragon Ball", "Broly, Dragon Ball", "Future Trunks, Dragon Ball"], adult: ["Android 18, Dragon Ball", "Bulma, Dragon Ball", "Videl, Dragon Ball", "Chi-Chi, Dragon Ball", "Caulifla, Dragon Ball", "Kale, Dragon Ball", "Launch, Dragon Ball", "Goku, Dragon Ball", "Vegeta, Dragon Ball", "Gohan, Dragon Ball", "Trunks, Dragon Ball", "Piccolo, Dragon Ball", "Broly, Dragon Ball", "Future Trunks, Dragon Ball"] },
  { series: "Fate", female: ["Saber Artoria, Fate", "Rin Tohsaka, Fate", "Medusa Rider, Fate", "Mordred, Fate", "Jeanne d'Arc, Fate", "Scathach, Fate", "Ishtar, Fate", "Ereshkigal, Fate", "Mash Kyrielight, Fate"], male: ["Archer, Fate", "Gilgamesh, Fate", "Kiritsugu Emiya, Fate", "Cu Chulainn, Fate", "Emiya Shirou, Fate", "Kirei Kotomine, Fate"], adult: ["Saber Artoria, Fate", "Medusa Rider, Fate", "Mordred, Fate", "Jeanne d'Arc, Fate", "Scathach, Fate", "Ishtar, Fate", "Ereshkigal, Fate", "Archer, Fate", "Gilgamesh, Fate", "Kiritsugu Emiya, Fate", "Cu Chulainn, Fate", "Kirei Kotomine, Fate"] },
  { series: "Evangelion", female: ["Misato Katsuragi, Evangelion", "Ritsuko Akagi, Evangelion", "Asuka Langley, Evangelion", "Rei Ayanami, Evangelion", "Mari Makinami, Evangelion"], male: ["Kaworu Nagisa, Evangelion", "Shinji Ikari, Evangelion", "Gendo Ikari, Evangelion", "Ryoji Kaji, Evangelion"], adult: ["Misato Katsuragi, Evangelion", "Ritsuko Akagi, Evangelion", "Gendo Ikari, Evangelion", "Ryoji Kaji, Evangelion"] },
  { series: "Cowboy Bebop", female: ["Faye Valentine, Cowboy Bebop", "Julia, Cowboy Bebop", "Ed, Cowboy Bebop"], male: ["Spike Spiegel, Cowboy Bebop", "Jet Black, Cowboy Bebop", "Vicious, Cowboy Bebop"], adult: ["Faye Valentine, Cowboy Bebop", "Julia, Cowboy Bebop", "Spike Spiegel, Cowboy Bebop", "Jet Black, Cowboy Bebop", "Vicious, Cowboy Bebop"] },
  { series: "Black Lagoon", female: ["Revy, Black Lagoon", "Balalaika, Black Lagoon", "Roberta, Black Lagoon", "Eda, Black Lagoon", "Shenhua, Black Lagoon"], male: ["Rock, Black Lagoon", "Dutch, Black Lagoon", "Benny, Black Lagoon", "Chang, Black Lagoon"], adult: ["Revy, Black Lagoon", "Balalaika, Black Lagoon", "Roberta, Black Lagoon", "Eda, Black Lagoon", "Shenhua, Black Lagoon", "Rock, Black Lagoon", "Dutch, Black Lagoon", "Benny, Black Lagoon", "Chang, Black Lagoon"] },
  { series: "Code Geass", female: ["C.C., Code Geass", "Kallen Kozuki, Code Geass", "Cornelia li Britannia, Code Geass", "Villetta Nu, Code Geass", "Euphemia li Britannia, Code Geass"], male: ["Lelouch Lamperouge, Code Geass", "Suzaku Kururugi, Code Geass", "Jeremiah Gottwald, Code Geass", "Schneizel el Britannia, Code Geass"], adult: ["C.C., Code Geass", "Cornelia li Britannia, Code Geass", "Villetta Nu, Code Geass", "Jeremiah Gottwald, Code Geass", "Schneizel el Britannia, Code Geass"] },
  { series: "My Hero Academia", female: ["Mirko, My Hero Academia", "Mt Lady, My Hero Academia", "Midnight, My Hero Academia", "Lady Nagant, My Hero Academia", "Momo Yaoyorozu, My Hero Academia", "Ochaco Uraraka, My Hero Academia", "Tsuyu Asui, My Hero Academia", "Nejire Hado, My Hero Academia", "Himiko Toga, My Hero Academia"], male: ["All Might, My Hero Academia", "Endeavor, My Hero Academia", "Hawks, My Hero Academia", "Aizawa Shota, My Hero Academia", "Dabi, My Hero Academia", "Shoto Todoroki, My Hero Academia", "Katsuki Bakugo, My Hero Academia", "Izuku Midoriya, My Hero Academia"], adult: ["Mirko, My Hero Academia", "Mt Lady, My Hero Academia", "Midnight, My Hero Academia", "Lady Nagant, My Hero Academia", "All Might, My Hero Academia", "Endeavor, My Hero Academia", "Hawks, My Hero Academia", "Aizawa Shota, My Hero Academia", "Dabi, My Hero Academia"] },
  { series: "Re Zero", female: ["Emilia, Re Zero", "Rem, Re Zero", "Ram, Re Zero", "Echidna, Re Zero", "Elsa Granhiert, Re Zero", "Crusch Karsten, Re Zero", "Priscilla Barielle, Re Zero", "Frederica Baumann, Re Zero"], male: ["Subaru Natsuki, Re Zero", "Reinhard van Astrea, Re Zero", "Roswaal L. Mathers, Re Zero", "Wilhelm van Astrea, Re Zero", "Julius Juukulius, Re Zero"], adult: ["Echidna, Re Zero", "Elsa Granhiert, Re Zero", "Crusch Karsten, Re Zero", "Priscilla Barielle, Re Zero", "Frederica Baumann, Re Zero", "Reinhard van Astrea, Re Zero", "Roswaal L. Mathers, Re Zero", "Wilhelm van Astrea, Re Zero", "Julius Juukulius, Re Zero"] },
  { series: "Konosuba", female: ["Aqua, Konosuba", "Megumin, Konosuba", "Darkness, Konosuba", "Wiz, Konosuba", "Yunyun, Konosuba", "Eris, Konosuba"], male: ["Kazuma Satou, Konosuba", "Vanir, Konosuba"], adult: ["Aqua, Konosuba", "Darkness, Konosuba", "Wiz, Konosuba", "Eris, Konosuba", "Vanir, Konosuba"] },
  { series: "Violet Evergarden", female: ["Violet Evergarden, Violet Evergarden", "Cattleya Baudelaire, Violet Evergarden", "Iris Cannary, Violet Evergarden"], male: ["Gilbert Bougainvillea, Violet Evergarden", "Claudia Hodgins, Violet Evergarden", "Benedict Blue, Violet Evergarden"], adult: ["Violet Evergarden, Violet Evergarden", "Cattleya Baudelaire, Violet Evergarden", "Iris Cannary, Violet Evergarden", "Gilbert Bougainvillea, Violet Evergarden", "Claudia Hodgins, Violet Evergarden", "Benedict Blue, Violet Evergarden"] },
  { series: "Classic / Other", female: ["Holo, Spice and Wolf", "Violet Evergarden, Violet Evergarden", "Motoko Kusanagi, Ghost in the Shell", "Seras Victoria, Hellsing", "Integra Hellsing, Hellsing", "Ryuko Matoi, Kill la Kill", "Satsuki Kiryuin, Kill la Kill", "Fubuki, One Punch Man", "Tatsumaki, One Punch Man", "Kurisu Makise, Steins Gate", "Haruhi Suzumiya, Haruhi Suzumiya", "Yuki Nagato, Haruhi Suzumiya", "Marin Kitagawa, My Dress-Up Darling", "Zero Two, Darling in the Franxx", "Esdeath, Akame ga Kill", "Akame, Akame ga Kill"], male: ["Guts, Berserk", "Griffith, Berserk", "Alucard, Hellsing", "Vash the Stampede, Trigun", "Saitama, One Punch Man", "Genos, One Punch Man", "Mob, Mob Psycho 100", "Edward Elric, Fullmetal Alchemist", "Roy Mustang, Fullmetal Alchemist", "Dio Brando, JoJo", "Jotaro Kujo, JoJo", "Joseph Joestar, JoJo"], adult: ["Holo, Spice and Wolf", "Motoko Kusanagi, Ghost in the Shell", "Seras Victoria, Hellsing", "Integra Hellsing, Hellsing", "Ryuko Matoi, Kill la Kill", "Satsuki Kiryuin, Kill la Kill", "Fubuki, One Punch Man", "Tatsumaki, One Punch Man", "Kurisu Makise, Steins Gate", "Vash the Stampede, Trigun", "Guts, Berserk", "Griffith, Berserk", "Alucard, Hellsing", "Saitama, One Punch Man", "Genos, One Punch Man", "Roy Mustang, Fullmetal Alchemist", "Dio Brando, JoJo", "Jotaro Kujo, JoJo", "Joseph Joestar, JoJo"] }
];

ANIME_SERIES_LIBRARY.push(...[
  { series: "Attack on Titan", female: ["Mikasa Ackerman, Attack on Titan", "Annie Leonhart, Attack on Titan", "Pieck Finger, Attack on Titan", "Hange Zoe, Attack on Titan", "Ymir, Attack on Titan", "Historia Reiss, Attack on Titan", "Sasha Braus, Attack on Titan"], male: ["Eren Yeager, Attack on Titan", "Levi Ackerman, Attack on Titan", "Erwin Smith, Attack on Titan", "Reiner Braun, Attack on Titan", "Jean Kirstein, Attack on Titan", "Armin Arlert, Attack on Titan", "Zeke Yeager, Attack on Titan"], adult: ["Pieck Finger, Attack on Titan", "Hange Zoe, Attack on Titan", "Levi Ackerman, Attack on Titan", "Erwin Smith, Attack on Titan", "Reiner Braun, Attack on Titan", "Jean Kirstein, Attack on Titan", "Zeke Yeager, Attack on Titan"] },
  { series: "Fullmetal Alchemist", female: ["Riza Hawkeye, Fullmetal Alchemist", "Olivier Mira Armstrong, Fullmetal Alchemist", "Winry Rockbell, Fullmetal Alchemist", "Lust, Fullmetal Alchemist", "Izumi Curtis, Fullmetal Alchemist", "Lan Fan, Fullmetal Alchemist"], male: ["Edward Elric, Fullmetal Alchemist", "Alphonse Elric, Fullmetal Alchemist", "Roy Mustang, Fullmetal Alchemist", "Alex Louis Armstrong, Fullmetal Alchemist", "Scar, Fullmetal Alchemist", "Maes Hughes, Fullmetal Alchemist", "Greed, Fullmetal Alchemist"], adult: ["Riza Hawkeye, Fullmetal Alchemist", "Olivier Mira Armstrong, Fullmetal Alchemist", "Lust, Fullmetal Alchemist", "Izumi Curtis, Fullmetal Alchemist", "Roy Mustang, Fullmetal Alchemist", "Alex Louis Armstrong, Fullmetal Alchemist", "Scar, Fullmetal Alchemist", "Maes Hughes, Fullmetal Alchemist", "Greed, Fullmetal Alchemist"] },
  { series: "JoJo", female: ["Jolyne Cujoh, JoJo", "Lisa Lisa, JoJo", "Trish Una, JoJo", "Yukako Yamagishi, JoJo", "Ermes Costello, JoJo", "Foo Fighters, JoJo"], male: ["Jonathan Joestar, JoJo", "Joseph Joestar, JoJo", "Jotaro Kujo, JoJo", "Josuke Higashikata, JoJo", "Giorno Giovanna, JoJo", "Bruno Bucciarati, JoJo", "Dio Brando, JoJo", "Kars, JoJo"], adult: ["Jolyne Cujoh, JoJo", "Lisa Lisa, JoJo", "Ermes Costello, JoJo", "Jonathan Joestar, JoJo", "Joseph Joestar, JoJo", "Jotaro Kujo, JoJo", "Josuke Higashikata, JoJo", "Bruno Bucciarati, JoJo", "Dio Brando, JoJo", "Kars, JoJo"] },
  { series: "Sword Art Online", female: ["Asuna Yuuki, Sword Art Online", "Sinon, Sword Art Online", "Leafa, Sword Art Online", "Alice Zuberg, Sword Art Online", "Eugeo Alice, Sword Art Online", "Administrator Quinella, Sword Art Online"], male: ["Kirito, Sword Art Online", "Eugeo, Sword Art Online", "Klein, Sword Art Online", "Agil, Sword Art Online"], adult: ["Asuna Yuuki, Sword Art Online", "Sinon, Sword Art Online", "Leafa, Sword Art Online", "Alice Zuberg, Sword Art Online", "Administrator Quinella, Sword Art Online", "Kirito, Sword Art Online", "Klein, Sword Art Online", "Agil, Sword Art Online"] },
  { series: "Overlord", female: ["Albedo, Overlord", "Shalltear Bloodfallen, Overlord", "Narberal Gamma, Overlord", "Solution Epsilon, Overlord", "Lupusregina Beta, Overlord", "CZ2128 Delta, Overlord", "Evileye, Overlord"], male: ["Ainz Ooal Gown, Overlord", "Demiurge, Overlord", "Sebas Tian, Overlord", "Cocytus, Overlord", "Pandora's Actor, Overlord"], adult: ["Albedo, Overlord", "Shalltear Bloodfallen, Overlord", "Narberal Gamma, Overlord", "Solution Epsilon, Overlord", "Lupusregina Beta, Overlord", "Sebas Tian, Overlord", "Demiurge, Overlord", "Cocytus, Overlord"] },
  { series: "Mushoku Tensei", female: ["Ghislaine Dedoldia, Mushoku Tensei", "Elinalise Dragonroad, Mushoku Tensei", "Zenith Greyrat, Mushoku Tensei", "Lilia Greyrat, Mushoku Tensei", "Eris Boreas Greyrat, Mushoku Tensei", "Roxy Migurdia, Mushoku Tensei"], male: ["Rudeus Greyrat, Mushoku Tensei", "Ruijerd Superdia, Mushoku Tensei", "Paul Greyrat, Mushoku Tensei", "Orsted, Mushoku Tensei"], adult: ["Ghislaine Dedoldia, Mushoku Tensei", "Elinalise Dragonroad, Mushoku Tensei", "Zenith Greyrat, Mushoku Tensei", "Lilia Greyrat, Mushoku Tensei", "Ruijerd Superdia, Mushoku Tensei", "Paul Greyrat, Mushoku Tensei", "Orsted, Mushoku Tensei"] },
  { series: "That Time I Got Reincarnated as a Slime", female: ["Shion, Slime Isekai", "Shuna, Slime Isekai", "Milim Nava, Slime Isekai", "Hinata Sakaguchi, Slime Isekai", "Velzard, Slime Isekai", "Velgrynd, Slime Isekai"], male: ["Rimuru Tempest, Slime Isekai", "Benimaru, Slime Isekai", "Diablo, Slime Isekai", "Veldora Tempest, Slime Isekai", "Souei, Slime Isekai"], adult: ["Shion, Slime Isekai", "Hinata Sakaguchi, Slime Isekai", "Velzard, Slime Isekai", "Velgrynd, Slime Isekai", "Benimaru, Slime Isekai", "Diablo, Slime Isekai", "Veldora Tempest, Slime Isekai", "Souei, Slime Isekai"] },
  { series: "Fairy Tail", female: ["Erza Scarlet, Fairy Tail", "Lucy Heartfilia, Fairy Tail", "Mirajane Strauss, Fairy Tail", "Juvia Lockser, Fairy Tail", "Cana Alberona, Fairy Tail", "Ultear Milkovich, Fairy Tail", "Irene Belserion, Fairy Tail"], male: ["Natsu Dragneel, Fairy Tail", "Gray Fullbuster, Fairy Tail", "Laxus Dreyar, Fairy Tail", "Jellal Fernandes, Fairy Tail", "Gildarts Clive, Fairy Tail"], adult: ["Erza Scarlet, Fairy Tail", "Lucy Heartfilia, Fairy Tail", "Mirajane Strauss, Fairy Tail", "Juvia Lockser, Fairy Tail", "Cana Alberona, Fairy Tail", "Ultear Milkovich, Fairy Tail", "Irene Belserion, Fairy Tail", "Gray Fullbuster, Fairy Tail", "Laxus Dreyar, Fairy Tail", "Jellal Fernandes, Fairy Tail", "Gildarts Clive, Fairy Tail"] },
  { series: "Black Clover", female: ["Mereoleona Vermillion, Black Clover", "Vanessa Enoteca, Black Clover", "Charlotte Roselei, Black Clover", "Noelle Silva, Black Clover", "Nero Secre, Black Clover", "Charmy Pappitson, Black Clover"], male: ["Yami Sukehiro, Black Clover", "Asta, Black Clover", "Yuno, Black Clover", "Julius Novachrono, Black Clover", "Fuegoleon Vermillion, Black Clover", "Magna Swing, Black Clover"], adult: ["Mereoleona Vermillion, Black Clover", "Vanessa Enoteca, Black Clover", "Charlotte Roselei, Black Clover", "Yami Sukehiro, Black Clover", "Julius Novachrono, Black Clover", "Fuegoleon Vermillion, Black Clover", "Magna Swing, Black Clover"] },
  { series: "Hellsing", female: ["Seras Victoria, Hellsing", "Integra Hellsing, Hellsing", "Rip Van Winkle, Hellsing", "Zorin Blitz, Hellsing"], male: ["Alucard, Hellsing", "Alexander Anderson, Hellsing", "Walter C. Dornez, Hellsing", "The Captain, Hellsing"], adult: ["Seras Victoria, Hellsing", "Integra Hellsing, Hellsing", "Rip Van Winkle, Hellsing", "Zorin Blitz, Hellsing", "Alucard, Hellsing", "Alexander Anderson, Hellsing", "Walter C. Dornez, Hellsing", "The Captain, Hellsing"] },
  { series: "Kill la Kill", female: ["Ryuko Matoi, Kill la Kill", "Satsuki Kiryuin, Kill la Kill", "Mako Mankanshoku, Kill la Kill", "Nui Harime, Kill la Kill", "Ragyo Kiryuin, Kill la Kill", "Nonon Jakuzure, Kill la Kill"], male: ["Aikuro Mikisugi, Kill la Kill", "Uzu Sanageyama, Kill la Kill", "Ira Gamagoori, Kill la Kill", "Houka Inumuta, Kill la Kill"], adult: ["Ryuko Matoi, Kill la Kill", "Satsuki Kiryuin, Kill la Kill", "Ragyo Kiryuin, Kill la Kill", "Aikuro Mikisugi, Kill la Kill", "Uzu Sanageyama, Kill la Kill", "Ira Gamagoori, Kill la Kill", "Houka Inumuta, Kill la Kill"] },
  { series: "Cyberpunk Edgerunners", female: ["Lucy, Cyberpunk Edgerunners", "Rebecca, Cyberpunk Edgerunners", "Kiwi, Cyberpunk Edgerunners", "Dorio, Cyberpunk Edgerunners"], male: ["David Martinez, Cyberpunk Edgerunners", "Maine, Cyberpunk Edgerunners", "Falco, Cyberpunk Edgerunners", "Faraday, Cyberpunk Edgerunners"], adult: ["Lucy, Cyberpunk Edgerunners", "Kiwi, Cyberpunk Edgerunners", "Dorio, Cyberpunk Edgerunners", "Maine, Cyberpunk Edgerunners", "Falco, Cyberpunk Edgerunners", "Faraday, Cyberpunk Edgerunners"] },
  { series: "Gurren Lagann", female: ["Yoko Littner, Gurren Lagann", "Nia Teppelin, Gurren Lagann", "Kiyoh Bachika, Gurren Lagann", "Kiyal Bachika, Gurren Lagann"], male: ["Kamina, Gurren Lagann", "Simon, Gurren Lagann", "Viral, Gurren Lagann", "Lordgenome, Gurren Lagann"], adult: ["Yoko Littner, Gurren Lagann", "Kiyoh Bachika, Gurren Lagann", "Kamina, Gurren Lagann", "Viral, Gurren Lagann", "Lordgenome, Gurren Lagann"] },
  { series: "Soul Eater", female: ["Maka Albarn, Soul Eater", "Blair, Soul Eater", "Medusa Gorgon, Soul Eater", "Arachne Gorgon, Soul Eater", "Tsubaki Nakatsukasa, Soul Eater"], male: ["Soul Evans, Soul Eater", "Death the Kid, Soul Eater", "Black Star, Soul Eater", "Franken Stein, Soul Eater", "Spirit Albarn, Soul Eater"], adult: ["Blair, Soul Eater", "Medusa Gorgon, Soul Eater", "Arachne Gorgon, Soul Eater", "Franken Stein, Soul Eater", "Spirit Albarn, Soul Eater"] },
  { series: "Akame ga Kill", female: ["Akame, Akame ga Kill", "Esdeath, Akame ga Kill", "Leone, Akame ga Kill", "Chelsea, Akame ga Kill", "Mine, Akame ga Kill", "Sheele, Akame ga Kill"], male: ["Tatsumi, Akame ga Kill", "Bulat, Akame ga Kill", "Lubbock, Akame ga Kill", "Wave, Akame ga Kill"], adult: ["Esdeath, Akame ga Kill", "Leone, Akame ga Kill", "Chelsea, Akame ga Kill", "Sheele, Akame ga Kill", "Bulat, Akame ga Kill", "Lubbock, Akame ga Kill", "Wave, Akame ga Kill"] }
]);

function animeSeriesNames() {
  return ["All Anime", ...ANIME_SERIES_LIBRARY.map((item) => item.series)];
}

function selectedSeriesRows() {
  const selected = state?.builder?.animeSeries || "All Anime";
  return selected === "All Anime"
    ? ANIME_SERIES_LIBRARY
    : ANIME_SERIES_LIBRARY.filter((item) => item.series === selected);
}

function charactersForMode(mode) {
  const rows = selectedSeriesRows();
  const fromSeries = rows.flatMap((item) => mode === "male" ? item.male : item.female);
  const fallback = mode === "male" ? MALE_CHARACTERS : FEMALE_CHARACTERS;
  return (state?.builder?.animeSeries || "All Anime") === "All Anime"
    ? unique([...fromSeries, ...fallback])
    : unique(fromSeries);
}

function adultCharacterSet() {
  const reviewed = new Set(REVIEWED_ADULT_CHARACTER_FALLBACK);
  const entities = engineReady() ? globalThis.PromptBrainEngine.ALL_ENTITIES : [];
  entities
    .filter((entity) => entity.adultAllowed === true)
    .forEach((entity) => {
      reviewed.add(entity.name);
      if (entity.namespace) reviewed.add(`${entity.name}, ${entity.namespace}`);
    });
  return reviewed;
}

function adultCharactersForMode(mode = "female") {
  const adult = adultCharacterSet();
  const rows = ANIME_SERIES_LIBRARY;
  const fromSeries = rows.flatMap((item) => mode === "male" ? item.male : item.female);
  const fallback = mode === "male" ? MALE_CHARACTERS : FEMALE_CHARACTERS;
  return unique([...fromSeries, ...fallback]).filter((item) => adult.has(item));
}

function allAdultCharacters() {
  const adult = adultCharacterSet();
  return unique([...adultCharactersForMode("female"), ...adultCharactersForMode("male")]).filter((item) => adult.has(item));
}

function randomPick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomMany(list, min = 1, max = min) {
  const pool = unique(list).slice();
  const count = Math.min(pool.length, min + Math.floor(Math.random() * (max - min + 1)));
  const picked = [];
  while (picked.length < count && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}

function characterSearchKeys(character) {
  const [name, series = ""] = String(character).split(",").map((part) => part.trim());
  const compact = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const family = compact.split(" ").filter(Boolean);
  return unique([
    compact,
    `${compact} ${series.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`.trim(),
    family.length > 1 ? family[0] : "",
    name.toLowerCase()
  ].filter((item) => item.length >= 3));
}

function detectRequestedCharacter(text, mode = "female") {
  const lower = String(text || "").toLowerCase().replace(/[^a-z0-9\\()' -]+/g, " ");
  const candidates = mode === "male"
    ? adultCharactersForMode("male")
    : mode === "female"
      ? adultCharactersForMode("female")
      : allAdultCharacters();
  return candidates.find((character) => characterSearchKeys(character).some((key) => intentContains(lower, key))) || "";
}

function resolveCharacterIntent(text) {
  const lower = String(text || "").toLowerCase();
  const wantsMale = /\b(male|man|boy|1boy|husbando)\b/i.test(lower);
  const wantsFemale = /\b(female|woman|girl|1girl|waifu|anime girl|anime woman|female anime character)\b/i.test(lower);
  const mode = wantsMale && !wantsFemale ? "male" : "female";
  const named = detectRequestedCharacter(lower, wantsMale && !wantsFemale ? "male" : wantsFemale ? "female" : "all");
  if (named) return named;
  if (/\b(male anime character|anime man|anime boy|husbando)\b/i.test(lower)) {
    return randomPick(adultCharactersForMode("male"));
  }
  if (/\b(anime character|anime girl|anime woman|female anime character|random anime character|waifu)\b/i.test(lower)) {
    return randomPick(adultCharactersForMode("female"));
  }
  return "";
}

const RANDOM_ADULT_SCENES = {
  solo: [
    { scene: ["masturbating", "fingering herself", "nude", "wet pussy"], pose: ["lying on bed", "arched back", "legs spread"], expression: ["blush", "parted lips", "heavy-lidded eyes"], environment: ["bedroom", "soft sheets"], lighting: ["warm ambient light"], camera: ["full body shot"] },
    { scene: ["touching herself", "pulling panties aside", "wet pussy"], pose: ["sitting on bed", "knees apart", "looking at viewer"], expression: ["teasing smile", "flushed face"], environment: ["messy bedroom", "window light"], lighting: ["soft morning light"], camera: ["medium shot"] },
    { scene: ["masturbating", "nude", "visible clit"], pose: ["reclining nude pose", "one hand between thighs"], expression: ["ahegao", "tongue out"], environment: ["private room"], lighting: ["low warm light"], camera: ["close-up"] }
  ],
  partnered: [
    { scene: ["being fucked", "vaginal sex", "deep penetration", "wet pussy"], pose: ["missionary position", "lying on back", "legs spread"], interaction: ["1boy", "hetero", "boy on top"], expression: ["blush", "parted lips"], environment: ["bedroom", "rumpled sheets"], lighting: ["warm ambient light"], camera: ["from above"] },
    { scene: ["being fucked from behind", "doggystyle sex", "deep penetration"], pose: ["on all fours", "ass up", "arched back"], interaction: ["1boy", "hetero", "partner behind"], expression: ["heavy-lidded eyes", "open mouth"], environment: ["bedroom"], lighting: ["dramatic shadows"], camera: ["back view"] },
    { scene: ["cowgirl sex", "riding penis", "deep penetration"], pose: ["cowgirl position", "straddling pose"], interaction: ["1boy", "hetero", "girl on top"], expression: ["confident smirk", "blush"], environment: ["hotel room"], lighting: ["neon window light"], camera: ["low angle"] },
    { scene: ["spooning", "fucking", "deep penetration"], pose: ["side lying pose", "lying on side pose"], interaction: ["1boy", "hetero", "partner behind"], expression: ["parted lips", "half-closed eyes"], environment: ["bedroom"], lighting: ["moonlight"], camera: ["side view"] }
  ],
  monster: [
    { scene: ["monster sex", "deep penetration", "size difference"], pose: ["lying on back", "legs spread"], interaction: ["monster partner"], expression: ["ahegao", "open mouth"], environment: ["monster lair", "rocky cave interior"], lighting: ["dramatic shadows"], camera: ["low angle"] },
    { scene: ["tentacle sex", "tentacle penetration", "tentacles around body"], pose: ["suspended pose", "legs spread"], interaction: ["tentacle monster"], expression: ["blush", "drooling"], environment: ["tentacle cave"], lighting: ["glowing slime light"], camera: ["dynamic angle"] },
    { scene: ["beastman partner", "being fucked", "size difference"], pose: ["against wall pose", "one leg lifted"], interaction: ["beastman partner"], expression: ["parted lips", "flushed face"], environment: ["fantasy dungeon"], lighting: ["torchlight"], camera: ["three-quarter view"] }
  ]
};

const RANDOM_MALE_ADULT_SCENES = [
  { scene: ["nude", "erect penis", "male focus"], pose: ["standing pose", "one hand on hip"], expression: ["confident smirk", "intense eye contact"], environment: ["bedroom"], lighting: ["warm ambient light"], camera: ["full body shot"] },
  { scene: ["masturbating", "erect penis", "male focus"], pose: ["sitting on bed", "legs apart"], expression: ["heavy-lidded eyes", "parted lips"], environment: ["private room"], lighting: ["low warm light"], camera: ["medium shot"] },
  { scene: ["solo male nude", "erect penis"], pose: ["reclining pose", "looking at viewer"], expression: ["confident smirk"], environment: ["hotel room"], lighting: ["soft window light"], camera: ["three-quarter view"] }
];

const RANDOM_MALE_PARTNERED_SCENES = [
  { scene: ["fucking her", "vaginal sex", "deep penetration"], pose: ["standing behind partner", "partner bent over"], interaction: ["1girl", "hetero", "partner bent over"], expression: ["focused eyes", "parted lips"], environment: ["bedroom"], lighting: ["warm ambient light"], camera: ["back view"] },
  { scene: ["being ridden", "cowgirl sex", "deep penetration"], pose: ["lying on back", "girl on top"], interaction: ["1girl", "hetero"], expression: ["heavy-lidded eyes"], environment: ["hotel room"], lighting: ["neon window light"], camera: ["from above"] },
  { scene: ["missionary sex", "deep penetration"], pose: ["boy on top", "missionary position"], interaction: ["1girl", "hetero"], expression: ["intense eye contact"], environment: ["bedroom", "rumpled sheets"], lighting: ["soft warm light"], camera: ["three-quarter view"] }
];

function requestedGender(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(male anime character|anime man|anime boy|husbando)\b/i.test(lower)) return "male";
  if (/\b(female anime character|anime girl|anime woman|waifu)\b/i.test(lower)) return "female";
  const wantsMale = /\b(male|man|boy|1boy|husbando|male anime character|anime man|anime boy)\b/i.test(lower);
  const wantsFemale = /\b(female|woman|girl|1girl|waifu|anime girl|anime woman|female anime character)\b/i.test(lower);
  if (wantsMale && !wantsFemale) return "male";
  if (wantsFemale && !wantsMale) return "female";
  return "mixed";
}

function resolveAdultSceneKind(text) {
  const lower = String(text || "").toLowerCase();
  if (/(monster|beast|beastman|tentacle|orc|minotaur|werewolf|dragon partner)/i.test(lower)) return "monster";
  if (/(fuck|fucked|sex|penetration|getting fucked|being fucked|vaginal|anal|oral|blowjob|fellatio|cowgirl|missionary|doggy|spooning)/i.test(lower)) return "partnered";
  if (/(solo|masturbat|touching herself|fingering herself)/i.test(lower)) return "solo";
  return randomPick(["solo", "partnered"]);
}

function applySceneTemplate(blocks, template) {
  blocks.scene.push(...(template.scene || []));
  blocks.pose.push(...(template.pose || []));
  blocks.expression.push(...(template.expression || []));
  blocks.environment.push(...(template.environment || []));
  blocks.lighting.push(...(template.lighting || []));
  blocks.camera.push(...(template.camera || []));
  blocks.interaction.push(...(template.interaction || []));
}

const state = loadState();
let activeChatId = state.activeChatId || null;
let likedImageData = "";
let referenceImageData = "";
let referenceAnalysis = null;
let nativeSaveErrorShown = false;
let localBackupErrorShown = false;
const persistentStateStore = window.PromptBrainStateStore?.createStateStore({
  storageKey,
  apiBase: "/api",
  debounceMs: 180,
  onError(error, context) {
    console.error("PromptBrain persistence error", context, error);
    const status = document.querySelector("#sessionSaveStatus");
    if (status) status.textContent = "Save retry pending";
  },
  onSaved(savedState) {
    nativeSaveErrorShown = false;
    state.schemaVersion = savedState.schemaVersion;
    state.meta = savedState.meta;
    state.savedAt = savedState.savedAt;
    ["liked", "references", "gallery"].forEach((collectionName) => {
      const savedById = new Map((savedState[collectionName] || []).map((item) => [item.id, item]));
      (state[collectionName] || []).forEach((item) => {
        const saved = savedById.get(item.id);
        if (!saved?.assetId) return;
        item.assetId = saved.assetId;
        item.image = saved.image;
      });
    });
    const status = document.querySelector("#sessionSaveStatus");
    if (status) status.textContent = "Saved locally";
  }
});

const els = {
  activeTitle: $("#activeTitle"),
  sidebar: $("#sidebar"),
  sidebarToggle: $("#sidebarToggle"),
  homeLogoBtn: $("#homeLogoBtn"),
  sidebarSessions: $("#sidebarSessions"),
  sidebarNewSessionBtn: $("#sidebarNewSessionBtn"),
  openSettingsBtn: $("#openSettingsBtn"),
  settingsModal: $("#settingsModal"),
  closeSettingsBtn: $("#closeSettingsBtn"),
  brainStats: $("#brainStats"),
  messages: $("#messages"),
  chatList: $("#chatList"),
  historyChatList: $("#historyChatList"),
  historyVersionList: $("#historyVersionList"),
  homeTopRated: $("#homeTopRated"),
  workspaceCheckpointList: $("#workspaceCheckpointList"),
  workspaceRatingSpark: $("#workspaceRatingSpark"),
  imageMemoryDetail: $("#imageMemoryDetail"),
  trainingTriggerInput: $("#trainingTriggerInput"),
  trainingAvoidInput: $("#trainingAvoidInput"),
  trainingPreferInput: $("#trainingPreferInput"),
  trainingList: $("#trainingList"),
  checkpointSelect: $("#checkpointSelect"),
  vibeSelect: $("#vibeSelect"),
  contentModeSelect: $("#contentModeSelect"),
  characterModeSelect: $("#characterModeSelect"),
  animeSeriesSelect: $("#animeSeriesSelect"),
  characterSearch: $("#characterSearch"),
  characterList: $("#characterList"),
  loraPicker: $("#loraPicker"),
  loraPickerCount: $("#loraPickerCount"),
  selectedLoras: $("#selectedLoras"),
  styleTokenPicker: $("#styleTokenPicker"),
  builderCategoryGrid: $("#builderCategoryGrid"),
  customNegativeInput: $("#customNegativeInput"),
  positivePromptOutput: $("#positivePromptOutput"),
  negativePromptOutput: $("#negativePromptOutput"),
  negativePromptPanel: $("#negativePromptPanel"),
  copyPositiveLive: $("#copyPositiveLive"),
  copyNegativeLive: $("#copyNegativeLive"),
  modelKnowledgePanel: $("#modelKnowledgePanel"),
  workspaceRealStats: $("#workspaceRealStats"),
  sessionSaveStatus: $("#sessionSaveStatus"),
  usageOverview: $("#usageOverview"),
  tagScoreChart: $("#tagScoreChart"),
  vibeUsageChart: $("#vibeUsageChart"),
  checkpointUsageChart: $("#checkpointUsageChart"),
  realLearningStrength: $("#realLearningStrength"),
  realLearningNote: $("#realLearningNote"),
  historyLearningList: $("#historyLearningList"),
  checkpointLibrary: $("#checkpointLibrary"),
  modelRuleDetails: $("#modelRuleDetails"),
  loraLibrary: $("#loraLibrary"),
  modelSelectedLoras: $("#modelSelectedLoras"),
  styleTokenLibrary: $("#styleTokenLibrary"),
  radarChart: $("#radarChart"),
  failureModes: $("#failureModes"),
  checkpointList: $("#checkpointList"),
  ratingTrend: $("#ratingTrend"),
  profileConfidenceRing: $("#profileConfidenceRing"),
  likesList: $("#likesList"),
  dislikesList: $("#dislikesList"),
  conditionalRules: $("#conditionalRules"),
  compareGrid: $("#compareGrid"),
  changeList: $("#changeList"),
  learningInsights: $("#learningInsights"),
  userPrompt: $("#userPrompt"),
  promptMode: $("#promptMode"),
  learningPull: $("#learningPull"),
  useResearchToggle: $("#useResearchToggle"),
  useReferenceToggle: $("#useReferenceToggle"),
  useLocalAiToggle: $("#useLocalAiToggle"),
  variationBaseInput: $("#variationBaseInput"),
  versionList: $("#versionList"),
  poseBodyInput: $("#poseBodyInput"),
  poseCameraInput: $("#poseCameraInput"),
  poseHeadInput: $("#poseHeadInput"),
  poseHandsInput: $("#poseHandsInput"),
  poseExpressionInput: $("#poseExpressionInput"),
  poseOutput: $("#poseOutput"),
  cleanupInput: $("#cleanupInput"),
  cleanupOutput: $("#cleanupOutput"),
  galleryImageInput: $("#galleryImageInput"),
  galleryPromptInput: $("#galleryPromptInput"),
  galleryGrid: $("#galleryGrid"),
  likedImageInput: $("#likedImageInput"),
  likedPreview: $("#likedPreview"),
  likedPromptInput: $("#likedPromptInput"),
  likedTagsInput: $("#likedTagsInput"),
  likedRatingInput: $("#likedRatingInput"),
  likedGrid: $("#likedGrid"),
  referenceImageInput: $("#referenceImageInput"),
  referencePreview: $("#referencePreview"),
  referenceNotesInput: $("#referenceNotesInput"),
  referenceGrid: $("#referenceGrid"),
  ocSeedInput: $("#ocSeedInput"),
  ocWorldInput: $("#ocWorldInput"),
  ocStyleInput: $("#ocStyleInput"),
  ocOutput: $("#ocOutput"),
  researchQuery: $("#researchQuery"),
  researchResults: $("#researchResults"),
  manualResearchNotes: $("#manualResearchNotes"),
  profileNameInput: $("#profileNameInput"),
  profileDescInput: $("#profileDescInput"),
  profileTagsInput: $("#profileTagsInput"),
  profileGrid: $("#profileGrid"),
  loraNameInput: $("#loraNameInput"),
  loraTagsInput: $("#loraTagsInput"),
  loraNotesInput: $("#loraNotesInput"),
  loraGrid: $("#loraGrid"),
  likedCount: $("#likedCount"),
  referenceCount: $("#referenceCount"),
  profileCount: $("#profileCount"),
  loraCount: $("#loraCount"),
  negativeInput: $("#negativeInput"),
  rulesInput: $("#rulesInput"),
  ollamaModelInput: $("#ollamaModelInput"),
  workflowTypeInput: $("#workflowTypeInput"),
  themeSelect: $("#themeSelect"),
  compactModeToggle: $("#compactModeToggle"),
  reduceMotionToggle: $("#reduceMotionToggle"),
  denseSidebarToggle: $("#denseSidebarToggle"),
  sidebarCollapsedToggle: $("#sidebarCollapsedToggle"),
  enableNegativePromptToggle: $("#enableNegativePromptToggle"),
  useBreakToggle: $("#useBreakToggle"),
  defaultAiToggle: $("#defaultAiToggle"),
  defaultResearchToggle: $("#defaultResearchToggle"),
  autoTrainingToggle: $("#autoTrainingToggle"),
  promptStrictnessInput: $("#promptStrictnessInput"),
  ollamaEndpointInput: $("#ollamaEndpointInput"),
  modelFolderInput: $("#modelFolderInput"),
  appFolderInput: $("#appFolderInput"),
  maxTrainingRulesInput: $("#maxTrainingRulesInput"),
  minGalleryRatingInput: $("#minGalleryRatingInput"),
  learnFromChatsToggle: $("#learnFromChatsToggle"),
  learnFromResearchToggle: $("#learnFromResearchToggle"),
  engineCatalogStatus: $("#engineCatalogStatus"),
  memoryPathStatus: $("#memoryPathStatus"),
  settingsExportBtn: $("#settingsExportBtn"),
  settingsImportBtn: $("#settingsImportBtn"),
  resetMemoryBtn: $("#resetMemoryBtn"),
  importDataInput: $("#importDataInput"),
  toast: $("#toast")
};

normalizeState();

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey));
    if (parsed && typeof parsed === "object") {
      return window.PromptBrainStateStore?.migrateState(parsed).state || parsed;
    }
  } catch {
    // Bad saved JSON should not brick the app.
  }

  if (window.PromptBrainStateStore) return window.PromptBrainStateStore.createDefaultState();
  const chatId = crypto.randomUUID();
  return {
    activeChatId: chatId,
    savedAt: Date.now(),
    chats: [{
      id: chatId,
      title: "New Chat",
      createdAt: Date.now(),
      messages: [{
        role: "assistant",
        text: "Tell me what you want and I will build a ComfyUI prompt. Rate what works, save results you like, and I will keep learning your taste locally."
      }]
    }],
    liked: [],
    references: [],
    profiles: [],
    loras: [],
    versions: [],
    gallery: [],
    trainingRules: [],
    researchNotes: [],
    settings: {
      negativePrompt: defaultNegative,
      rules: defaultRules,
      ollamaModel: "qwen2.5:7b",
      workflowType: "basic"
    }
  };
}

function normalizeState() {
  state.chats ||= [];
  state.liked ||= [];
  state.references ||= [];
  state.profiles ||= [];
  state.loras ||= [];
  state.versions ||= [];
  state.gallery ||= [];
  state.trainingRules ||= [];
  state.researchNotes ||= [];
  state.settings ||= {};
  state.settings.negativePrompt ||= defaultNegative;
  if (!state.settings.rules || state.settings.rules === legacyDefaultRules) {
    state.settings.rules = defaultRules;
  }
  if (!state.settings.ollamaModel || state.settings.ollamaModel === "llama3.1") {
    state.settings.ollamaModel = "qwen2.5:7b";
  }
  state.settings.workflowType ||= "basic";
  state.settings.enableNegativePrompt = state.settings.enableNegativePrompt === true;
  state.settings.useBreak = state.settings.useBreak !== false;
  state.settings.compactMode ||= false;
  state.settings.reduceMotion ||= false;
  state.settings.denseSidebar ||= false;
  state.settings.sidebarCollapsed ||= false;
  state.settings.theme ||= "night-cyan";
  state.settings.defaultAi ||= false;
  state.settings.defaultResearch ||= false;
  state.settings.autoTraining = state.settings.autoTraining !== false;
  state.settings.promptStrictness ||= "balanced";
  state.settings.ollamaEndpoint ||= "http://127.0.0.1:11434";
  state.settings.modelFolder ||= "E:\\PromptBrain\\models";
  state.settings.appFolder ||= "E:\\PromptBrain";
  state.settings.maxTrainingRules ||= 12;
  state.settings.minGalleryRating ||= 4;
  state.settings.learnFromChats = state.settings.learnFromChats !== false;
  state.settings.learnFromResearch = state.settings.learnFromResearch !== false;
  state.builder ||= {};
  state.builder.checkpointId ||= "waiIllustriousXL";
  state.builder.vibe ||= "Free";
  state.builder.contentMode ||= "sfw";
  state.builder.characterMode ||= "female";
  state.builder.animeSeries ||= "All Anime";
  state.builder.character ||= "";
  state.builder.characterQuery ||= "";
  state.builder.selectedTags ||= {};
  state.builder.tagWeights ||= {};
  purgeBadDefaultSelections();
  state.builder.selectedLoras ||= [];
  state.builder.loraWeights ||= {};
  state.builder.selectedStyleTokens ||= [];
  state.builder.customNegative ||= "";
  state.builder.draft ||= "";
  state.builder.categorySearches ||= {};
  if (state.builder.characterMode !== "manual" && state.builder.character && !charactersForMode(state.builder.characterMode).includes(state.builder.character)) {
    state.builder.character = "";
  }
  if (state.builder.contentMode === "adult" && state.builder.characterMode !== "manual" && state.builder.character && !adultCharacterSet().has(state.builder.character)) {
    state.builder.character = "";
  }
  state.usageStats ||= {};
  state.usageStats.totalPrompts ||= 0;
  state.usageStats.feedbackGood ||= 0;
  state.usageStats.feedbackBad ||= 0;
  state.usageStats.tagScores ||= {};
  state.usageStats.vibeUsage ||= {};
  state.usageStats.checkpointUsage ||= {};
  state.usageStats.loraUsage ||= {};
  state.usageStats.history ||= [];
  state.usageStats.feedbackByArtifact ||= {};
  state.usageStats.history = state.usageStats.history.slice(0, 50);
  state.selectedImageId ||= "";
  state.engine ||= { source: "", fingerprint: "", loadedAt: 0, dataRoot: "" };
  state.chats.forEach((chat) => {
    chat.messages ||= [];
    chat.builderSnapshot ||= null;
    chat.draft ||= "";
  });
}

function saveState(options = {}) {
  if (options.captureWorkspace !== false) syncActiveChatWorkspace();
  normalizeState();
  state.activeChatId = activeChatId;
  state.savedAt = Date.now();
  if (els.sessionSaveStatus) els.sessionSaveStatus.textContent = "Saving...";
  let persistence = Promise.resolve(null);
  if (persistentStateStore) {
    persistence = persistentStateStore.save(state, { immediate: options.immediate === true }).catch(() => {
      if (!nativeSaveErrorShown) {
        nativeSaveErrorShown = true;
        toast("Could not save the app memory file. Export data from the top bar as backup.");
      }
      return null;
    });
  } else {
    saveLocalBackup();
  }
  if (options.render !== false) renderAll();
  return persistence;
}

function saveLocalBackup() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    try {
      localStorage.setItem(storageKey, JSON.stringify(lightweightStateCopy()));
      if (!localBackupErrorShown) {
        localBackupErrorShown = true;
        toast("Memory is saved to the app data file. Browser backup was trimmed.");
      }
    } catch {
      if (!localBackupErrorShown) {
        localBackupErrorShown = true;
        toast("Browser backup is full, but app-file memory is still being saved.");
      }
    }
  }
}

function lightweightStateCopy() {
  const copy = JSON.parse(JSON.stringify(state));
  ["liked", "references", "gallery"].forEach((key) => {
    copy[key] = (copy[key] || []).map((item) => ({ ...item, image: item.image ? "__stored_in_app_state_file__" : "" }));
  });
  return copy;
}

async function hydratePersistentState() {
  try {
    const incoming = persistentStateStore ? (await persistentStateStore.load()).state : null;
    if (!incoming || !incoming.chats) return;

    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, incoming);
    normalizeState();
    activeChatId = state.activeChatId || state.chats?.[0]?.id || null;
    restoreChatWorkspace(state.chats.find((chat) => chat.id === activeChatId), false);
    renderAll();
  } catch {
    // The desktop wrapper owns /api/state. Plain browser preview can still run with localStorage only.
  }
}

function activeChat() {
  if (!activeChatId || !state.chats.some((chat) => chat.id === activeChatId)) {
    activeChatId = state.chats[0]?.id || createChat(false).id;
  }
  return state.chats.find((chat) => chat.id === activeChatId);
}

function createChat(shouldSave = true) {
  syncActiveChatWorkspace();
  const current = captureBuilderSnapshot();
  const chat = {
    id: crypto.randomUUID(),
    title: "New Chat",
    createdAt: Date.now(),
    draft: "",
    builderSnapshot: {
      ...current,
      draft: "",
      character: "",
      characterQuery: "",
      selectedTags: {},
      tagWeights: {},
      selectedLoras: [],
      loraWeights: {},
      selectedStyleTokens: [],
      customNegative: "",
      categorySearches: {}
    },
    messages: [{ role: "assistant", text: "Fresh session. Describe the image and I will build it with the offline engine." }]
  };
  state.chats.unshift(chat);
  activeChatId = chat.id;
  restoreChatWorkspace(chat, false);
  if (shouldSave) saveState();
  return chat;
}

function syncActiveChatWorkspace() {
  const chat = state.chats?.find((item) => item.id === activeChatId);
  if (!chat || !els?.userPrompt) return;
  chat.draft = els.userPrompt.value || "";
  chat.builderSnapshot = captureBuilderSnapshot();
}

function restoreChatWorkspace(chat, shouldRender = true) {
  if (!chat) return;
  const snapshot = chat.builderSnapshot;
  if (snapshot && typeof snapshot === "object") {
    state.builder = JSON.parse(JSON.stringify(snapshot));
  }
  normalizeState();
  if (els?.userPrompt) els.userPrompt.value = chat.draft ?? snapshot?.draft ?? "";
  if (els?.useLocalAiToggle) els.useLocalAiToggle.checked = snapshot?.useLocalAi ?? !!state.settings.defaultAi;
  if (els?.useResearchToggle) els.useResearchToggle.checked = snapshot?.useResearch ?? !!state.settings.defaultResearch;
  if (els?.useReferenceToggle) els.useReferenceToggle.checked = snapshot?.useReferences !== false;
  if (els?.learningPull) els.learningPull.value = snapshot?.learningPull || "strong";
  if (shouldRender) renderAll();
}

function switchChat(chatId) {
  if (!state.chats.some((chat) => chat.id === chatId)) return;
  syncActiveChatWorkspace();
  activeChatId = chatId;
  restoreChatWorkspace(state.chats.find((chat) => chat.id === chatId), false);
  saveState();
}

function renderAll() {
  renderChats();
  renderSidebarSessions();
  renderMessages();
  renderLiked();
  renderReferences();
  renderProfiles();
  renderLoras();
  renderVersions();
  renderGallery();
  renderMemory();
  renderTrainingRules();
  renderBuilder();
  renderModelLibrary();
  els.negativeInput.value = state.settings.negativePrompt || defaultNegative;
  els.rulesInput.value = state.settings.rules || "";
  els.ollamaModelInput.value = state.settings.ollamaModel || "qwen2.5:7b";
  els.workflowTypeInput.value = state.settings.workflowType || "basic";
  if (els.themeSelect) els.themeSelect.value = state.settings.theme || "night-cyan";
  els.compactModeToggle.checked = !!state.settings.compactMode;
  els.reduceMotionToggle.checked = !!state.settings.reduceMotion;
  els.denseSidebarToggle.checked = !!state.settings.denseSidebar;
  if (els.sidebarCollapsedToggle) els.sidebarCollapsedToggle.checked = !!state.settings.sidebarCollapsed;
  if (els.enableNegativePromptToggle) els.enableNegativePromptToggle.checked = state.settings.enableNegativePrompt === true;
  if (els.useBreakToggle) els.useBreakToggle.checked = state.settings.useBreak !== false;
  if (els.defaultAiToggle) els.defaultAiToggle.checked = !!state.settings.defaultAi;
  if (els.defaultResearchToggle) els.defaultResearchToggle.checked = !!state.settings.defaultResearch;
  if (els.autoTrainingToggle) els.autoTrainingToggle.checked = !!state.settings.autoTraining;
  if (els.promptStrictnessInput) els.promptStrictnessInput.value = state.settings.promptStrictness || "balanced";
  if (els.ollamaEndpointInput) els.ollamaEndpointInput.value = state.settings.ollamaEndpoint || "http://127.0.0.1:11434";
  if (els.modelFolderInput) els.modelFolderInput.value = state.settings.modelFolder || "E:\\PromptBrain\\models";
  if (els.appFolderInput) els.appFolderInput.value = state.settings.appFolder || "E:\\PromptBrain";
  if (els.maxTrainingRulesInput) els.maxTrainingRulesInput.value = state.settings.maxTrainingRules || 12;
  if (els.minGalleryRatingInput) els.minGalleryRatingInput.value = state.settings.minGalleryRating || 4;
  if (els.learnFromChatsToggle) els.learnFromChatsToggle.checked = !!state.settings.learnFromChats;
  if (els.learnFromResearchToggle) els.learnFromResearchToggle.checked = !!state.settings.learnFromResearch;
  document.body.classList.toggle("compact-mode", !!state.settings.compactMode);
  document.body.classList.toggle("reduce-motion", !!state.settings.reduceMotion);
  document.body.classList.toggle("dense-sidebar", !!state.settings.denseSidebar);
  document.body.classList.toggle("sidebar-collapsed", !!state.settings.sidebarCollapsed);
  document.body.dataset.theme = state.settings.theme || "night-cyan";
  els.likedCount.textContent = state.liked.length;
  els.referenceCount.textContent = state.references.length;
  els.profileCount.textContent = state.profiles.length;
  els.loraCount.textContent = state.loras.length;
  renderEngineStatus();
  renderTasteProfile();
  renderAnalytics();
  renderCompareLab();
  renderWorkspaceRail();
  renderImageMemoryDetail();
  renderRealInsights();
}

function renderEngineStatus() {
  const conceptCount = engineReady() ? globalThis.PromptBrainEngine.ALL_CONCEPTS.length : 0;
  const recipeCount = engineReady() ? globalThis.PromptBrainEngine.ALL_ART_RECIPES.length : 0;
  const fingerprint = engineRuntime.fingerprint || state.engine?.fingerprint || "";
  if (els.brainStats) {
    els.brainStats.textContent = engineReady()
      ? `Offline engine ready / ${conceptCount.toLocaleString()} concepts / ${recipeCount.toLocaleString()} recipes`
      : engineRuntime.error || "Loading offline engine...";
  }
  if (els.engineCatalogStatus) {
    els.engineCatalogStatus.textContent = engineReady()
      ? `${conceptCount.toLocaleString()} concepts / ${catalogLoraKb.length} installed LoRAs / ${fingerprint.slice(0, 12)}`
      : engineRuntime.error || "Loading...";
  }
  if (els.memoryPathStatus) {
    els.memoryPathStatus.textContent = state.engine?.statePath || (state.engine?.dataRoot ? `${state.engine.dataRoot}\\promptbrain-state.json` : "Portable data folder");
  }
}

function renderBuilder() {
  if (!els.checkpointSelect) return;
  if (els.userPrompt && document.activeElement !== els.userPrompt) {
    els.userPrompt.value = activeChat().draft ?? state.builder.draft ?? "";
  }
  const checkpoints = CHECKPOINT_ORDER.map((id) => CHECKPOINT_RULES[id]).filter(Boolean);
  els.checkpointSelect.innerHTML = checkpoints.map((rule) => `<option value="${rule.id}">${escapeHtml(rule.name)} - ${rule.base}</option>`).join("");
  els.checkpointSelect.value = state.builder.checkpointId;
  els.vibeSelect.innerHTML = VIBES.map((vibe) => `<option value="${escapeAttr(vibe)}">${escapeHtml(vibe)}</option>`).join("");
  els.vibeSelect.value = state.builder.vibe;
  els.contentModeSelect.value = state.builder.contentMode;
  els.characterModeSelect.value = state.builder.characterMode;
  if (els.animeSeriesSelect) {
    els.animeSeriesSelect.innerHTML = animeSeriesNames().map((series) => `<option value="${escapeAttr(series)}">${escapeHtml(series)}</option>`).join("");
    els.animeSeriesSelect.value = state.builder.animeSeries || "All Anime";
  }
  els.characterSearch.value = state.builder.characterMode === "manual"
    ? state.builder.character || ""
    : state.builder.characterQuery || "";

  renderCharacterList();
  renderLoraPicker();
  renderCategoryGrid();
  renderLivePrompt();
}

function renderCharacterList() {
  if (!els.characterList) return;
  const mode = state.builder.characterMode;
  if (mode === "manual") {
    els.characterList.disabled = true;
    els.characterList.innerHTML = `<option value="">Manual subject is used exactly as typed</option>`;
    return;
  }
  els.characterList.disabled = false;
  const allCharacters = charactersForMode(mode);
  const list = state.builder.contentMode === "adult"
    ? allCharacters.filter((item) => adultCharacterSet().has(item))
    : allCharacters;
  const query = (state.builder.characterQuery || "").toLowerCase();
  const filtered = list.filter((item) => !query || item.toLowerCase().includes(query));
  const emptyLabel = state.builder.contentMode === "adult"
    ? "No eligible adult character matches. Manual adult OCs remain available."
    : "No character matches this search.";
  els.characterList.innerHTML = filtered.length
    ? [
        `<option value="">No named character selected</option>`,
        ...filtered.map((item) => `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`)
      ].join("")
    : `<option value="">${escapeHtml(emptyLabel)}</option>`;
  els.characterList.value = filtered.includes(state.builder.character) ? state.builder.character : "";
}

function renderLoraPicker() {
  if (!els.loraPicker) return;
  const rule = activeCheckpointRule();
  const loras = compatibleLoras(rule);
  const tokens = compatibleStyleTokens(rule);
  if (els.styleTokenPicker) {
    els.styleTokenPicker.innerHTML = tokens.map((token) => `
      <button class="chip style-token-chip ${state.builder.selectedStyleTokens.includes(token.id) ? "is-selected" : ""}" data-style-token="${escapeAttr(token.id)}" title="${escapeAttr(token.description)}">
        ${escapeHtml(token.label)}
      </button>`).join("") || `<span class="empty-state">No style tokens for this checkpoint.</span>`;
  }
  if (els.loraPickerCount) {
    els.loraPickerCount.textContent = `${loras.length} available`;
  }
  els.loraPicker.innerHTML = loras.map((lora) => `
    <button class="chip lora-chip ${state.builder.selectedLoras.includes(lora.name) ? "is-selected" : ""}" data-lora="${escapeAttr(lora.name)}">
      ${escapeHtml(lora.label)} <span>${escapeHtml(lora.category)}</span>
    </button>`).join("") || `<span class="empty-state">No compatible LoRAs for this checkpoint.</span>`;
  els.selectedLoras.innerHTML = selectedLoraObjects().map((lora) => {
    const weight = loraWeight(lora);
    return `<article class="selected-lora-card">
      <div>
        <strong>${escapeHtml(lora.label)}</strong>
        <code>${escapeHtml(loraCommand(lora, weight))}</code>
        <span>${escapeHtml(lora.description)}</span>
      </div>
      <label><b>${weight.toFixed(2)}</b><input type="range" min="${lora.minWeight}" max="${lora.maxWeight}" step="0.05" value="${weight}" data-lora-weight="${escapeAttr(lora.name)}" /></label>
    </article>`;
  }).join("") || `<p class="empty-state">Pick compatible LoRAs to tune their weights here.</p>`;
}

function renderCategoryGrid() {
  if (!els.builderCategoryGrid) return;
  const visibleCategories = BUILDER_CATEGORIES.filter((category) =>
    category !== "Negative" || state.settings.enableNegativePrompt === true);
  els.builderCategoryGrid.innerHTML = visibleCategories.map((category) => {
    const pool = tagPoolFor(category);
    const query = (state.builder.categorySearches[category] || "").toLowerCase();
    const maxTags = state.builder.vibe === "Free" ? 120 : 56;
    const sorted = sortTagsByMemory(pool)
      .filter((tag) => !query || tag.toLowerCase().includes(query))
      .slice(0, maxTags);
    return `
      <section class="panel category-panel">
        <div class="section-title-row">
          <h2>${escapeHtml(category)}</h2>
          <button class="text-btn" data-clear-category="${escapeAttr(category)}">Clear</button>
        </div>
        <input class="category-search" data-category-search="${escapeAttr(category)}" value="${escapeAttr(state.builder.categorySearches[category] || "")}" placeholder="Search ${escapeAttr(category.toLowerCase())} tags" />
        <div class="pill-grid">
          ${sorted.length ? sorted.map((tag) => tagChipMarkup(category, tag)).join("") : `<span class="empty-state">No matches. Try another search.</span>`}
        </div>
      </section>`;
  }).join("");
}

function tagChipMarkup(category, tag) {
  const selected = (state.builder.selectedTags[category] || []).includes(tag);
  const weight = state.builder.tagWeights[`${category}:${tag}`] ?? 0;
  const count = state.usageStats.tagScores[tag] || 0;
  return `
    <button class="tag-chip ${selected ? "is-selected" : ""}" data-category="${escapeAttr(category)}" data-tag="${escapeAttr(tag)}">
      <span>${escapeHtml(tag)}</span>
      ${selected && activeCheckpointRule().weightSyntax !== "none" ? `<b data-weight-chip="${escapeAttr(category)}:${escapeAttr(tag)}">${weightLabel(weight)}</b>` : ""}
      ${count ? `<i>${count}</i>` : ""}
    </button>`;
}

function renderLivePrompt() {
  if (els.negativePromptPanel) els.negativePromptPanel.hidden = state.settings.enableNegativePrompt !== true;
  if (els.customNegativeInput && els.customNegativeInput.value !== state.builder.customNegative) {
    els.customNegativeInput.value = state.builder.customNegative || "";
  }
  if (!engineReady()) {
    if (els.positivePromptOutput) {
      els.positivePromptOutput.textContent = engineRuntime.error
        ? `Offline engine unavailable: ${engineRuntime.error}`
        : "Loading the offline prompt catalog...";
    }
    if (els.negativePromptOutput) els.negativePromptOutput.textContent = "";
    return;
  }

  const input = els.userPrompt?.value?.trim() || "";
  const hasDirection = !!(
    input ||
    selectedBuilderTags().some((item) => item.category !== "Negative") ||
    state.builder.character ||
    selectedStyleTokenObjects().length ||
    selectedLoraObjects().length
  );

  try {
    const pack = hasDirection
      ? buildPromptPackEngine(input, { seed: stablePreviewSeed(input), preview: true })
      : emptyBuilderPreview();
    if (els.positivePromptOutput) els.positivePromptOutput.textContent = pack.positive || "Describe an image or choose a tag.";
    if (els.negativePromptOutput) els.negativePromptOutput.textContent = pack.negative || "";
  } catch (error) {
    console.error("Live prompt preview failed", error);
    if (els.positivePromptOutput) els.positivePromptOutput.textContent = `Preview error: ${error.message || error}`;
  }
}

function stablePreviewSeed(input) {
  const engine = globalThis.PromptBrainEngine;
  return engine?.hashString?.(JSON.stringify({
    input,
    checkpointId: state.builder.checkpointId,
    vibe: state.builder.vibe,
    contentMode: state.builder.contentMode,
    character: state.builder.character,
    selectedTags: state.builder.selectedTags,
    selectedLoras: state.builder.selectedLoras,
    selectedStyleTokens: state.builder.selectedStyleTokens
  })) || 1;
}

function emptyBuilderPreview() {
  const rule = activeCheckpointRule();
  const styleTokens = selectedStyleTokenObjects().map((token) => token.prompt);
  const loras = selectedLoraObjects().map((lora) => loraCommand(lora));
  const positive = rule.promptStyle === "natural_language"
    ? "Describe the scene to build a FLUX prompt."
    : unique([...qualityPrefixForRule(rule), ...styleTokens, ...loras]).join(rule.separator || ", ");
  return { positive, negative: "" };
}

function renderModelLibrary() {
  if (els.checkpointLibrary) {
    els.checkpointLibrary.innerHTML = CHECKPOINT_ORDER.map((id) => CHECKPOINT_RULES[id]).filter(Boolean).map((rule) => `
      <button class="checkpoint-card ${state.builder.checkpointId === rule.id ? "is-selected" : ""}" data-checkpoint-card="${rule.id}">
        <strong>${escapeHtml(rule.name)}</strong>
        <span>${escapeHtml(rule.base)} / ${escapeHtml(rule.type)} / ${escapeHtml(rule.promptStyle)}</span>
      </button>`).join("");
  }
  if (els.modelRuleDetails) {
    const rule = activeCheckpointRule();
    els.modelRuleDetails.innerHTML = `
      <div class="knowledge-grid">
        <span>Quality prefix</span><strong>${escapeHtml(qualityPrefixForRule(rule).join(rule.separator) || "none")}</strong>
        <span>Quality suffix</span><strong>${escapeHtml(rule.qualitySuffix.join(rule.separator) || "none")}</strong>
        <span>Negative base</span><strong>${escapeHtml(rule.negativeBase.join(rule.separator) || "none")}</strong>
        <span>Tips</span><strong>${escapeHtml(rule.tips)}</strong>
      </div>`;
  }
  if (els.loraLibrary) {
    const loras = compatibleLoras(activeCheckpointRule());
    els.loraLibrary.innerHTML = loras.map((lora) => `
      <article class="lora-card ${state.builder.selectedLoras.includes(lora.name) ? "is-selected" : ""}" data-lora="${escapeAttr(lora.name)}">
        <strong>${escapeHtml(lora.label)}</strong>
        <code>${escapeHtml(loraCommand(lora, lora.recommendedWeight))}</code>
        <span>${escapeHtml(lora.category)} / ${lora.recommendedWeight}</span>
        <p>${escapeHtml(lora.description)}</p>
      </article>`).join("");
  }
  if (els.modelSelectedLoras) {
    els.modelSelectedLoras.innerHTML = els.selectedLoras?.innerHTML || `<p class="empty-state">Pick compatible LoRAs in Workspace or here.</p>`;
  }
  if (els.styleTokenLibrary) {
    const tokens = compatibleStyleTokens(activeCheckpointRule());
    els.styleTokenLibrary.innerHTML = tokens.map((token) => `
      <button class="style-token-card ${state.builder.selectedStyleTokens.includes(token.id) ? "is-selected" : ""}" data-style-token="${escapeAttr(token.id)}">
        <strong>${escapeHtml(token.label)}</strong>
        <code>prompt: ${escapeHtml(token.prompt)}</code>
        <span>${escapeHtml(token.description)}</span>
      </button>`).join("") || `<p class="empty-state">No prompt-only style tokens for this checkpoint.</p>`;
  }
}

function activeCheckpointRule() {
  return CHECKPOINT_RULES[state.builder.checkpointId] || CHECKPOINT_RULES.waiIllustriousXL;
}

function buildCatalogLoraKnowledge(catalog) {
  return (catalog?.concepts || [])
    .filter((concept) => concept.kind === "lora" && concept.traits?.includes("installed"))
    .map((concept) => {
      const source = concept.provenance?.sourceValues || {};
      const trigger = String(concept.promptForms?.default || "");
      const recommendedWeight = Number(source.recommendedWeight ?? trigger.match(/:([0-9.]+)>$/)?.[1] ?? 0.7);
      const compatibility = concept.compatibility || {};
      return {
        id: concept.id,
        name: concept.id,
        label: concept.label || source.outputName || source.filename || concept.id,
        category: String(concept.group || "lora").replace(/^lora\./, ""),
        trigger,
        recommendedWeight,
        minWeight: Number(source.minWeight ?? 0.1),
        maxWeight: Number(source.maxWeight ?? 1),
        description: [source.filename, source.trigger ? `trigger: ${source.trigger}` : ""].filter(Boolean).join(" / "),
        compatibleBases: [...(compatibility.bases || [])],
        checkpointIds: [...(compatibility.checkpointIds || [])],
        mapped: !!((compatibility.bases || []).length || (compatibility.checkpointIds || []).length),
        concept
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

function compatibleLoras(rule) {
  const seen = new Set();
  return catalogLoraKb
    .filter((lora) => lora.mapped && (lora.checkpointIds.includes(rule.id) || lora.compatibleBases.includes(rule.base)))
    .filter((lora) => {
      if (seen.has(lora.name)) return false;
      seen.add(lora.name);
      return true;
    });
}

function compatibleStyleTokens(rule) {
  return STYLE_TOKEN_KB.filter((token) => token.compatibleBases.includes(rule.base) && token.compatibleTypes.includes(rule.type));
}

function selectedLoraObjects() {
  const rule = activeCheckpointRule();
  const compatible = compatibleLoras(rule);
  return state.builder.selectedLoras
    .map((name) => compatible.find((lora) => lora.name === name))
    .filter(Boolean);
}

function selectedStyleTokenObjects() {
  const compatible = compatibleStyleTokens(activeCheckpointRule());
  return state.builder.selectedStyleTokens
    .map((id) => compatible.find((token) => token.id === id))
    .filter(Boolean);
}

function loraWeight(lora) {
  return Number(state.builder.loraWeights?.[lora.name] ?? lora.recommendedWeight ?? 0.7);
}

function loraCommand(lora, weight = loraWeight(lora)) {
  const match = String(lora.trigger || "").match(/^<lora:([^:>]+):/i);
  const file = match?.[1] || lora.label;
  return `<lora:${file}:${Number(weight).toFixed(2)}>`;
}

function tagPoolFor(category) {
  const base = CATEGORY_BASE[category] || [];
  const vibePool = VIBE_CATEGORY_TAGS[state.builder.vibe]?.[category] || [];
  const adultPool = ADULT_TAGS[category] || [];
  const adultVibePool = ADULT_VIBE_TAGS[state.builder.vibe]?.[category] || [];
  const vibe = state.builder.vibe || "Free";
  const isAdult = state.builder.contentMode === "adult";
  const foundation = categoryFoundationTags(category);

  if (isAdult) {
    if (vibe === "Free") {
      const freePool = unique([...adultPool, ...allVibeTagsFor(category), ...foundation]);
      return category === "Negative" ? freePool : adultCompatibleTags(freePool);
    }
    const canBlendVibe = ["Style", "Hair", "Environment", "Lighting", "Camera/Composition", "Color Palette", "Quality", "Negative"].includes(category);
    const adultFocused = unique([...adultVibePool, ...adultPool, ...(canBlendVibe ? vibePool : []), ...foundation]);
    return category === "Negative" ? adultFocused : adultCompatibleTags(adultFocused);
  }

  if (vibe === "Free") {
    return unique([...base, ...allVibeTagsFor(category)]);
  }

  return unique([...vibePool, ...foundation]);
}

function categoryFoundationTags(category) {
  if (category === "Quality") return CATEGORY_BASE[category].slice(0, 18);
  if (category === "Negative") return CATEGORY_BASE[category];
  if (category === "Style") return CATEGORY_BASE[category].slice(0, 12);
  if (category === "Camera/Composition") return CATEGORY_BASE[category].slice(0, 12);
  if (category === "Lighting") return CATEGORY_BASE[category].slice(0, 10);
  if (category === "Color Palette") return CATEGORY_BASE[category].slice(0, 10);
  return [];
}

function adultCompatibleTags(tags) {
  return tags.filter((tag) => !/(minor|underage|child|childlike|loli|shota|teen|schoolgirl|school uniform)/i.test(tag));
}

function allVibeTagsFor(category) {
  return unique(Object.values(VIBE_CATEGORY_TAGS).flatMap((pool) => pool?.[category] || []));
}

function sortTagsByMemory(tags) {
  const order = new Map(tags.map((tag, index) => [tag, index]));
  return tags.slice().sort((a, b) => {
    const scoreDiff = (state.usageStats.tagScores[b] || 0) - (state.usageStats.tagScores[a] || 0);
    return scoreDiff || (order.get(a) ?? 0) - (order.get(b) ?? 0);
  });
}

function weightLabel(index) {
  const weight = WEIGHT_STEPS[index] ?? 1;
  return weight === 1 ? "1.0" : String(weight);
}

function formatTagForCheckpoint(tag, category) {
  const rule = activeCheckpointRule();
  if (rule.weightSyntax === "none" || category === "Negative") return tag;
  const index = state.builder.tagWeights[`${category}:${tag}`] ?? 0;
  const weight = WEIGHT_STEPS[index] ?? 1;
  return weight === 1 ? tag : `(${tag}:${weight})`;
}

function selectedBuilderTags() {
  return BUILDER_CATEGORIES.flatMap((category) => (state.builder.selectedTags[category] || []).map((tag) => ({ category, tag })));
}

function purgeBadDefaultSelections() {
  if (!state.builder?.selectedTags) return;
  Object.keys(state.builder.selectedTags).forEach((category) => {
    state.builder.selectedTags[category] = (state.builder.selectedTags[category] || []).filter((tag) => !BAD_DEFAULT_SELECTED_TAGS.has(String(tag).toLowerCase()));
  });
  Object.keys(state.builder.tagWeights || {}).forEach((key) => {
    const tag = key.split(":").slice(1).join(":").toLowerCase();
    if (BAD_DEFAULT_SELECTED_TAGS.has(tag)) delete state.builder.tagWeights[key];
  });
}

function inferIntentTags(input) {
  const text = String(input || "").toLowerCase();
  const tags = [];
  const add = (category, values) => values.forEach((tag) => tags.push({ category, tag }));
  const has = (...words) => words.some((word) => intentContains(text, word));

  if (!text.trim()) return tags;

  if (has("nsfw", "sex", "fuck", "fucking", "nude", "naked", "uncensored", "pussy", "penis", "cock", "cum", "creampie", "anal", "oral", "blowjob", "fellatio", "cunnilingus", "tentacle")) {
    add("Style", ["hentai", "doujinshi style"]);
  }
  if (has("spooning")) add("Act", ["spooning", "sex"]), add("Pose", ["spooning position", "side lying pose"]), add("Interaction", ["partner behind"]);
  if (has("doggy", "doggystyle")) add("Act", ["doggystyle", "deep penetration"]), add("Pose", ["doggystyle position", "on all fours", "ass up"]);
  if (has("cowgirl")) add("Act", ["cowgirl", "riding penis"]), add("Pose", ["cowgirl position", "straddling pose"]);
  if (has("missionary")) add("Act", ["missionary", "deep penetration"]), add("Pose", ["missionary position", "lying on back"]);
  if (has("anal", "asshole")) add("Act", ["anal sex", "penis in ass", "gaping asshole"]);
  if (has("oral", "blowjob", "fellatio")) add("Act", ["oral sex", "fellatio", "deepthroat"]);
  if (has("cunnilingus", "pussy licking")) add("Act", ["cunnilingus", "pussy licking"]);
  if (has("creampie")) add("Act", ["creampie", "cum inside", "cum dripping"]);
  if (has("tentacle")) add("Act", ["tentacles", "tentacle sex", "tentacle penetration", "tentacles around body"]);
  if (has("monster")) add("Act", ["monster sex", "monster partner"]), add("Character", ["monster girl"]);
  if (has("beastman", "werewolf")) add("Act", ["beastman partner", "werewolf humanoid partner"]);
  if (has("dragon girl", "dragon woman", "dragon horns", "dragon tail", "dragon wings", "draconic")) add("Character", ["dragon girl", "dragon horns", "dragon tail", "dragon wings"]);
  if (has("oni")) add("Character", ["oni girl", "oni horns", "one oni horn"]);
  if (has("succubus")) add("Character", ["succubus", "succubus wings", "succubus tail"]), add("Environment", ["succubus room"]);
  if (has("elf")) add("Character", ["elf woman", "pointed elf ears", "long elf ears"]);
  if (has("catgirl", "cat girl")) add("Character", ["catgirl", "cat ears", "cat tail"]);
  if (has("foxgirl", "fox girl")) add("Character", ["fox girl", "fox ears", "fox tail"]);

  if (has("small breasts")) add("Character", ["small breasts"]);
  if (has("medium breasts")) add("Character", ["medium breasts"]);
  if (has("large breasts", "big breasts")) add("Character", ["large breasts", "big breasts"]);
  if (has("huge breasts")) add("Character", ["huge breasts"]);
  if (has("perky nipples")) add("Character", ["perky nipples"]);
  if (has("puffy nipples")) add("Character", ["puffy nipples"]);
  if (has("slim waist")) add("Character", ["slim waist"]);
  if (has("curvy")) add("Character", ["curvy body", "wide hips"]);
  if (has("thick thighs")) add("Character", ["thick thighs"]);

  if (has("bed")) add("Environment", ["bed", "bedroom", "messy bed"]);
  if (has("gothic")) add("Environment", ["gothic room", "gothic bedroom"]), add("Style", ["gothic anime art"]);
  if (has("shower")) add("Environment", ["shower", "bathroom"]);
  if (has("forest")) add("Environment", ["forest", "enchanted forest"]);
  if (has("castle")) add("Environment", ["castle bedroom", "throne room"]);
  if (has("dungeon")) add("Environment", ["dungeon", "ritual chamber"]);
  if (has("candle")) add("Lighting", ["candlelight", "warm lamp light"]);
  if (has("moon")) add("Lighting", ["moonlight", "low-key lighting"]);
  if (has("neon")) add("Lighting", ["neon light", "pink neon light", "blue neon light"]);

  if (has("low angle", "from below")) add("Camera/Composition", ["low angle", "from below"]);
  if (has("high angle", "from above")) add("Camera/Composition", ["high angle", "from above"]);
  if (has("pov")) add("Camera/Composition", ["pov", "first person view"]);
  if (has("close up", "close-up")) add("Camera/Composition", ["close-up"]);
  if (has("zoom")) add("Camera/Composition", ["zoomed in"]);
  if (has("tilt", "tilted")) add("Camera/Composition", ["tilted angle", "dutch angle"]);
  if (has("screencap")) add("Camera/Composition", ["anime screencap framing"]), add("Style", ["anime screencap"]);

  if (has("angry")) add("Expression", ["angry eyes", "angry stare", "clenched teeth"]);
  if (has("blush")) add("Expression", ["blush", "flushed face"]);
  if (has("tears", "crying")) add("Expression", ["tears", "teary eyes"]);
  if (has("ahegao")) add("Expression", ["ahegao", "rolling eyes", "tongue out"]);
  if (has("saliva", "drool")) add("Expression", ["saliva", "drooling"]);

  if (has("maid")) add("Clothing", ["maid outfit", "maid dress"]);
  if (has("lingerie")) add("Clothing", ["lingerie", "lace lingerie"]);
  if (has("stockings")) add("Clothing", ["stockings", "thighhighs"]);
  if (has("jeans")) add("Clothing", ["jeans", "skinny jeans"]);
  if (has("dress")) add("Clothing", ["dress"]);
  if (has("nude", "naked")) add("Clothing", ["nude", "completely nude"]);

  return unique(tags.map((item) => `${item.category}:::${item.tag}`))
    .map((packed) => {
      const [category, tag] = packed.split(":::");
      return { category, tag };
    });
}

const INTENT_RULES = [
  { id: "adult-scene", patterns: ["hentai", "nsfw", "sex", "fuck", "fucking", "fucked", "get fucked", "getting fucked", "being fucked", "nude", "naked", "uncensored", "pussy", "penis", "cock", "cum", "creampie", "anal", "oral", "blowjob", "fellatio", "cunnilingus", "tentacle"], priority: 5, tags: { "Style": ["hentai", "doujinshi style"] } },
  { id: "solo-female", patterns: ["solo", "alone", "1girl only"], priority: 20, tags: { "Character": ["1girl", "solo"] }, remove: ["1boy", "hetero", "faceless male", "boy on top", "male focus"] },
  { id: "male-partner", patterns: ["1boy", "male partner", "man with woman", "boy with girl"], priority: 18, tags: { "Character": ["1boy"], "Interaction": ["hetero"] } },
  { id: "faceless-partner", patterns: ["faceless", "faceless male", "bald"], priority: 19, tags: { "Interaction": ["faceless male"] } },
  { id: "spooning", patterns: ["spooning", "from behind on side"], priority: 60, tags: { "Act": ["spooning", "fucking", "deep penetration"], "Pose": ["spooning position", "side lying pose", "lying on side pose"], "Interaction": ["partner behind"], "Camera/Composition": ["side view", "close-up"] }, remove: ["standing sex", "cowgirl", "missionary", "on all fours"] },
  { id: "doggystyle", patterns: ["doggy", "doggystyle", "from behind", "ass up"], priority: 61, tags: { "Act": ["doggystyle", "fucked deep", "deep penetration"], "Pose": ["doggystyle position", "on all fours", "ass up", "hips raised"], "Interaction": ["partner behind"], "Camera/Composition": ["back view", "low angle"] }, remove: ["missionary", "cowgirl position", "spooning position"] },
  { id: "cowgirl", patterns: ["cowgirl", "girl on top", "riding"], priority: 61, tags: { "Act": ["cowgirl", "riding penis", "deep penetration"], "Pose": ["cowgirl position", "straddling pose"], "Interaction": ["girl on top"], "Camera/Composition": ["low angle", "front view"] }, remove: ["doggystyle position", "missionary position"] },
  { id: "reverse-cowgirl", patterns: ["reverse cowgirl"], priority: 62, tags: { "Act": ["reverse cowgirl", "riding penis"], "Pose": ["reverse cowgirl position", "straddling pose"], "Camera/Composition": ["back view", "ass close-up"] } },
  { id: "missionary", patterns: ["missionary"], priority: 60, tags: { "Act": ["missionary", "fucked deep"], "Pose": ["missionary position", "lying on back", "legs spread"], "Interaction": ["boy on top"], "Camera/Composition": ["from above", "pov"] }, remove: ["doggystyle position", "cowgirl position"] },
  { id: "mating-press", patterns: ["mating press", "folded"], priority: 64, tags: { "Act": ["mating press", "deep penetration", "balls deep"], "Pose": ["mating press", "knees to chest", "legs lifted"], "Camera/Composition": ["from above", "close-up"] } },
  { id: "anal", patterns: ["anal", "asshole", "ass fuck", "fucked in the ass"], priority: 65, tags: { "Act": ["anal sex", "penis in ass", "gaping asshole", "stretched asshole"], "Pose": ["bent over", "ass up"], "Camera/Composition": ["ass close-up"] } },
  { id: "oral-female", patterns: ["blowjob", "fellatio", "sucking cock", "deepthroat"], priority: 63, tags: { "Act": ["fellatio", "oral sex", "deepthroat"], "Pose": ["kneeling pose"], "Camera/Composition": ["pov", "face close-up"] } },
  { id: "oral-male", patterns: ["cunnilingus", "eating her out", "pussy licking"], priority: 63, tags: { "Act": ["cunnilingus", "pussy licking"], "Pose": ["legs spread", "lying on back"], "Camera/Composition": ["pussy close-up"] } },
  { id: "creampie", patterns: ["creampie", "cum inside", "inside her"], priority: 70, tags: { "Act": ["creampie", "cum inside", "cum dripping"] } },
  { id: "rough", patterns: ["rough", "hard", "aggressive", "angry sex"], priority: 45, tags: { "Act": ["rough sex", "fucked deep"], "Expression": ["angry eyes", "clenched teeth", "sweat"], "Camera/Composition": ["dynamic angle"] } },
  { id: "gentle", patterns: ["gentle sex", "romantic sex", "soft sex"], priority: 35, tags: { "Act": ["gentle sex"], "Expression": ["soft smile", "blush"], "Lighting": ["soft lighting", "warm lamp light"] }, remove: ["rough sex", "angry eyes"] },
  { id: "tentacles", patterns: ["tentacle", "tentacles"], priority: 75, tags: { "Act": ["tentacles", "tentacle sex", "tentacle penetration", "tentacles around body", "tentacles spreading legs"], "Environment": ["tentacle cave", "monster lair"], "Interaction": ["tentacle monster"] } },
  { id: "monster", patterns: ["monster", "beast", "beastman", "werewolf", "minotaur", "orc"], priority: 72, tags: { "Act": ["monster sex", "monster partner", "fantasy monster partner"], "Interaction": ["monster partner", "size difference"] } },
  { id: "succubus", patterns: ["succubus"], priority: 40, tags: { "Character": ["succubus", "succubus wings", "succubus tail", "demon horns"], "Environment": ["succubus room"], "Style": ["succubus style"] } },
  { id: "oni", patterns: ["oni"], priority: 40, tags: { "Character": ["oni girl", "oni horns", "one oni horn"] } },
  { id: "elf", patterns: ["elf"], priority: 40, tags: { "Character": ["elf woman", "pointed elf ears", "long elf ears"] } },
  { id: "breast-focus", patterns: ["breasts", "boobs", "tits", "nipples", "puffy nipples", "perky nipples"], priority: 30, tags: { "Camera/Composition": ["chest close-up"], "Character": ["breasts", "nipples"] } },
  { id: "pussy-focus", patterns: ["pussy", "vagina", "clit", "labia"], priority: 32, tags: { "Camera/Composition": ["pussy close-up"], "Act": ["pussy", "wet pussy", "visible clit"] } },
  { id: "penis-focus", patterns: ["penis", "cock", "huge penis", "large penis", "big cock", "testicles", "balls"], priority: 32, tags: { "Character": ["huge penis", "testicles"] } },
  { id: "ass-focus", patterns: ["ass", "butt"], priority: 32, tags: { "Camera/Composition": ["ass close-up"], "Pose": ["ass up"] } },
  { id: "low-angle", patterns: ["low angle", "from below", "worm", "worm eye", "worm-eye", "worm's-eye", "worm eye perspective", "worm's-eye perspective"], priority: 25, tags: { "Camera/Composition": ["low angle", "from below", "worm's-eye view"] } },
  { id: "high-angle", patterns: ["high angle", "from above", "bird", "bird eye", "bird-eye", "bird's-eye", "bird eye perspective", "bird's-eye perspective"], priority: 25, tags: { "Camera/Composition": ["high angle", "from above", "bird's-eye view"] } },
  { id: "pov", patterns: ["pov", "first person"], priority: 26, tags: { "Camera/Composition": ["pov", "first person view"] } },
  { id: "tilt", patterns: ["tilt", "tilted", "dutch"], priority: 20, tags: { "Camera/Composition": ["tilted angle", "dutch angle"] } },
  { id: "gothic-room", patterns: ["gothic room", "gothic"], priority: 20, tags: { "Environment": ["gothic room", "gothic bedroom"], "Lighting": ["candlelight", "low-key lighting"] } },
  { id: "bedroom", patterns: ["bed", "bedroom"], priority: 18, tags: { "Environment": ["bed", "bedroom", "messy bed"] } },
  { id: "cave", patterns: ["cave", "monster cave", "cavern"], priority: 18, tags: { "Environment": ["cave", "rocky cave interior"], "Lighting": ["dramatic shadows"] } },
  { id: "ancient-temple", patterns: ["ancient temple", "temple", "ruins"], priority: 18, tags: { "Environment": ["ancient temple", "stone ruins"], "Lighting": ["moonlight"] } },
  { id: "moonlight", patterns: ["moonlight", "moonlit"], priority: 18, tags: { "Lighting": ["moonlight", "cool rim light"] } },
  { id: "shower", patterns: ["shower", "bath"], priority: 18, tags: { "Environment": ["shower", "bathroom"], "Lighting": ["wet skin highlights"] } },
  { id: "angry-expression", patterns: ["angry", "mad"], priority: 24, tags: { "Expression": ["angry eyes", "clenched teeth"] } },
  { id: "ahegao-expression", patterns: ["ahegao"], priority: 24, tags: { "Expression": ["ahegao", "rolling eyes", "tongue out", "drooling"] } },
  { id: "crying-expression", patterns: ["tears", "crying", "teary"], priority: 22, tags: { "Expression": ["tears", "teary eyes", "watery eyes"] } },
  { id: "blush-expression", patterns: ["blush", "blushing"], priority: 22, tags: { "Expression": ["blush", "flushed face"] } }
];

INTENT_RULES.push(...[
  { id: "dragon-trait", patterns: ["dragon girl", "dragon woman", "dragon horns", "dragon tail", "dragon wings", "draconic girl", "draconic woman"], priority: 42, tags: { "Character": ["dragon girl", "dragon horns", "dragon tail", "dragon wings"], "Style": ["fantasy anime art"] } },
  { id: "demon-trait", patterns: ["demon girl", "demon woman", "demon horns", "demon tail"], priority: 41, tags: { "Character": ["demon girl", "demon horns", "demon tail"], "Style": ["dark fantasy anime art"] } },
  { id: "angel-trait", patterns: ["angel girl", "angel woman", "angel wings", "halo"], priority: 41, tags: { "Character": ["angel girl", "angel wings", "halo"], "Lighting": ["holy light", "soft rim light"] } },
  { id: "ice-elf-action", patterns: ["ice elf", "frozen battlefield", "crystal spear", "blizzard"], priority: 50, tags: { "Character": ["ice elf woman", "pointed elf ears", "long icy blue hair", "blue eyes"], "Clothing": ["white and pale blue fitted battle outfit", "fur-trimmed shoulders", "thigh-high boots"], "Environment": ["frozen battlefield", "snow particles", "blizzard atmosphere"], "Lighting": ["blue-white energy", "dramatic lighting"], "Style": ["premium illustration"] } },
  { id: "battle-charge", patterns: ["charging", "charge forward", "running attack", "combat stance"], priority: 48, tags: { "Act": ["charging forward", "attacking with a weapon"], "Pose": ["low forward-leaning combat stance", "one foot forward", "cape whipping"], "Camera/Composition": ["very dynamic composition", "motion blur", "dramatic foreshortening"] } },
  { id: "spear-combat", patterns: ["spear", "crystal spear", "lance", "polearm"], priority: 44, tags: { "Act": ["holding a long spear", "spear attack"], "Pose": ["two hands on weapon"], "Camera/Composition": ["weapon foreground"] } },
  { id: "sword-combat", patterns: ["sword", "katana", "blade"], priority: 44, tags: { "Act": ["attacking with a sword", "swinging a blade"], "Pose": ["wide combat stance"], "Camera/Composition": ["weapon foreground"] } },
  { id: "portrait-clean", patterns: ["portrait", "bust shot", "face focus"], priority: 36, tags: { "Camera/Composition": ["portrait close-up", "face close-up", "centered composition"], "Lighting": ["soft studio lighting"], "Style": ["clean polished anime shading"] }, remove: ["full body pose", "wide shot"] },
  { id: "full-body", patterns: ["full body", "standing full body", "head to toe"], priority: 35, tags: { "Camera/Composition": ["full body shot", "centered composition"], "Pose": ["standing pose"] }, remove: ["close-up", "face close-up", "chest close-up"] },
  { id: "cute-tone", patterns: ["cute", "kawaii", "adorable", "sweet"], priority: 30, tags: { "Style": ["kawaii", "cute anime style"], "Expression": ["soft smile", "bright eyes"], "Lighting": ["soft ambient light"] }, remove: ["angry eyes", "rough sex"] },
  { id: "cute-pose", patterns: ["cute pose", "adorable pose", "kawaii pose"], priority: 31, tags: { "Pose": ["cute pose", "soft cute pose"], "Expression": ["soft smile", "bright eyes"] } },
  { id: "badass-tone", patterns: ["badass", "cool", "intimidating"], priority: 30, tags: { "Style": ["badass anime style"], "Expression": ["confident smirk", "sharp eyes"], "Lighting": ["strong rim light"], "Camera/Composition": ["low angle"] } },
  { id: "dark-moody-tone", patterns: ["dark", "moody", "grim", "gloomy"], priority: 29, tags: { "Style": ["dark moody anime style"], "Lighting": ["low-key lighting", "dramatic shadows"], "Color Palette": ["dark palette"] } },
  { id: "soft-bedroom", patterns: ["soft bedroom", "cozy bedroom", "warm bedroom"], priority: 27, tags: { "Environment": ["bedroom", "soft sheets", "warm interior"], "Lighting": ["warm lamp light", "soft ambient light"] } },
  { id: "city-night", patterns: ["city night", "cyberpunk city", "neon street", "rainy street"], priority: 27, tags: { "Environment": ["cyberpunk city", "rain-soaked alley", "neon signs"], "Lighting": ["neon light", "reflected light"], "Color Palette": ["blue and magenta"] } },
  { id: "from-behind-view", patterns: ["from behind", "back view", "rear view"], priority: 34, tags: { "Camera/Composition": ["back view"], "Pose": ["looking back over shoulder"] } },
  { id: "looking-at-viewer", patterns: ["looking at viewer", "eye contact"], priority: 28, tags: { "Expression": ["looking at viewer", "intense eye contact"] } },
  { id: "embarrassed", patterns: ["embarrassed", "shy", "flustered"], priority: 28, tags: { "Expression": ["embarrassed blush", "shy smile", "flustered expression"] } },
  { id: "dominant", patterns: ["dominant", "commanding", "assertive"], priority: 34, tags: { "Expression": ["confident smirk", "commanding stare"], "Pose": ["power stance"], "Camera/Composition": ["low angle"] } },
  { id: "submissive", patterns: ["submissive", "obedient", "shy pose"], priority: 34, tags: { "Expression": ["shy smile", "blush"], "Pose": ["kneeling pose", "looking up"] } },
  { id: "latex-outfit", patterns: ["latex", "bodysuit", "latex bodysuit"], priority: 32, tags: { "Clothing": ["black latex bodysuit", "glossy latex", "tight outfit"], "Lighting": ["specular highlights"] } },
  { id: "armor-outfit", patterns: ["armor", "battle outfit", "warrior outfit"], priority: 32, tags: { "Clothing": ["layered winter armor", "fantasy armor", "armored bodysuit"], "Style": ["heroic combat scene"] } },
  { id: "maid-outfit", patterns: ["maid outfit", "maid dress", "maid uniform"], priority: 32, tags: { "Clothing": ["maid outfit", "frilled apron", "black dress", "white apron"] } }
]);

const VISUAL_ATTRIBUTE_COLORS = ["black", "white", "silver", "gray", "red", "crimson", "pink", "blue", "icy blue", "cyan", "teal", "green", "emerald", "purple", "violet", "gold", "blonde", "brown", "orange"];
VISUAL_ATTRIBUTE_COLORS.forEach((color) => {
  INTENT_RULES.push(
    { id: `${color}-eyes`, patterns: [`${color} eyes`], priority: 31, tags: { "Character": [`${color} eyes`] } },
    { id: `${color}-hair`, patterns: [`${color} hair`, `long ${color} hair`, `short ${color} hair`], priority: 31, tags: { "Character": [`${color} hair`] } },
    { id: `${color}-horns`, patterns: [`${color} horns`, `${color} horn`], priority: 31, tags: { "Character": [`${color} horns`] } },
    { id: `${color}-wings`, patterns: [`${color} wings`], priority: 31, tags: { "Character": [`${color} wings`] } }
  );
});

["long hair", "short hair", "medium hair", "messy hair", "straight hair", "wavy hair", "ponytail", "twintails", "braided hair"].forEach((hair) => {
  INTENT_RULES.push({ id: `hair-${hair}`, patterns: [hair], priority: 24, tags: { "Character": [hair] } });
});

["small breasts", "medium breasts", "large breasts", "big breasts", "huge breasts", "flat chest", "slim waist", "narrow waist", "wide hips", "thick thighs", "soft curves", "curvy body"].forEach((body) => {
  INTENT_RULES.push({ id: `body-${body}`, patterns: [body], priority: 30, tags: { "Character": [body] } });
});

function intentContains(text, pattern) {
  const escaped = String(pattern).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const needsLoose = /[^a-z0-9 ]/.test(pattern) || String(pattern).includes(" ");
  const regex = needsLoose
    ? new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i")
    : new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(text);
}

function analyzePromptIntent(input) {
  const text = String(input || "").toLowerCase();
  const matches = INTENT_RULES
    .filter((rule) => rule.patterns.some((pattern) => intentContains(text, pattern)))
    .sort((a, b) => b.priority - a.priority);
  const blocks = {
    style: [],
    subject: [],
    scene: [],
    anatomy: [],
    pose: [],
    expression: [],
    clothing: [],
    environment: [],
    lighting: [],
    camera: [],
    interaction: []
  };
  const remove = new Set(matches.flatMap((rule) => rule.remove || []));
  const push = (block, values) => values.forEach((value) => {
    if (!remove.has(value)) blocks[block].push(value);
  });
  const categoryBlock = {
    "Style": "style",
    "Quality": "style",
    "Character": "anatomy",
    "Act": "scene",
    "Pose": "pose",
    "Expression": "expression",
    "Clothing": "clothing",
    "Environment": "environment",
    "Lighting": "lighting",
    "Camera/Composition": "camera",
    "Color Palette": "style",
    "Interaction": "interaction"
  };

  matches.forEach((rule) => {
    Object.entries(rule.tags || {}).forEach(([category, values]) => push(categoryBlock[category] || "scene", values));
  });
  inferIntentTags(input).forEach(({ category, tag }) => push(categoryBlock[category] || "scene", [tag]));

  applyBroadIntentDefaults(text, matches, blocks);

  const explicitTerms = cleanPromptParts(String(input || "").split(/[,;\n]+/));
  const known = new Set(Object.values(blocks).flatMap((items) => items.map((item) => item.toLowerCase())));
  explicitTerms.forEach((term) => {
    const lower = term.toLowerCase();
    const consumedByRule = matches.some((rule) => rule.patterns.some((pattern) => {
      const cleanPattern = String(pattern).toLowerCase();
      return lower === cleanPattern || lower.replace(/\s+/g, " ") === cleanPattern;
    }));
    if (shouldKeepRawRequestTerm(lower, consumedByRule, known, blocks)) {
      blocks.subject.push(term);
    }
  });

  Object.keys(blocks).forEach((key) => {
    blocks[key] = unique(blocks[key]).filter((tag) => !remove.has(tag));
  });

  return { matches, blocks, isAdult: matches.some((rule) => rule.id === "adult-scene") || /hentai|nsfw|sex|fuck|fucked|nude|pussy|penis|tentacle|cum|anal|oral/.test(text) };
}

function shouldKeepRawRequestTerm(lower, consumedByRule, known, blocks) {
  if (consumedByRule || known.has(lower)) return false;
  if (/\b(i want|make me|create|generate|give me|anime character|hentai|nsfw|sex|fuck|fucked|get fucked|getting fucked|being fucked)\b/.test(lower)) return false;
  if (/\b(anime character|female anime|male anime|hentai|nsfw|sex scene)\b/.test(lower)) return false;
  return !Object.values(blocks).some((items) => items.some((item) => lower.includes(item.toLowerCase()) || item.toLowerCase().includes(lower)));
}

function applyBroadIntentDefaults(text, matches, blocks) {
  const hasAdult = matches.some((rule) => rule.id === "adult-scene") || intentContains(text, "hentai") || intentContains(text, "nsfw");
  const gender = requestedGender(text);
  const concreteScene = blocks.scene.filter((tag) => !["sex"].includes(tag)).length;
  const concreteSubject = blocks.subject.length || blocks.anatomy.some((tag) => /girl|woman|man|boy|succubus|elf|oni|dragon|catgirl|monster/i.test(tag));
  const character = resolveCharacterIntent(text);
  if (character && !blocks.subject.some((tag) => tag.toLowerCase() === character.toLowerCase())) {
    blocks.subject.unshift(character);
  }
  if (hasAdult && !concreteSubject && !character) {
    blocks.subject.push(gender === "male" ? "1boy" : "1girl");
  }
  if (hasAdult && gender !== "male" && /(fuck|fucking|fucked|sex|penetration|doggy|doggystyle|missionary|cowgirl|spooning)/i.test(text)) {
    const hasPartner = blocks.interaction.some((tag) => /1boy|monster|beast|tentacle|hetero/i.test(tag));
    if (!hasPartner) blocks.interaction.push("1boy", "hetero");
  }
  if (hasAdult && !blocks.anatomy.some((tag) => /breasts|curvy|hips|thighs|pussy|penis|nipples/i.test(tag))) {
    blocks.anatomy.push(...(gender === "male"
      ? randomMany(["male focus", "lean body", "broad shoulders", "defined abs", "erect penis"], 2, 4)
      : randomMany(["curvy body", "soft curves", "large breasts", "wide hips", "thick thighs", "slim waist", "nipples"], 2, 4)));
  }
  if (hasAdult && !concreteScene) {
    if (gender === "male") {
      const wantsPartneredMaleScene = /(fuck|fucking|sex|penetration|partner|with girl|with woman|1girl|cowgirl|missionary|doggy|doggystyle)/i.test(text);
      applySceneTemplate(blocks, randomPick(wantsPartneredMaleScene ? RANDOM_MALE_PARTNERED_SCENES : RANDOM_MALE_ADULT_SCENES));
    } else {
      const kind = resolveAdultSceneKind(text);
      applySceneTemplate(blocks, randomPick(RANDOM_ADULT_SCENES[kind]));
    }
    blocks.style.push("hentai", "doujinshi style");
  }

  if ((intentContains(text, "cute") || intentContains(text, "kawaii")) && !concreteSubject) {
    blocks.subject.push("1girl", "cute anime girl");
    blocks.pose.push("soft cute pose");
    blocks.expression.push("bright eyes", "soft smile");
    blocks.lighting.push("soft ambient light");
  }

  if ((intentContains(text, "fantasy") || intentContains(text, "adventure")) && !blocks.environment.length) {
    blocks.environment.push("fantasy landscape", "ancient ruins");
    blocks.lighting.push("dramatic lighting");
    blocks.style.push("premium fantasy illustration");
  }
}

function intentTagsInOrder(input) {
  const { blocks } = analyzePromptIntent(input);
  return [
    ...blocks.style.map((tag) => ({ category: "Style", tag })),
    ...blocks.interaction.map((tag) => ({ category: "Character", tag })),
    ...blocks.anatomy.map((tag) => ({ category: "Character", tag })),
    ...blocks.scene.map((tag) => ({ category: "Act", tag })),
    ...blocks.pose.map((tag) => ({ category: "Pose", tag })),
    ...blocks.expression.map((tag) => ({ category: "Expression", tag })),
    ...blocks.clothing.map((tag) => ({ category: "Clothing", tag })),
    ...blocks.environment.map((tag) => ({ category: "Environment", tag })),
    ...blocks.lighting.map((tag) => ({ category: "Lighting", tag })),
    ...blocks.camera.map((tag) => ({ category: "Camera/Composition", tag }))
  ];
}

function qualityPrefixForRule(rule) {
  const prefix = [...rule.qualityPrefix];
  return prefix;
}

function selectedCharacterPrompt() {
  const value = state.builder.character || "";
  if (!value) return [];
  if (state.builder.contentMode === "adult" && state.builder.characterMode !== "manual") {
    return adultCharacterSet().has(value) ? [value] : [];
  }
  return [value];
}

function pruneBuilderSelections() {
  BUILDER_CATEGORIES.forEach((category) => {
    const allowed = new Set(tagPoolFor(category));
    state.builder.selectedTags[category] = (state.builder.selectedTags[category] || []).filter((tag) => allowed.has(tag));
  });
  Object.keys(state.builder.tagWeights || {}).forEach((key) => {
    const [category, tag] = key.split(":");
    if (!(state.builder.selectedTags[category] || []).includes(tag)) delete state.builder.tagWeights[key];
  });
  if (state.builder.contentMode === "adult" && state.builder.characterMode !== "manual" && state.builder.character && !adultCharacterSet().has(state.builder.character)) {
    state.builder.character = "";
  }
}

function assembleBuilderPrompt(extra = "") {
  const rule = activeCheckpointRule();
  const selected = selectedBuilderTags();
  const intent = analyzePromptIntent(extra);
  const selectedUnique = unique(selected.map((item) => `${item.category}:::${item.tag}`))
    .map((packed) => {
      const [category, tag] = packed.split(":::");
      return { category, tag };
    });
  const selectedQualityStyle = selectedUnique
    .filter((item) => ["Quality", "Style", "Color Palette"].includes(item.category))
    .map((item) => formatTagForCheckpoint(item.tag, item.category));
  const positiveSelected = selectedUnique
    .filter((item) => !["Negative", "Quality", "Style", "Color Palette"].includes(item.category))
    .map((item) => formatTagForCheckpoint(item.tag, item.category));
  const negativeSelected = selectedUnique
    .filter((item) => item.category === "Negative")
    .map((item) => item.tag);
  const styleTokens = selectedStyleTokenObjects().map((token) => token.prompt);
  const loras = selectedLoraObjects().map((lora) => loraCommand(lora));
  const character = selectedCharacterPrompt();
  const rawCustomPositive = cleanPromptParts(String(extra || "").split(/[,;\n]+/));
  const customPositive = rule.promptStyle === "natural_language" ? rawCustomPositive : [];
  const customNegative = [];
  const subjectBlock = cleanPromptParts([
    ...character,
    ...styleTokens,
    ...loras,
    ...intent.blocks.subject,
    ...intent.blocks.interaction,
    ...intent.blocks.anatomy
  ]);
  const sceneBlock = cleanPromptParts([
    ...intent.blocks.scene,
    ...intent.blocks.pose,
    ...intent.blocks.expression,
    ...intent.blocks.clothing,
    ...intent.blocks.environment,
    ...intent.blocks.lighting,
    ...intent.blocks.camera
  ]);

  if (rule.promptStyle === "natural_language") {
    const sentenceParts = unique([...character, ...styleTokens, ...positiveSelected, ...customPositive, ...loras]);
    const positive = sentenceParts.length
      ? `Create ${sentenceParts.join(", ")} with ${rule.tips.toLowerCase()}`
      : "Describe the image you want to build.";
    return { positive, negative: "", text: `POSITIVE PROMPT\n${positive}\n\nNEGATIVE PROMPT\nNot used by ${rule.name}.`, checkpointId: rule.id, checkpointName: rule.name, vibe: state.builder.vibe, loras };
  }

  const positiveParts = cleanPromptParts([
    ...qualityPrefixForRule(rule),
    ...styleTokens,
    ...intent.blocks.style,
    ...selectedQualityStyle,
    ...subjectBlock,
    ...(rule.promptStyle !== "natural_language" && (subjectBlock.length || sceneBlock.length) ? ["BREAK"] : []),
    ...sceneBlock,
    ...positiveSelected,
    ...customPositive
  ]);
  const negativeParts = [];
  const positive = positiveParts.join(rule.separator);
  const negative = negativeParts.join(rule.separator);
  return {
    positive,
    negative,
    text: `POSITIVE PROMPT\n${positive}\n\nNEGATIVE PROMPT\n${negative}`,
    checkpointId: rule.id,
    checkpointName: rule.name,
    vibe: state.builder.vibe,
    loras
  };
}

function renderRealInsights() {
  const stats = state.usageStats;
  const likeTotal = stats.feedbackGood + stats.feedbackBad;
  const likeRatio = likeTotal ? Math.round((stats.feedbackGood / likeTotal) * 100) : 0;
  const confidence = calculateConfidence();
  if (els.workspaceRealStats) {
    els.workspaceRealStats.innerHTML = `
      <div class="real-stat"><strong>${stats.totalPrompts}</strong><span>Total prompts</span></div>
      <div class="real-stat"><strong>${likeRatio}%</strong><span>Like ratio</span></div>
      <div class="real-stat"><strong>${Object.keys(stats.tagScores).length}</strong><span>Learned tags</span></div>
      <button class="text-btn" data-jump-button="memoryView">Open insights</button>`;
  }
  if (els.usageOverview) {
    els.usageOverview.innerHTML = [
      ["Total prompts", stats.totalPrompts],
      ["Feedback events", likeTotal],
      ["Liked", stats.feedbackGood],
      ["Disliked", stats.feedbackBad],
      ["Learned tags", Object.keys(stats.tagScores).length],
      ["History saved", stats.history.length]
    ].map(([label, value]) => `<div class="real-stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
  }
  if (els.tagScoreChart) renderBarChart(els.tagScoreChart, Object.entries(stats.tagScores).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 12), "No favourite tags yet. Like generated prompts or rated results to build this graph.");
  if (els.vibeUsageChart) renderBarChart(els.vibeUsageChart, Object.entries(stats.vibeUsage).sort((a, b) => b[1] - a[1]), "No vibe usage yet. Generate a prompt from Workspace first.");
  if (els.checkpointUsageChart) {
    const entries = Object.entries(stats.checkpointUsage).map(([id, count]) => [CHECKPOINT_RULES[id]?.name || id, count]).sort((a, b) => b[1] - a[1]);
    renderBarChart(els.checkpointUsageChart, entries, "No checkpoint usage yet. Generate a prompt from Workspace first.");
  }
  if (els.realLearningStrength) els.realLearningStrength.textContent = `${confidence}%`;
  const strengthLine = document.querySelector(".learning-strength .strength-line i");
  if (strengthLine) strengthLine.style.width = `${confidence}%`;
  if (els.realLearningNote) {
    els.realLearningNote.textContent = likeTotal
      ? `${stats.feedbackGood} positive and ${stats.feedbackBad} negative local feedback events.`
      : "No feedback yet. Ratings and thumbs shape the graphs here.";
  }
  renderHistoryLearningList();
}

function renderBarChart(target, entries, emptyText) {
  if (!entries.length) {
    target.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }
  const max = Math.max(1, ...entries.map(([, value]) => Math.abs(Number(value))));
  target.innerHTML = entries.map(([label, value]) => {
    const width = Math.max(6, Math.round((Math.abs(Number(value)) / max) * 100));
    return `
      <div class="bar-row">
        <span>${escapeHtml(label)}</span>
        <div><i style="width:${width}%"></i></div>
        <b>${value}</b>
      </div>`;
  }).join("");
}

function renderHistoryLearningList() {
  if (!els.historyLearningList) return;
  const items = state.usageStats.history.slice(0, 12);
  if (!items.length) {
    els.historyLearningList.innerHTML = `<p class="empty-state">No prompt history yet. Generated Workspace prompts appear here with feedback buttons.</p>`;
    return;
  }
  els.historyLearningList.innerHTML = items.map((item) => `
    <article class="history-learn-card">
      <div>
        <strong>${escapeHtml(CHECKPOINT_RULES[item.checkpointId]?.name || item.checkpointId || "Unknown checkpoint")}</strong>
        <span>${escapeHtml(item.vibe || "Free")} / ${new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p>${escapeHtml(shorten(item.prompt || "", 150))}</p>
      <div class="memory-cloud">${(item.tags || []).slice(0, 8).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="copy-row">
        <button class="tiny-btn ${item.rating >= 4 ? "good-chip" : ""}" data-history-feedback="${item.id}" data-score="5">Like</button>
        <button class="tiny-btn ${item.rating && item.rating < 4 ? "bad-chip" : ""}" data-history-feedback="${item.id}" data-score="2">Not it</button>
        <button class="tiny-btn" data-copy-text="${escapeAttr(item.prompt || "")}">Copy</button>
      </div>
    </article>`).join("");
}

function renderChats() {
  const targets = [els.chatList, els.historyChatList].filter(Boolean);
  targets.forEach((target) => target.innerHTML = "");
  state.chats.forEach((chat) => {
    const item = document.createElement("div");
    item.className = `chat-item${chat.id === activeChatId ? " is-active" : ""}`;
    item.innerHTML = `
      <div class="chat-thumb">${escapeHtml((chat.title || "N").slice(0, 2))}</div>
      <button class="chat-open" data-open-chat="${chat.id}">
        <strong>${escapeHtml(chat.title)}</strong>
        <span class="meta">${new Date(chat.createdAt).toLocaleDateString()} - ComfyUI</span>
      </button>
      <button class="delete-chat" title="Delete chat" data-delete-chat="${chat.id}">x</button>`;
    targets.forEach((target) => target.append(item.cloneNode(true)));
  });
}

function renderMessages() {
  const chat = activeChat();
  els.messages.innerHTML = "";
  chat.messages.forEach((message, index) => {
    const item = document.createElement("article");
    item.className = `message ${message.role}`;
    if (message.role === "assistant" && message.promptPack) {
      item.innerHTML = `
        <strong>PromptBrain</strong>
        <pre>${escapeHtml(message.text)}</pre>
        <div class="copy-row">
          <button class="tiny-btn" data-copy="${index}" data-part="positive">Copy positive</button>
          <button class="tiny-btn" data-copy="${index}" data-part="negative">Copy negative</button>
          <button class="tiny-btn" data-copy="${index}" data-part="all">Copy all</button>
          <button class="tiny-btn" data-workflow="${index}">Export workflow JSON</button>
        </div>
        <div class="rating-row">
          <button class="tiny-btn" data-like-prompt="${index}">I like it</button>
          <button class="tiny-btn danger-btn" data-dislike-prompt="${index}">I don't like it</button>
          <button class="tiny-btn" data-train-prompt="${index}">Train this</button>
          <button class="tiny-btn" data-rate="${index}" data-score="5">Love it</button>
          <button class="tiny-btn" data-rate="${index}" data-score="4">Good</button>
          <button class="tiny-btn" data-rate="${index}" data-score="2">Not it</button>
          <button class="tiny-btn" data-learn="${index}">Add to liked</button>
        </div>`;
    } else {
      item.innerHTML = `<strong>${message.role === "user" ? "You" : "PromptBrain"}</strong><p>${escapeHtml(message.text)}</p>`;
    }
    els.messages.append(item);
  });
  els.messages.scrollTop = els.messages.scrollHeight;
}

function renderLiked() {
  els.likedGrid.innerHTML = "";
  if (!state.liked.length) {
    els.likedGrid.innerHTML = `<p class="meta">No liked results yet. Add pictures/prompts here and the app starts borrowing their patterns.</p>`;
    return;
  }

  state.liked.slice().reverse().forEach((item) => {
    const card = document.createElement("article");
    card.className = "learn-card";
    card.innerHTML = `
      ${item.image ? `<img src="${item.image}" alt="">` : ""}
      <div>
        <strong>${escapeHtml(item.tags || "Learned result")}</strong>
        <p class="meta">${escapeHtml(shorten(item.prompt || item.notes || "No prompt, learned from image/tags.", 130))}</p>
        <button class="tiny-btn" data-delete-liked="${item.id}">Delete</button>
      </div>`;
    els.likedGrid.append(card);
  });
}

function renderReferences() {
  els.referenceGrid.innerHTML = "";
  if (!state.references.length) {
    els.referenceGrid.innerHTML = `<p class="meta">No references saved yet. Add images here and the app will learn color, shape, aspect, brightness, and your notes.</p>`;
    return;
  }

  state.references.slice().reverse().forEach((item) => {
    const colors = (item.analysis?.colors || []).map((color) => `<span class="swatch" style="background:${color}"></span>`).join("");
    const card = document.createElement("article");
    card.className = "learn-card";
    card.innerHTML = `
      ${item.image ? `<img src="${item.image}" alt="">` : ""}
      <div>
        <strong>${escapeHtml(item.analysis?.summary || "Reference")}</strong>
        <div class="swatches">${colors}</div>
        <p class="meta">${escapeHtml(shorten(item.notes || "", 120))}</p>
        <button class="tiny-btn" data-delete-reference="${item.id}">Delete</button>
      </div>`;
    els.referenceGrid.append(card);
  });
}

function renderProfiles() {
  els.profileGrid.innerHTML = "";
  if (!state.profiles.length) {
    els.profileGrid.innerHTML = `<p class="meta">No characters/profiles saved yet.</p>`;
    return;
  }

  state.profiles.slice().reverse().forEach((item) => {
    const card = document.createElement("article");
    card.className = "learn-card";
    card.innerHTML = `<div><strong>${escapeHtml(item.name)}</strong><p class="meta">${escapeHtml(shorten(item.description, 150))}</p><p>${escapeHtml(item.tags || "")}</p><button class="tiny-btn" data-use-profile="${item.id}">Use in chat</button> <button class="tiny-btn" data-delete-profile="${item.id}">Delete</button></div>`;
    els.profileGrid.append(card);
  });
}

function renderLoras() {
  els.loraGrid.innerHTML = "";
  if (!state.loras.length) {
    els.loraGrid.innerHTML = `<p class="meta">No LoRA/model presets yet.</p>`;
    return;
  }

  state.loras.slice().reverse().forEach((item) => {
    const card = document.createElement("article");
    card.className = "learn-card";
    card.innerHTML = `<div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(shorten(item.tags, 160))}</p><p class="meta">${escapeHtml(shorten(item.notes || "", 120))}</p><button class="tiny-btn" data-use-lora="${item.id}">Use in chat</button> <button class="tiny-btn" data-delete-lora="${item.id}">Delete</button></div>`;
    els.loraGrid.append(card);
  });
}

function renderVersions() {
  const targets = [els.versionList, els.historyVersionList].filter(Boolean);
  targets.forEach((target) => target.innerHTML = "");
  if (!state.versions.length) {
    targets.forEach((target) => target.innerHTML = `<p class="meta">No prompt versions yet. Generate prompts or use variation buttons.</p>`);
    return;
  }

  state.versions.slice().reverse().forEach((item) => {
    const card = document.createElement("article");
    card.className = "version-card";
    card.innerHTML = `
      <strong>${escapeHtml(item.label || "Prompt version")}</strong>
      <p class="meta">${new Date(item.createdAt).toLocaleString()}</p>
      <pre>${escapeHtml(item.text)}</pre>
      <div class="copy-row">
        <button class="tiny-btn" data-use-version="${item.id}">Use in chat</button>
        <button class="tiny-btn" data-copy-version="${item.id}">Copy</button>
        <button class="tiny-btn" data-delete-version="${item.id}">Delete</button>
      </div>`;
    targets.forEach((target) => target.append(card.cloneNode(true)));
  });
}

function renderGallery() {
  els.galleryGrid.innerHTML = "";
  if (!state.gallery.length) {
    els.galleryGrid.innerHTML = `<p class="empty-state">No result images imported yet. Upload real outputs here to rate and learn from them.</p>`;
    renderTopRated();
    return;
  }

  state.gallery.slice().reverse().forEach((item) => {
    const card = document.createElement("article");
    card.className = "learn-card";
    card.innerHTML = `
      <img src="${item.image}" alt="">
      <div>
        <strong>${item.rating ? `${item.rating}/5` : "Unrated"}</strong>
        <p class="meta">${escapeHtml(shorten(item.prompt || "No notes attached", 100))}</p>
        <div class="rating-row">
          <button class="tiny-btn" data-rate-gallery="${item.id}" data-score="5">Love</button>
          <button class="tiny-btn" data-rate-gallery="${item.id}" data-score="4">Good</button>
          <button class="tiny-btn" data-rate-gallery="${item.id}" data-score="2">Bad</button>
          <button class="tiny-btn" data-delete-gallery="${item.id}">Delete</button>
        </div>
      </div>`;
    els.galleryGrid.append(card);
  });
  renderTopRated();
}

function renderTopRated() {
  if (!els.homeTopRated) return;
  const top = state.gallery.filter((item) => item.rating >= 4).slice(-6).reverse();
  const likedWithImages = state.liked.filter((item) => item.image).slice(-6).reverse();
  const images = unique([...top.map((item) => item.image), ...likedWithImages.map((item) => item.image)]).slice(0, 6);
  els.homeTopRated.innerHTML = images.length
    ? images.map((image) => `<img src="${image}" alt="">`).join("")
    : `<p class="empty-state">No rated result images yet.</p>`;
}

function renderMemory() {
  const cloud = displayMemory().slice(0, 160);
  $("#memoryCloud").innerHTML = cloud.length
    ? cloud.map((item) => `<span class="chip">${escapeHtml(item.term)} <span class="meta">${item.score}</span></span>`).join("")
    : `<p class="meta">Memory is empty. Save liked results, rate prompts, or add research notes.</p>`;
}

function renderTasteProfile() {
  const memory = displayMemory();
  const top = memory.slice(0, 5);
  const bars = $("#tasteBars");
  const chips = $("#tasteChips");
  const score = $("#confidenceScore");
  const source = $("#tasteSourceText");
  if (bars) {
    const max = Math.max(1, ...top.map((item) => item.score));
    bars.innerHTML = top.length
      ? top.map((item) => `<div class="taste-row"><span>${escapeHtml(item.term)}</span><div><i style="width:${Math.max(8, Math.round((item.score / max) * 100))}%"></i></div><b>${item.score}</b></div>`).join("")
      : `<p class="meta">Rate results and save references to build this profile.</p>`;
  }
  if (chips) {
    chips.innerHTML = memory.slice(0, 18).map((item) => `<span class="chip">${escapeHtml(item.term)}</span>`).join("") || `<p class="meta">No learned style tags yet.</p>`;
  }
  if (score) {
    const confidence = calculateConfidence();
    score.textContent = `${confidence}%`;
    const sidebarMeter = document.querySelector(".sidebar-card .mini-meter i");
    if (sidebarMeter) sidebarMeter.style.width = `${confidence}%`;
  }
  if (source) {
    source.textContent = `${state.liked.length} liked results, ${state.references.length} references, ${state.gallery.filter((item) => item.rating >= 4).length} top-rated gallery images`;
  }
}

function renderAnalytics() {
  const memory = displayMemory();
  const confidence = calculateConfidence();
  renderRadar(memory.slice(0, 6));
  renderFailureModes();
  renderCheckpointList();
  renderRatingTrend();
  renderSignalLists();
  renderConditionalRules();

  if (els.profileConfidenceRing) {
    els.profileConfidenceRing.innerHTML = `
      <div class="ring" style="--score:${confidence * 3.6}deg">
        <strong>${confidence}%</strong>
        <span>${confidence > 75 ? "High" : confidence > 45 ? "Growing" : "Training"}</span>
      </div>
      <p class="meta">Confidence rises when you rate prompts, save images, and add training rules.</p>`;
  }
}

function renderRadar(items) {
  if (!els.radarChart) return;
  if (!items.length) {
    els.radarChart.innerHTML = `<p class="meta">Save or rate a few results and the preference map will appear here.</p>`;
    return;
  }
  const max = Math.max(1, ...items.map((item) => item.score));
  const cx = 150;
  const cy = 132;
  const radius = 88;
  const spokes = items.map((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / items.length;
    const outerX = cx + Math.cos(angle) * radius;
    const outerY = cy + Math.sin(angle) * radius;
    const valueRadius = Math.max(20, radius * (item.score / max));
    return {
      item,
      angle,
      outer: `${outerX},${outerY}`,
      value: `${cx + Math.cos(angle) * valueRadius},${cy + Math.sin(angle) * valueRadius}`,
      labelX: cx + Math.cos(angle) * (radius + 35),
      labelY: cy + Math.sin(angle) * (radius + 25)
    };
  });
  els.radarChart.innerHTML = `
    <svg viewBox="0 0 300 265" role="img" aria-label="Taste radar">
      <polygon class="radar-grid" points="${spokes.map((point) => point.outer).join(" ")}"></polygon>
      ${spokes.map((point) => `<line class="radar-line" x1="${cx}" y1="${cy}" x2="${point.outer.split(",")[0]}" y2="${point.outer.split(",")[1]}"></line>`).join("")}
      <polygon class="radar-fill" points="${spokes.map((point) => point.value).join(" ")}"></polygon>
      ${spokes.map((point) => `<text x="${point.labelX}" y="${point.labelY}">${escapeHtml(shorten(point.item.term, 13))}</text>`).join("")}
    </svg>`;
}

function renderFailureModes() {
  if (!els.failureModes) return;
  const failures = unique(state.trainingRules.flatMap((rule) => extractPromptTerms(rule.avoid || ""))).slice(0, 12);
  els.failureModes.innerHTML = failures.length
    ? failures.map((term) => `<span class="chip bad-chip">${escapeHtml(term)}</span>`).join("")
    : `<p class="empty-state">No disliked tags yet. Use thumbs-down or training feedback to fill this.</p>`;
}

function renderCheckpointList() {
  if (els.checkpointList) els.checkpointList.innerHTML = checkpointMarkup(5);
}

function renderRatingTrend() {
  if (!els.ratingTrend) return;
  const ratings = collectRatings(false);
  if (!ratings.length) {
    els.ratingTrend.innerHTML = `<p class="empty-state">No rating history yet. Rate generated prompts or image results to draw this graph.</p>`;
    return;
  }
  const points = ratings.slice(-24);
  const width = 620;
  const height = 180;
  const coords = points.map((entry, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((entry.score - 1) / 4) * (height - 30) - 15;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const average = points.reduce((sum, entry) => sum + entry.score, 0) / points.length;
  els.ratingTrend.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Rating trend">
      <g class="trend-grid">${[1, 2, 3, 4].map((n) => `<line x1="0" y1="${n * 36}" x2="${width}" y2="${n * 36}"></line>`).join("")}</g>
      <polyline class="trend-line" points="${coords}"></polyline>
      ${coords.split(" ").map((point) => {
        const [x, y] = point.split(",");
        return `<circle cx="${x}" cy="${y}" r="3"></circle>`;
      }).join("")}
    </svg>
    <div class="trend-foot"><strong>${average.toFixed(1)}</strong><span>average rating from ${points.length} signal${points.length === 1 ? "" : "s"}</span></div>`;
}

function renderSignalLists() {
  if (els.likesList) {
    const likes = state.liked.slice().reverse().slice(0, 4);
    els.likesList.innerHTML = likes.length
      ? likes.map((item) => `<article class="signal-item">${item.image ? `<img src="${item.image}" alt="">` : `<div class="sample-thumb">T</div>`}<div><strong>${escapeHtml(shorten(item.tags || "Liked prompt", 32))}</strong><span>${escapeHtml(shorten(item.prompt || item.notes || "Saved preference", 72))}</span></div><button type="button">&#9825;</button></article>`).join("")
      : `<p class="empty-state">No liked prompts or images yet.</p>`;
  }
  if (els.dislikesList) {
    const dislikes = state.trainingRules.filter((rule) => rule.avoid).slice().reverse().slice(0, 4);
    els.dislikesList.innerHTML = dislikes.length
      ? dislikes.map((rule) => `<article class="signal-item no-image"><div><strong>${escapeHtml(shorten(rule.trigger, 32))}</strong><span>${escapeHtml(shorten(rule.avoid, 90))}</span></div><button type="button">x</button></article>`).join("")
      : `<p class="empty-state">No disliked patterns yet.</p>`;
  }
}

function renderConditionalRules() {
  if (!els.conditionalRules) return;
  const rules = state.trainingRules.slice().reverse().slice(0, 5);
  els.conditionalRules.innerHTML = rules.length
    ? rules.map((rule) => `<div class="condition-row"><span>If ${escapeHtml(shorten(rule.trigger, 26))}</span><b>${escapeHtml(shorten(rule.prefer || rule.avoid, 42))}</b><i></i></div>`).join("")
    : `<p class="empty-state">No training rules yet.</p>`;
}

function renderCompareLab() {
  if (!els.compareGrid) return;
  const cards = state.versions.slice().reverse().slice(0, 3);
  if (!cards.length) {
    els.compareGrid.innerHTML = `<p class="empty-state">No prompt variants yet. Build a prompt in Workspace or use Add Variant after generating one.</p>`;
    if (els.changeList) els.changeList.innerHTML = `<p class="empty-state">Variant differences appear after real prompt versions exist.</p>`;
    if (els.learningInsights) els.learningInsights.innerHTML = `<p class="empty-state">Learning insights require real ratings or feedback.</p>`;
    return;
  }
  const displayCards = cards;
  const ratings = displayCards.map((item) => Number(item.rating || item.pack?.rating || 0));
  const bestRating = Math.max(0, ...ratings);
  const winnerIndex = bestRating > 0 ? ratings.indexOf(bestRating) : -1;
  els.compareGrid.innerHTML = displayCards.map((item, index) => variantCard(item, index, winnerIndex)).join("");

  if (els.changeList) {
    els.changeList.innerHTML = compareChanges(displayCards);
  }
  if (els.learningInsights) {
    const top = displayMemory().slice(0, 4);
    const failures = state.trainingRules.filter((rule) => rule.avoid).slice(-2);
    els.learningInsights.innerHTML = `
      <p>${state.usageStats.feedbackGood || state.usageStats.feedbackBad ? "These insights are based on your saved prompt feedback." : "Rate a variant to teach PromptBrain what to keep."}</p>
      <div class="memory-cloud">${top.map((item) => `<span class="chip good-chip">${escapeHtml(item.term)}</span>`).join("") || `<span class="chip">waiting for ratings</span>`}</div>
      <div class="memory-cloud">${failures.map((rule) => shorten(rule.avoid, 28)).map((term) => `<span class="chip bad-chip">${escapeHtml(term)}</span>`).join("")}</div>
      <button class="tiny-btn" data-jump-button="chatView">Apply to next session</button>`;
  }
}

function variantCard(item, index, winnerIndex = -1) {
  const pack = item.pack || parsePromptText(item.text, { positive: item.text, negative: defaultNegative });
  const rating = Number(item.rating || item.pack?.rating || 0);
  const stars = Array.from({ length: 5 }, (_, starIndex) => `<b class="${starIndex < rating ? "on" : ""}" role="button" tabindex="0" aria-label="Rate ${starIndex + 1} of 5" data-rate-version="${item.id}" data-score="${starIndex + 1}">&#9733;</b>`).join("");
  const title = item.title || item.label || `Variant ${String.fromCharCode(65 + index)}`;
  const tags = item.tags || extractPromptTerms(pack.positive || item.text).slice(0, 3);
  const model = item.model || item.pack?.checkpointName || activeCheckpointRule().name;
  const isWinner = winnerIndex === index;
  return `
    <article class="variant-card ${isWinner ? "is-winner" : ""}">
      <div class="variant-top"><strong>Variant ${String.fromCharCode(65 + index)}</strong>${isWinner ? "<span>Winner</span>" : "<button class=\"text-btn\">More</button>"}</div>
      <div class="variant-media">${item.image ? `<img src="${item.image}" alt="">` : `<div class="variant-placeholder">No result image linked</div>`}</div>
      <div>
        <h3 class="variant-title">${escapeHtml(title)}</h3>
        <p class="variant-preview">${escapeHtml(shorten(pack.positive || item.text, 170))}</p>
        <div class="memory-cloud"><span class="chip">${escapeHtml(model)}</span>${tags.slice(0, 4).map((term) => `<span class="chip">${escapeHtml(term)}</span>`).join("")}</div>
      </div>
      <div class="star-row" aria-label="${rating} stars"><span>${rating ? "Your rating" : "Rate this result"}</span>${stars}</div>
      <div class="copy-row"><button class="tiny-btn" data-use-version="${item.id}">Use</button><button class="tiny-btn" data-copy-version="${item.id}">Copy</button></div>
    </article>`;
}

function compareChanges(cards) {
  const labels = ["Composition", "Lighting", "Detail"];
  return labels.map((label, index) => {
    const termsA = extractPromptTerms(cards[0]?.text || "");
    const termsB = extractPromptTerms(cards[1]?.text || "");
    const gained = termsB.find((term) => !termsA.includes(term)) || "No new term detected";
    const lost = termsA.find((term) => !termsB.includes(term)) || "No removed term detected";
    return `<div class="change-row"><strong>${label}</strong><span>A to B: ${escapeHtml(gained)}</span><span>B tradeoff: ${escapeHtml(lost)}</span></div>`;
  }).join("");
}

function calculateConfidence() {
  const tagScoreTotal = Object.values(state.usageStats.tagScores || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  const signal =
    state.usageStats.totalPrompts * 2 +
    state.usageStats.feedbackGood * 6 +
    state.usageStats.feedbackBad * 3 +
    state.liked.length * 5 +
    state.references.length * 3 +
    state.profiles.length * 3 +
    state.trainingRules.length * 4 +
    state.gallery.filter((item) => item.rating >= 4).length * 3 +
    Math.min(30, tagScoreTotal);
  return Math.min(97, signal);
}

function collectRatings(withFallback = false) {
  const ratings = [];
  state.gallery.forEach((item) => {
    if (item.rating) ratings.push({ score: Number(item.rating), time: item.createdAt || Date.now() });
  });
  state.liked.forEach((item) => ratings.push({ score: Number(item.rating || 5), time: item.createdAt || Date.now() }));
  state.chats.forEach((chat) => chat.messages.forEach((message) => {
    if (message.rating) ratings.push({ score: Number(message.rating), time: chat.createdAt || Date.now() });
  }));
  const sorted = ratings.sort((a, b) => a.time - b.time);
  return sorted;
}

function displayMemory() {
  return buildMemory();
}

function checkpointMarkup(limit = 5) {
  const entries = Object.entries(state.usageStats.checkpointUsage || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (!entries.length) return `<p class="empty-state">No checkpoint usage yet.</p>`;
  const max = Math.max(1, ...entries.map(([, count]) => count));
  const rows = entries.map(([id, count]) => ({
    name: CHECKPOINT_RULES[id]?.name || id,
    detail: `Used ${count} time${count === 1 ? "" : "s"}`,
    percent: Math.round((count / max) * 100)
  }));

  return rows.map((item, index) => `
    <div class="checkpoint-row">
      <div class="checkpoint-art">${escapeHtml(item.name.slice(0, 2))}</div>
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.detail)}</span></div>
      <b>${item.percent}%</b>
      <i><em style="width:${Math.max(8, item.percent * 3)}%"></em></i>
    </div>`).join("");
}

function renderWorkspaceRail() {
  if (els.workspaceCheckpointList) els.workspaceCheckpointList.innerHTML = checkpointMarkup(3);
  if (!els.workspaceRatingSpark) return;
  const ratings = collectRatings(false).slice(-16);
  els.workspaceRatingSpark.innerHTML = ratings.length ? lineSvg(ratings.map((item) => item.score), 250, 76, "sparkline") : `<p class="empty-state">No ratings yet.</p>`;
}

function renderImageMemoryDetail() {
  if (!els.imageMemoryDetail) return;
  const gallery = state.gallery.slice().reverse();
  const liked = state.liked.filter((item) => item.image).slice().reverse();
  const allImages = [...gallery, ...liked.filter((item) => !gallery.some((galleryItem) => galleryItem.id === item.id))];
  const selected = allImages.find((item) => item.id === state.selectedImageId) || allImages[0];
  if (!selected) {
    els.imageMemoryDetail.innerHTML = `<section class="panel"><h2>Image Memory</h2><p class="empty-state">No real image results yet. Upload ComfyUI outputs below and this page becomes a real result inspector with prompt, model settings, ratings, and learning controls.</p></section>`;
    return;
  }
  state.selectedImageId = selected.id;
  const prompt = selected.prompt || selected.notes || "No prompt attached to this image yet.";
  const negative = selected.negative || "";
  const title = titleFromPrompt(prompt) || "Saved Result";
  const related = allImages.filter((item) => item.image).slice(0, 8);
  const checkpoint = selected.checkpointId ? CHECKPOINT_RULES[selected.checkpointId] : null;
  const loraRows = Array.isArray(selected.loras)
    ? selected.loras.map((name) => catalogLoraKb.find((lora) => lora.name === name)).filter(Boolean)
    : [];
  els.imageMemoryDetail.innerHTML = `
    <div class="image-detail-grid">
      <section>
        <div class="back-link">Back to Image Memory</div>
        <div class="image-title">
          <h2>${escapeHtml(title)}</h2>
          <div class="tag-row"><span>ComfyUI</span><span>${escapeHtml(checkpoint?.base || "checkpoint not stored")}</span><span>${selected.rating ? `${selected.rating}/5` : "unrated"}</span><span>#IM-${String(selected.createdAt || Date.now()).slice(-5)}</span></div>
        </div>
        <div class="image-hero"><img src="${selected.image}" alt=""></div>
        <div class="image-actions">
          <div class="copy-row">
            <a class="tiny-btn" href="${escapeAttr(selected.image)}" download="promptbrain-result.png">Download</a>
            <button class="tiny-btn" data-upload-memory="true">Upload</button>
            <button class="tiny-btn" data-image-favorite="${escapeAttr(selected.id)}">${selected.favorite ? "Favorited" : "Favorite"}</button>
          </div>
          <div class="copy-row"><span class="chip">Rating</span><span class="star-row">${Array.from({ length: 5 }, (_, i) => `<b class="${i < Number(selected.rating || 0) ? "on" : ""}" role="button" tabindex="0" data-rate-memory="${escapeAttr(selected.id)}" data-score="${i + 1}">&#9733;</b>`).join("")}</span></div>
          <button class="tiny-btn" data-jump-button="variationsView">Compare</button>
        </div>
        <div class="learning-controls">
          <h2>Learning Controls</h2>
          <p class="meta">Teach PromptBrain what to remember from this result.</p>
          <div class="learn-options">
            <button data-memory-learn="all" data-image-id="${escapeAttr(selected.id)}">Learn from this<br><span class="meta">Use prompt, style, and settings</span></button>
            <button data-memory-learn="style" data-image-id="${escapeAttr(selected.id)}">Learn style only<br><span class="meta">Use visual direction</span></button>
            <button data-memory-learn="failure" data-image-id="${escapeAttr(selected.id)}">Learn failure only<br><span class="meta">Save what did not work</span></button>
            <button data-memory-learn="none" data-image-id="${escapeAttr(selected.id)}">Do not learn<br><span class="meta">Exclude this image</span></button>
          </div>
        </div>
        <h2 class="section-mini">Related Generations</h2>
        <div class="related-strip">${related.map((item) => `<button class="image-thumb-button ${item.id === selected.id ? "is-active" : ""}" data-select-image="${escapeAttr(item.id)}"><img src="${escapeAttr(item.image)}" alt=""></button>`).join("")}</div>
      </section>
      <aside class="detail-side">
        <section class="detail-card"><div class="section-title-row"><h2>Prompt</h2><button class="tiny-btn" data-copy-text="${escapeAttr(prompt)}">Copy</button></div><p>${escapeHtml(prompt)}</p></section>
        ${negative ? `<section class="detail-card"><div class="section-title-row"><h2>Negative Prompt</h2><button class="tiny-btn" data-copy-text="${escapeAttr(negative)}">Copy</button></div><p>${escapeHtml(negative)}</p></section>` : ""}
        <div class="two-col">
          <section class="detail-card">
            <h2>Model / Checkpoint</h2>
            <div class="model-stack">
              ${checkpoint ? `<div class="model-row"><div class="checkpoint-art">${escapeHtml(checkpoint.name.slice(0, 2))}</div><div><strong>${escapeHtml(checkpoint.name)}</strong><span>${escapeHtml(checkpoint.base)} / ${escapeHtml(checkpoint.type)}</span></div></div>` : `<p class="empty-state">No checkpoint metadata was stored with this image.</p>`}
              ${loraRows.length ? loraRows.map((lora) => `<div class="model-row"><div class="checkpoint-art">${escapeHtml(lora.name.slice(0, 2))}</div><div><strong>${escapeHtml(lora.name)}</strong><span>${escapeHtml(lora.trigger)}</span></div></div>`).join("") : `<p class="empty-state">No LoRAs selected for this image session.</p>`}
            </div>
          </section>
          <section class="detail-card">
            <h2>Generation Settings</h2>
            ${(selected.settings && Object.keys(selected.settings).length)
              ? Object.entries(selected.settings).map(([label, value]) => `<div class="settings-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("")
              : `<p class="empty-state">No generation settings stored yet. Add them in the image notes if you want this panel filled.</p>`}
          </section>
        </div>
        <section class="detail-card"><h2>Notes</h2><p>${escapeHtml(selected.notes || selected.prompt || "No notes stored for this result.")}</p></section>
        <section class="detail-card"><h2>Your Rating</h2><p>How would you rate this result?</p><div class="star-row">${Array.from({ length: 5 }, (_, i) => `<b class="${i < Number(selected.rating || 0) ? "on" : ""}" role="button" tabindex="0" data-rate-memory="${escapeAttr(selected.id)}" data-score="${i + 1}">&#9733;</b>`).join("")}</div></section>
      </aside>
    </div>`;
}

function titleFromPrompt(prompt) {
  const terms = extractPromptTerms(prompt).slice(0, 4);
  return terms.length ? terms.map((term) => term.replace(/^\w/, (char) => char.toUpperCase())).join(" ") : "";
}

function lineSvg(values, width, height, className = "trend") {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return "";
  const coords = nums.map((score, index) => {
    const x = nums.length === 1 ? width / 2 : (index / (nums.length - 1)) * width;
    const y = height - ((score - 1) / 4) * (height - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${className} chart"><polyline points="${coords}"></polyline>${coords.split(" ").map((point) => { const [x, y] = point.split(","); return `<circle cx="${x}" cy="${y}" r="2.4"></circle>`; }).join("")}</svg>`;
}

function renderTrainingRules() {
  if (!els.trainingList) return;
  els.trainingList.innerHTML = "";
  if (!state.trainingRules.length) {
    els.trainingList.innerHTML = `<p class="meta">No training rules yet. Use feedback on generated prompts or add a rule manually.</p>`;
    return;
  }

  state.trainingRules.slice().reverse().forEach((rule) => {
    const card = document.createElement("article");
    card.className = `training-card ${rule.sentiment === "like" ? "is-like" : "is-dislike"}`;
    card.innerHTML = `
      <strong>${escapeHtml(rule.trigger || "general")}</strong>
      <p><span class="meta">Avoid:</span> ${escapeHtml(rule.avoid || "none")}</p>
      <p><span class="meta">Prefer:</span> ${escapeHtml(rule.prefer || "none")}</p>
      <div class="copy-row">
        <button class="tiny-btn" data-use-training="${rule.id}">Use in workspace</button>
        <button class="tiny-btn" data-delete-training="${rule.id}">Delete</button>
      </div>`;
    els.trainingList.append(card);
  });
}

/* ---------- Phase 8 offline engine ---------- */

const engineRuntime = {
  ready: false,
  loading: null,
  catalog: null,
  aliasIndex: null,
  fingerprint: "",
  error: ""
};

function engineModulesPresent() {
  return !!(globalThis.PromptBrainEngine && globalThis.PromptBrainArtDirector && globalThis.PromptBrainCatalogStore);
}

function engineReady() {
  return engineRuntime.ready && engineModulesPresent();
}

// Alias -> conceptId, so a UI tag can become a locked requirement instead of a
// loose string appended to the end of the prompt.
function buildEngineAliasIndex() {
  const index = new Map();
  globalThis.PromptBrainEngine.ALL_CONCEPTS.forEach((concept) => {
    (concept.aliases || []).forEach((alias) => {
      const key = globalThis.PromptBrainEngine.normalizeForMatch(alias);
      if (key && !index.has(key)) index.set(key, concept.id);
    });
  });
  return index;
}

async function ensureEngineCatalog() {
  if (engineRuntime.ready) return true;
  if (!engineModulesPresent()) {
    engineRuntime.error = "Engine modules are not loaded.";
    return false;
  }
  if (!engineRuntime.loading) {
    engineRuntime.loading = (async () => {
      try {
        const store = globalThis.PromptBrainCatalogStore;
        const catalog = await store.loadFromUrl("./catalog");
        store.register(catalog, {
          engine: globalThis.PromptBrainEngine,
          artDirector: globalThis.PromptBrainArtDirector
        });
        engineRuntime.catalog = catalog;
        engineRuntime.fingerprint = catalog.fingerprint;
        engineRuntime.aliasIndex = buildEngineAliasIndex();
        catalogLoraKb = buildCatalogLoraKnowledge(catalog);
        state.builder.selectedLoras = state.builder.selectedLoras.filter((name) =>
          catalogLoraKb.some((lora) => lora.name === name && lora.mapped));
        state.engine.source = "embedded-phase-8-catalog";
        state.engine.fingerprint = catalog.fingerprint;
        state.engine.loadedAt = Date.now();
        try {
          const statusResponse = await fetch("/api/status", {
            cache: "no-store",
            headers: apiClientHeaders
          });
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            state.engine.dataRoot = status.dataRoot || "";
            state.engine.statePath = status.statePath || "";
          }
        } catch {
          // Browser-only preview has no native status endpoint.
        }
        engineRuntime.ready = true;
        engineRuntime.error = "";
        saveState({ render: false });
        renderBuilder();
        renderModelLibrary();
        renderEngineStatus();
        return true;
      } catch (error) {
        engineRuntime.error = error?.message || String(error);
        renderEngineStatus();
        return false;
      } finally {
        engineRuntime.loading = null;
      }
    })();
  }
  return engineRuntime.loading;
}

function engineConceptIdForTag(tag) {
  if (!engineRuntime.aliasIndex) return "";
  const key = globalThis.PromptBrainEngine.normalizeForMatch(tag);
  return (key && engineRuntime.aliasIndex.get(key)) || "";
}

// The engine reads memoryScores by concept id or label, and buildMemory already
// returns scored terms, so learned preferences map straight across. Memory only
// reranks optional choices; it can never outrank a locked requirement.
function engineMemoryScores() {
  const pull = { strong: 1.6, medium: 1, light: 0.5 }[els.learningPull.value] ?? 1;
  return globalThis.PromptBrainLearningBridge.memoryScoresFrom(buildMemory().slice(0, 120), {
    pull,
    resolveConceptId: engineConceptIdForTag
  });
}

function applyEngineTraining(input, intent, memoryScores) {
  return globalThis.PromptBrainLearningBridge.applyTraining(
    getMatchingTrainingRules(input),
    intent,
    memoryScores,
    { extractTerms: extractPromptTerms, resolveConceptId: engineConceptIdForTag }
  );
}

// Everything the user chose explicitly. Resolved tags become locked concepts;
// unresolved ones are kept verbatim so a selection is never silently dropped.
function engineExplicitSelections() {
  const resolved = [];
  const literalBlocks = {};
  const blockByCategory = {
    Style: "style",
    Quality: "quality",
    Character: "subject",
    Act: "action",
    Pose: "pose",
    Expression: "expression",
    Clothing: "wardrobe",
    Hair: "anatomy",
    Environment: "environment",
    Lighting: "lighting",
    "Camera/Composition": "camera",
    "Color Palette": "palette"
  };
  selectedBuilderTags().forEach(({ category, tag }) => {
    if (category === "Negative") return;
    const conceptId = engineConceptIdForTag(tag);
    if (conceptId) resolved.push({ conceptId, tag });
    else {
      const block = blockByCategory[category] || "effects";
      literalBlocks[block] ||= [];
      literalBlocks[block].push(formatTagForCheckpoint(tag, category));
    }
  });
  return { resolved, literalBlocks };
}

function randomGenerationSeed() {
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return Number((BigInt(random[0]) << 21n) ^ BigInt(random[1])) % Number.MAX_SAFE_INTEGER;
}

function referencePromptContext() {
  if (!els.useReferenceToggle?.checked) return [];
  return state.references.slice(-3).flatMap((item) => [item.notes, item.analysis?.summary]).filter(Boolean);
}

function researchPromptContext() {
  if (!els.useResearchToggle?.checked) return [];
  return state.researchNotes.slice(-3).flatMap((item) => item.ideas?.length ? item.ideas.slice(0, 6) : extractResearchIdeas(item.text).slice(0, 6));
}

function captureBuilderSnapshot() {
  return JSON.parse(JSON.stringify({
    ...state.builder,
    draft: els.userPrompt?.value || state.builder.draft || "",
    useLocalAi: !!els.useLocalAiToggle?.checked,
    useResearch: !!els.useResearchToggle?.checked,
    useReferences: els.useReferenceToggle?.checked !== false,
    learningPull: els.learningPull?.value || "strong"
  }));
}

function buildPromptPackEngine(input, buildOptions = {}) {
  const engine = globalThis.PromptBrainEngine;
  const rule = activeCheckpointRule();
  const contentMode = state.builder.contentMode === "adult" ? "adult" : "sfw";
  const character = selectedCharacterPrompt();
  const selections = engineExplicitSelections();

  // The character selection is part of the request: the engine resolves identity
  // from text, and this keeps a chosen character explicit rather than inferred.
  const requestText = cleanPromptParts([
    input,
    ...character,
    ...referencePromptContext(),
    ...researchPromptContext()
  ]).join(", ") || input;

  const intent = engine.parseIntent(requestText, {
    checkpointId: rule.id,
    contentMode,
    vibe: state.builder.vibe || "Free",
    seed: Number.isSafeInteger(buildOptions.seed) ? buildOptions.seed : randomGenerationSeed()
  });

  // Locked selections are applied before the recipe runs, so art direction fills
  // only what the user left open.
  selections.resolved.forEach(({ conceptId, tag }) => {
    if (intent.directives.required.some((item) => item.conceptId === conceptId)) return;
    intent.directives.required.push({ conceptId, score: 1000, matchedAlias: `selected '${tag}'` });
  });

  // Training is applied after explicit selections are locked in, so it can see what
  // the user asked for and stand down on those concepts.
  const memoryScores = engineMemoryScores();
  const training = applyEngineTraining(input, intent, memoryScores);

  const selectedNegative = selectedBuilderTags()
    .filter((item) => item.category === "Negative")
    .map((item) => item.tag);
  const negativePrompt = cleanPromptParts([
    state.settings.negativePrompt || defaultNegative,
    state.builder.customNegative || "",
    ...selectedNegative
  ]).join(rule.separator || ", ");
  const options = {
    checkpointId: rule.id,
    contentMode,
    memoryScores,
    literalBlocks: selections.literalBlocks,
    styleTokens: selectedStyleTokenObjects().map((token) => token.prompt),
    loras: selectedLoraObjects().map((lora) => loraCommand(lora)),
    includeQualityPrefix: true,
    useBreak: state.settings.useBreak !== false,
    includeNegative: state.settings.enableNegativePrompt === true,
    negativePrompt
  };
  const plan = engine.planScene(intent, options);
  const compiled = engine.compilePrompt(plan, options);
  const positive = compiled.positive.trim();
  const negative = compiled.negative.trim();
  const artifactId = buildOptions.artifactId || crypto.randomUUID();
  const builderSnapshot = captureBuilderSnapshot();
  const selectedTags = selectedBuilderTags().map((item) => ({ ...item }));
  const loraCommands = selectedLoraObjects().map((lora) => loraCommand(lora));
  const text = negative
    ? `POSITIVE PROMPT\n${positive}\n\nNEGATIVE PROMPT\n${negative}`
    : `POSITIVE PROMPT\n${positive}`;

  return {
    artifactId,
    request: buildOptions.originalInput || input,
    positive,
    negative,
    text,
    checkpointId: rule.id,
    checkpointName: rule.name,
    vibe: state.builder.vibe,
    loras: loraCommands,
    selectedTags,
    builderSnapshot,
    sessionId: activeChatId,
    generatedAt: Date.now(),
    source: buildOptions.source || "offline-engine",
    engine: {
      fingerprint: engineRuntime.fingerprint,
      seed: plan.seed,
      artRecipe: plan.artRecipe?.recipe?.id || plan.artRecipe?.id || "",
      lockedConcepts: plan.locked.slice(),
      rejected: plan.rejected.map((item) => ({ id: item.conceptId, reason: item.reason })),
      warnings: plan.warnings.slice(),
      estimatedTokens: compiled.estimatedTokens,
      training
    }
  };
}

function buildPromptPack(input) {
  if (!engineReady()) {
    throw new Error(engineRuntime.error || "The offline prompt engine is still loading.");
  }
  return buildPromptPackEngine(input);
}

function addVersion(label, text, pack = null) {
  state.versions.push({
    id: crypto.randomUUID(),
    chatId: activeChatId,
    label,
    text,
    pack,
    createdAt: Date.now()
  });
}

function renderSidebarSessions() {
  if (!els.sidebarSessions) return;
  const recent = state.chats.slice(0, 8);
  els.sidebarSessions.innerHTML = recent.length ? recent.map((chat) => `
    <button class="session-link ${chat.id === activeChatId ? "is-active" : ""}" data-open-chat="${escapeAttr(chat.id)}">
      <span>${escapeHtml(shorten(chat.title || "New Session", 24))}</span>
      <small>${timeAgo(chat.createdAt)}</small>
    </button>`).join("") : `<p class="empty-state">No sessions yet.</p>`;
}

function timeAgo(time) {
  const diff = Math.max(1, Date.now() - Number(time || Date.now()));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes || 1}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function recordPromptUsage(pack) {
  const rule = activeCheckpointRule();
  const historyId = crypto.randomUUID();
  const artifactId = pack.artifactId || crypto.randomUUID();
  pack.artifactId = artifactId;
  state.usageStats.totalPrompts += 1;
  state.usageStats.vibeUsage[state.builder.vibe] = (state.usageStats.vibeUsage[state.builder.vibe] || 0) + 1;
  state.usageStats.checkpointUsage[rule.id] = (state.usageStats.checkpointUsage[rule.id] || 0) + 1;
  selectedLoraObjects().forEach((lora) => {
    state.usageStats.loraUsage[lora.name] = (state.usageStats.loraUsage[lora.name] || 0) + 1;
  });
  const tags = selectedBuilderTags().map((item) => item.tag);
  state.usageStats.history.unshift({
    id: historyId,
    artifactId,
    sessionId: activeChatId,
    prompt: pack.positive,
    negative: pack.negative,
    checkpointId: rule.id,
    vibe: state.builder.vibe,
    loras: selectedLoraObjects().map((lora) => lora.name),
    tags: tags.length ? tags : extractPromptTerms(pack.positive).slice(0, 40),
    selectedTags: pack.selectedTags || [],
    builderSnapshot: pack.builderSnapshot || captureBuilderSnapshot(),
    engine: pack.engine || null,
    createdAt: Date.now(),
    rating: 0
  });
  state.usageStats.history = state.usageStats.history.slice(0, 50);
  return historyId;
}

function recordFeedback(pack, score, historyId = "") {
  const artifactId = pack?.artifactId || "";
  const historyItem = historyId
    ? state.usageStats.history.find((item) => item.id === historyId)
    : state.usageStats.history.find((item) =>
      (artifactId && item.artifactId === artifactId) ||
      (pack?.historyId && item.id === pack.historyId));
  const key = historyItem?.artifactId || artifactId || historyItem?.id || "";
  const previous = Number((key && state.usageStats.feedbackByArtifact[key]) ?? historyItem?.rating ?? 0);
  const next = Math.max(1, Math.min(5, Number(score) || 0));
  const bucket = (value) => value >= 4 ? "good" : value > 0 ? "bad" : "";
  const oldBucket = bucket(previous);
  const newBucket = bucket(next);
  if (oldBucket !== newBucket) {
    if (oldBucket === "good") state.usageStats.feedbackGood = Math.max(0, state.usageStats.feedbackGood - 1);
    if (oldBucket === "bad") state.usageStats.feedbackBad = Math.max(0, state.usageStats.feedbackBad - 1);
    if (newBucket === "good") state.usageStats.feedbackGood += 1;
    if (newBucket === "bad") state.usageStats.feedbackBad += 1;
  }
  const terms = historyItem?.tags?.length
    ? historyItem.tags
    : selectedBuilderTags().map((item) => item.tag).length
    ? selectedBuilderTags().map((item) => item.tag)
    : extractPromptTerms(pack?.positive || pack?.text || "");
  const contribution = (value) => value >= 4 ? value : value > 0 ? -1 : 0;
  const delta = contribution(next) - contribution(previous);
  if (delta) terms.forEach((tag) => {
    state.usageStats.tagScores[tag] = (state.usageStats.tagScores[tag] || 0) + delta;
  });
  const latest = historyItem || state.usageStats.history.find((item) => item.prompt === pack?.positive);
  if (latest) latest.rating = next;
  if (key) state.usageStats.feedbackByArtifact[key] = next;
  if (pack) pack.rating = next;
  return next;
}

function latestPromptText() {
  const chat = activeChat();
  const latest = chat.messages.slice().reverse().find((message) => message.promptPack);
  return latest?.text || state.versions.at(-1)?.text || "";
}

function makeVariation(base, instruction) {
  const positive = parsePromptText(base, { positive: base, negative: state.settings.negativePrompt || defaultNegative }).positive;
  const negative = parsePromptText(base, { positive: base, negative: state.settings.negativePrompt || defaultNegative }).negative;
  const terms = positive.split(",").map((part) => part.trim()).filter(Boolean);
  const transforms = {
    "more cinematic": ["cinematic lighting", "film still", "dramatic shadows", "depth of field", "strong composition"],
    "more detailed": ["intricate details", "detailed fabric", "high frequency texture", "carefully rendered accessories"],
    "change pose": ["new dynamic pose", "clear body gesture", "asymmetrical stance", "expressive hands"],
    "change outfit": ["redesigned outfit", "layered clothing", "distinct materials", "signature accessory"],
    "stronger lighting": ["bold rim light", "clear key light", "volumetric lighting", "controlled contrast"],
    "less busy": ["clean composition", "simple readable background", "focused subject", "reduced clutter"],
    "more realistic": ["photorealistic", "natural proportions", "realistic skin texture", "real fabric behavior"],
    "anime tag style": ["anime style", "1girl", "clean lineart", "expressive eyes", "dynamic angle"]
  };
  const removeForLessBusy = instruction === "less busy" ? ["cluttered", "busy background", "many details", "crowded"] : [];
  const next = unique([...terms.filter((term) => !removeForLessBusy.includes(term.toLowerCase())), ...(transforms[instruction] || [instruction])]);
  const pack = {
    positive: next.join(", "),
    negative,
    text: `POSITIVE PROMPT\n${next.join(", ")}\n\nNEGATIVE PROMPT\n${negative}`
  };
  return pack;
}

function cleanPromptText(text) {
  const parsed = parsePromptText(text, { positive: text, negative: "" });
  const cleanList = (value) => unique(value
    .replace(/\b(masterpiece|best quality)\b/gi, (match) => match.toLowerCase())
    .split(/[,;\n]+/)
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter((part) => part.length > 1)
    .filter((part) => !/^(and|with|the)$/i.test(part)));
  const positive = cleanList(parsed.positive).join(", ");
  const negative = cleanList(parsed.negative).join(", ");
  return negative ? `POSITIVE PROMPT\n${positive}\n\nNEGATIVE PROMPT\n${negative}` : `POSITIVE PROMPT\n${positive}`;
}

async function buildPromptPackSmart(input) {
  const seed = randomGenerationSeed();
  const fallback = buildPromptPackEngine(input, { seed, originalInput: input });
  if (!els.useLocalAiToggle.checked) {
    return fallback;
  }

  const rule = activeCheckpointRule();
  const memory = buildMemory().slice(0, 24).map((item) => item.term).join(", ");
  const prompt = `Expand this image request into one concise scene-direction paragraph for a local deterministic prompt engine.
Do not write quality tags, model tags, LoRA syntax, headings, a negative prompt, or commentary.
Preserve every explicit subject, identity, action, number of participants, pose, environment, and camera request.
Only fill details the user left open. Do not replace a generic fantasy species with a named franchise character.
Checkpoint family: ${rule.base} / ${rule.type}.
User request: ${input}
Optional learned preferences: ${memory || "none"}
Optional saved reference notes: ${referencePromptContext().join("; ") || "none"}`;

  try {
    const response = await fetch("/api/ollama", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiClientHeaders },
      body: JSON.stringify({
        model: state.settings.ollamaModel || "qwen2.5:7b",
        prompt,
        stream: false
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    const refinement = String(data.response || "")
      .replace(/(?:positive|negative)\s+prompt\s*:?/gi, " ")
      .replace(/<lora:[^>]+>/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!refinement) throw new Error("Empty local AI response");
    return buildPromptPackEngine(`${input}, ${refinement}`, {
      seed,
      originalInput: input,
      source: "offline-engine+local-ai"
    });
  } catch (error) {
    console.warn("Local AI assist unavailable", error);
    toast("Local AI did not answer. The offline engine completed the prompt.");
    return fallback;
  }
}

async function buildOc() {
  const seed = els.ocSeedInput.value.trim();
  if (!seed) {
    toast("Give it a seed prompt first.");
    return;
  }

  const world = els.ocWorldInput.value.trim() || "original setting";
  const style = els.ocStyleInput.value;
  const memory = buildMemory().slice(0, 18).map((item) => item.term);
  const terms = unique([...extractTerms(seed), ...memory]);
  const name = makeName(seed);
  const vibe = terms.slice(0, 8).join(", ");
  const pack = await buildPromptPackSmart(`${name}, ${seed}, ${world}, original character, ${style}`);
  const prompt = pack.positive;

  const sheet = `${name}

Core idea:
An original ${style} character built from: ${seed}

World:
${world}

Visual identity:
${vibe}

Design anchors:
- Signature silhouette: ${pick(terms, 0, "striking silhouette")}
- Pose language: ${pick(terms, 3, "confident relaxed pose")}
- Expression: ${pick(terms, 5, "controlled expression")}
- Outfit logic: layered details, readable shapes, clear materials
- Color direction: ${suggestPalette(seed)}

Personality:
Confident surface, private motive, one visible contradiction that makes the design feel alive.

ComfyUI character prompt:
${prompt}

Negative prompt:
${state.settings.negativePrompt || defaultNegative}`;

  els.ocOutput.innerHTML = `<pre>${escapeHtml(sheet)}</pre><div class="copy-row"><button class="tiny-btn" id="copyOcBtn">Copy OC Sheet</button><button class="tiny-btn" id="learnOcBtn">Teach From OC</button></div>`;
  $("#copyOcBtn").addEventListener("click", () => copyText(sheet));
  $("#learnOcBtn").addEventListener("click", () => {
    addLiked({ prompt: sheet, tags: `OC, ${style}, ${world}`, rating: 5 });
    toast("OC saved into learning memory.");
  });
}

async function runResearch() {
  const q = els.researchQuery.value.trim();
  if (!q) {
    toast("Type something to research.");
    return;
  }

  els.researchResults.innerHTML = `<p class="meta">Searching...</p>`;
  try {
    const response = await fetch(`/api/research?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      headers: apiClientHeaders
    });
    const data = await response.json();
    const results = data.results || [];
    const notes = results.map((item) => `${item.title}. ${item.snippet}`).join("\n");
    if (notes) {
      state.researchNotes.push({ id: crypto.randomUUID(), query: q, text: notes, ideas: extractResearchIdeas(notes), createdAt: Date.now() });
      saveState();
    }
    els.researchResults.innerHTML = results.length
      ? `<article class="result"><strong>Extracted ideas</strong><div class="memory-cloud">${extractResearchIdeas(notes).map((idea) => `<span class="chip">${escapeHtml(idea)}</span>`).join("")}</div></article>` + results.map((item) => `<article class="result"><a href="${escapeAttr(item.url)}" target="_blank">${escapeHtml(item.title)}</a><p>${escapeHtml(item.snippet || "")}</p></article>`).join("")
      : `<p class="meta">No snippets came back. Paste notes manually and save them.</p>`;
    toast("Research notes saved.");
  } catch (error) {
    els.researchResults.innerHTML = `<p class="meta">Research failed. Check internet, or paste manual notes.</p>`;
  }
}

function buildMemory() {
  const scores = new Map();
  const feed = [];
  state.liked.forEach((item) => {
    const weight = Number(item.rating || 4);
    feed.push({ text: `${item.prompt || ""} ${item.tags || ""} ${item.notes || ""}`, weight });
  });
  state.references.forEach((item) => {
    feed.push({ text: `${item.analysis?.summary || ""} ${(item.analysis?.colors || []).join(" ")} ${item.notes || ""}`, weight: 4 });
  });
  state.profiles.forEach((item) => {
    feed.push({ text: `${item.name} ${item.description} ${item.tags}`, weight: 4 });
  });
  state.loras.forEach((item) => {
    feed.push({ text: `${item.name} ${item.tags} ${item.notes}`, weight: 3 });
  });
  state.trainingRules.forEach((item) => {
    feed.push({ text: `${item.trigger} ${item.prefer}`, weight: item.sentiment === "like" ? 5 : 4 });
  });
  if (state.settings.learnFromResearch !== false) {
    state.researchNotes.forEach((note) => feed.push({ text: note.text, weight: 2 }));
  }
  state.chats.forEach((chat) => chat.messages.forEach((message) => {
    if (state.settings.learnFromChats !== false && message.rating && message.rating >= 4) feed.push({ text: message.text, weight: message.rating });
  }));
  // Result Lab ratings. Without this, rating a variant or picking a comparison
  // winner changes nothing about later generations.
  if (state.settings.learnFromVersions !== false) {
    state.versions.forEach((item) => {
      const rating = Number(item.rating || item.pack?.rating || 0);
      if (rating >= 4) feed.push({ text: item.text || item.pack?.positive || "", weight: rating });
    });
  }

  feed.forEach(({ text, weight }) => {
    extractTerms(text).forEach((term) => scores.set(term, (scores.get(term) || 0) + weight));
  });

  return Array.from(scores.entries())
    .map(([term, score]) => ({ term, score }))
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
}

function extractTerms(text) {
  const stop = new Set("the and with from that this into your you are for but not can very more like prompt positive negative quality image picture style make made want will have has she he they them then than there where what when about".split(" "));
  return unique(String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9, -]/g, " ")
    .split(/[,.\n;|]+|\s{2,}/)
    .flatMap((chunk) => {
      const clean = chunk.trim().replace(/\s+/g, " ");
      const words = clean.split(" ").filter((word) => word.length > 2 && !stop.has(word));
      const phrases = [];
      if (clean.length > 3 && clean.length < 42 && words.length) phrases.push(clean);
      words.forEach((word) => phrases.push(word));
      return phrases;
    }))
    .filter((term) => term.length > 2 && term.length < 42);
}

function cleanUserIntent(text) {
  let cleaned = String(text || "").toLowerCase();
  cleaned = cleaned
    .replace(/[.!?]+/g, ",")
    .replace(/\b(please|pls|hey|hi|hello)\b/g, " ")
    .replace(/\b(can you|could you|would you|i need you to|i want you to|i would like you to)\b/g, " ")
    .replace(/\b(i want|i need|i would like|i'd like|make it|make this)\b/g, " ")
    .replace(/\b(generate|make|create|write|give|build|craft|produce)\s+(me\s+)?(a\s+|an\s+|some\s+)?/g, " ")
    .replace(/\b(prompt|prompts)\s+(for|of|about)\b/g, " ")
    .replace(/\b(for|of|about)\s+(a\s+|an\s+)?(prompt|image|picture|pic|artwork|generation)\b/g, " ")
    .replace(/\b(comfyui|stable diffusion|sdxl|sd 1\.5)\s+(prompt|image|generation)?\b/g, " ")
    .replace(/\b(prompt|image|picture|pic|artwork|generation)\s+(of|for|about)\b/g, " ")
    .replace(/\b(prompt|image|picture|pic|artwork|generation)\b/g, " ")
    .replace(/\b(amazing|awesome|cool|nice|good|great)\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "");

  cleaned = cleaned.replace(/^(with|for|about|of|featuring|showing|include|including|a|an|the)\s+/g, "");

  return cleaned || String(text || "").trim().replace(/\s+/g, " ");
}

function extractPromptTerms(text) {
  const subject = cleanUserIntent(text);
  const terms = extractTerms(subject);
  const wordsInPhrases = new Set();
  terms.forEach((term) => {
    if (term.includes(" ")) {
      term.split(" ").forEach((word) => wordsInPhrases.add(word));
    }
  });
  return terms.filter((term) => term.includes(" ") || !wordsInPhrases.has(term));
}

function cleanPromptParts(parts) {
  const normalized = unique(parts)
    .map((part) => normalizePromptPhrase(part))
    .filter(Boolean);
  const phraseWords = new Set();
  normalized.forEach((part) => {
    if (part.includes(" ")) {
      part.toLowerCase().split(" ").forEach((word) => phraseWords.add(word));
    }
  });
  return normalized.filter((part, index) => {
    const lower = part.toLowerCase();
    if (index === 0) return true;
    if (!part.includes(" ") && phraseWords.has(lower)) return false;
    if (/^(generate|make|create|prompt|image|picture|comfyui|with|amazing|awesome|cool|nice)$/i.test(part)) return false;
    if (normalized.slice(0, index).some((earlier) => earlier.toLowerCase() === lower || earlier.toLowerCase().includes(lower))) return false;
    return true;
  });
}

function normalizePromptPhrase(part) {
  const raw = String(part || "").trim();
  if (raw.toUpperCase() === "BREAK") return "BREAK";
  return raw
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\b(generate|make|create|write|give|build|craft|produce)\b/g, " ")
    .replace(/\b(prompt|image|picture|pic|artwork|generation)\b/g, " ")
    .replace(/\b(amazing|awesome|cool|nice|good|great)\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .replace(/^(with|for|about|of|featuring|showing|include|including|a|an|the)\s+/g, "")
    .trim();
}

function sanitizePromptPack(pack, fallback = {}) {
  const rule = activeCheckpointRule();
  const positiveParts = cleanPromptParts(String(pack.positive || "")
    .replace(/positive prompt/ig, "")
    .split(/[,;\n]+/));
  const negativeParts = cleanPromptParts(String(pack.negative || defaultNegative)
    .replace(/negative prompt/ig, "")
    .split(/[,;\n]+/));
  const selectedTriggers = selectedLoraObjects().map((lora) => loraCommand(lora));
  const selectedTokens = selectedStyleTokenObjects().map((token) => token.prompt);
  const tagParts = rule.promptStyle === "natural_language"
    ? positiveParts
    : cleanPromptParts([...qualityPrefixForRule(rule), ...positiveParts, ...rule.qualitySuffix]);
  const positive = unique([...selectedTokens, ...tagParts, ...selectedTriggers]).join(rule.separator || ", ");
  const negative = "";
  return {
    positive,
    negative,
    text: `POSITIVE PROMPT\n${positive}\n\nNEGATIVE PROMPT\n${negative}`,
    checkpointId: rule.id,
    checkpointName: rule.name,
    vibe: state.builder.vibe,
    loras: selectedTriggers,
    source: "local-ai"
  };
}

function extractResearchIdeas(text) {
  const terms = extractTerms(text);
  const useful = terms.filter((term) => {
    const t = term.toLowerCase();
    return /(pose|gesture|stance|angle|view|shot|lens|light|shadow|style|painting|photo|portrait|dynamic|kneel|sit|stand|lean|turn|profile|outfit|armor|dress|hair|cinematic|baroque|gothic|cyber|fantasy|realistic|anime|composition|palette|color)/.test(t);
  });
  return unique(useful).slice(0, 40);
}

function addLiked(item) {
  const existing = state.liked.find((entry) =>
    (item.id && entry.id === item.id) ||
    (item.artifactId && entry.artifactId === item.artifactId) ||
    (item.image && entry.image === item.image && entry.prompt === (item.prompt || "")));
  const next = {
    id: item.id || existing?.id || crypto.randomUUID(),
    artifactId: item.artifactId || existing?.artifactId || "",
    sessionId: item.sessionId || existing?.sessionId || activeChatId,
    image: item.image || "",
    prompt: item.prompt || "",
    negative: item.negative || "",
    notes: item.notes || "",
    tags: item.tags || "",
    checkpointId: item.checkpointId || state.builder.checkpointId,
    loras: item.loras || selectedLoraObjects().map((lora) => lora.name),
    rating: Number(item.rating || 5),
    createdAt: Date.now()
  };
  if (existing) Object.assign(existing, next);
  else state.liked.push(next);
  saveState();
  return next;
}

function addTrainingRule({ trigger, avoid, prefer, sentiment = "manual", example = "" }) {
  const cleanTrigger = cleanUserIntent(trigger || "").trim();
  const cleanAvoid = cleanPromptParts(String(avoid || "").split(/[,;\n]+/)).join(", ");
  const cleanPrefer = cleanPromptParts(String(prefer || "").split(/[,;\n]+/)).join(", ");
  state.trainingRules.push({
    id: crypto.randomUUID(),
    trigger: cleanTrigger || "general",
    avoid: cleanAvoid,
    prefer: cleanPrefer,
    sentiment,
    example,
    createdAt: Date.now()
  });
  saveState();
}

function getMatchingTrainingRules(input) {
  if (state.settings.autoTraining === false) return [];
  const subject = cleanUserIntent(input);
  const subjectTerms = new Set(extractPromptTerms(subject));
  return state.trainingRules.filter((rule) => {
    const trigger = cleanUserIntent(rule.trigger || "");
    if (trigger === "general") return true;
    if (subject.includes(trigger)) return true;
    return extractPromptTerms(trigger).some((term) => subjectTerms.has(term) || subject.includes(term));
  }).slice(-(Number(state.settings.maxTrainingRules) || 12));
}

function trainFromPrompt(message, sentiment) {
  const source = activeChat().messages.slice(0, activeChat().messages.indexOf(message)).reverse().find((item) => item.role === "user")?.text || "";
  if (sentiment === "like") {
    if (message.promptPack) recordFeedback(message.promptPack, 5);
    addTrainingRule({
      trigger: cleanUserIntent(source || message.promptPack?.positive || ""),
      avoid: "",
      prefer: message.promptPack?.positive || message.text,
      sentiment: "like",
      example: message.text
    });
    addLiked({ ...(message.promptPack || {}), prompt: message.promptPack?.positive || message.text, tags: "liked training", rating: 5 });
    toast("Saved as a liked training example.");
    return;
  }

  const wrong = prompt("What exactly did you not like?");
  if (wrong === null) return;
  const better = prompt("What should it do instead next time?");
  if (better === null) return;
  if (message.promptPack) recordFeedback(message.promptPack, 2);
  addTrainingRule({
    trigger: cleanUserIntent(source || message.promptPack?.positive || ""),
    avoid: wrong,
    prefer: better,
    sentiment: "dislike",
    example: message.text
  });
  toast("Training rule saved.");
}

function wireEvents() {
  $("#newChatBtn").addEventListener("click", () => {
    createChat();
  });
  els.sidebarNewSessionBtn?.addEventListener("click", () => $("#newChatBtn")?.click());
  els.homeLogoBtn?.addEventListener("click", () => $(`.nav-btn[data-view="chatView"]`)?.click());
  els.sidebarToggle?.addEventListener("click", () => {
    state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
    saveState();
  });
  els.openSettingsBtn?.addEventListener("click", () => {
    els.settingsModal.hidden = false;
  });
  els.closeSettingsBtn?.addEventListener("click", () => {
    els.settingsModal.hidden = true;
  });
  els.themeSelect?.addEventListener("change", () => {
    state.settings.theme = els.themeSelect.value || "night-cyan";
    document.body.dataset.theme = state.settings.theme;
    saveState();
  });
  els.settingsModal?.addEventListener("click", (event) => {
    if (event.target === els.settingsModal) els.settingsModal.hidden = true;
  });
  [els.chatList, els.historyChatList, els.sidebarSessions].filter(Boolean).forEach((list) => list.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-chat]");
    const deleteButton = event.target.closest("[data-delete-chat]");

    if (openButton) {
      switchChat(openButton.dataset.openChat);
      return;
    }

    if (deleteButton) {
      deleteChat(deleteButton.dataset.deleteChat);
    }
  }));
  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => {
    $$(".nav-btn").forEach((item) => item.classList.remove("is-active"));
    $$(".view").forEach((item) => item.classList.remove("is-visible"));
    btn.classList.add("is-active");
    $(`#${btn.dataset.view}`).classList.add("is-visible");
    els.activeTitle.textContent = btn.textContent.trim();
  }));
  $$(".action-card[data-jump]").forEach((card) => card.addEventListener("click", () => {
    const target = card.dataset.jump;
    const button = $(`.nav-btn[data-view="${target}"]`);
    if (button) button.click();
  }));
  document.body.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-jump-button]");
    const copy = event.target.closest("[data-copy-text]");
    const tag = event.target.closest("[data-tag]");
    const weight = event.target.closest("[data-weight-chip]");
    const clear = event.target.closest("[data-clear-category]");
    const lora = event.target.closest("[data-lora]");
    const styleToken = event.target.closest("[data-style-token]");
    const character = event.target.closest("[data-character]");
    const checkpointCard = event.target.closest("[data-checkpoint-card]");
    const historyFeedback = event.target.closest("[data-history-feedback]");
    const selectImage = event.target.closest("[data-select-image]");
    const rateMemory = event.target.closest("[data-rate-memory]");
    const imageFavorite = event.target.closest("[data-image-favorite]");
    const memoryLearn = event.target.closest("[data-memory-learn]");
    const uploadMemory = event.target.closest("[data-upload-memory]");
    if (jump) {
      const button = $(`.nav-btn[data-view="${jump.dataset.jumpButton}"]`);
      if (button) button.click();
    }
    if (copy) {
      copyText(copy.dataset.copyText || "");
    }
    if (weight) {
      event.stopPropagation();
      const key = weight.dataset.weightChip;
      state.builder.tagWeights[key] = ((state.builder.tagWeights[key] || 0) + 1) % WEIGHT_STEPS.length;
      saveState();
    }
    if (tag && !weight) {
      const category = tag.dataset.category;
      const value = tag.dataset.tag;
      state.builder.selectedTags[category] ||= [];
      if (state.builder.selectedTags[category].includes(value)) {
        state.builder.selectedTags[category] = state.builder.selectedTags[category].filter((item) => item !== value);
        delete state.builder.tagWeights[`${category}:${value}`];
      } else {
        state.builder.selectedTags[category].push(value);
        state.builder.tagWeights[`${category}:${value}`] = 0;
      }
      saveState();
    }
    if (clear) {
      const category = clear.dataset.clearCategory;
      (state.builder.selectedTags[category] || []).forEach((tagName) => delete state.builder.tagWeights[`${category}:${tagName}`]);
      state.builder.selectedTags[category] = [];
      saveState();
    }
    if (lora) {
      const name = lora.dataset.lora;
      if (state.builder.selectedLoras.includes(name)) {
        state.builder.selectedLoras = state.builder.selectedLoras.filter((item) => item !== name);
        delete state.builder.loraWeights[name];
      } else {
        state.builder.selectedLoras.push(name);
        const picked = compatibleLoras(activeCheckpointRule()).find((item) => item.name === name);
        if (picked) state.builder.loraWeights[name] = picked.recommendedWeight;
      }
      saveState();
    }
    if (styleToken) {
      const id = styleToken.dataset.styleToken;
      if (state.builder.selectedStyleTokens.includes(id)) {
        state.builder.selectedStyleTokens = state.builder.selectedStyleTokens.filter((item) => item !== id);
      } else {
        state.builder.selectedStyleTokens.push(id);
      }
      saveState();
    }
    if (character) {
      state.builder.character = character.dataset.character;
      state.builder.characterQuery = "";
      saveState();
    }
    if (checkpointCard) {
      state.builder.checkpointId = checkpointCard.dataset.checkpointCard;
      state.builder.selectedLoras = state.builder.selectedLoras.filter((name) => compatibleLoras(activeCheckpointRule()).some((loraItem) => loraItem.name === name));
      saveState();
      $(`.nav-btn[data-view="chatView"]`)?.click();
    }
    if (historyFeedback) {
      const item = state.usageStats.history.find((entry) => entry.id === historyFeedback.dataset.historyFeedback);
      if (!item) return;
      recordFeedback({ positive: item.prompt, negative: item.negative }, Number(historyFeedback.dataset.score), item.id);
      saveState();
      toast(Number(historyFeedback.dataset.score) >= 4 ? "Liked. Tags moved up in Workspace." : "Feedback saved. Tags will be less favored.");
    }
    if (selectImage) {
      state.selectedImageId = selectImage.dataset.selectImage;
      saveState();
    }
    if (uploadMemory) {
      els.galleryImageInput?.click();
    }
    if (rateMemory) {
      const item = [...state.gallery, ...state.liked].find((entry) => entry.id === rateMemory.dataset.rateMemory);
      if (!item) return;
      item.artifactId ||= `image-${item.id}`;
      item.rating = Number(rateMemory.dataset.score);
      recordFeedback({
        artifactId: item.artifactId,
        positive: item.prompt || item.notes || "",
        selectedTags: item.selectedTags || []
      }, item.rating, item.historyId || "");
      saveState();
      toast(`Image rated ${item.rating}/5.`);
    }
    if (imageFavorite) {
      const item = [...state.gallery, ...state.liked].find((entry) => entry.id === imageFavorite.dataset.imageFavorite);
      if (!item) return;
      item.favorite = !item.favorite;
      if (item.favorite) addLiked({ ...item, rating: item.rating || 5 });
      else saveState();
      toast(item.favorite ? "Saved to liked results." : "Favorite removed.");
    }
    if (memoryLearn) {
      const item = [...state.gallery, ...state.liked].find((entry) => entry.id === memoryLearn.dataset.imageId);
      if (!item) return;
      const mode = memoryLearn.dataset.memoryLearn;
      item.learnMode = mode;
      item.artifactId ||= `image-${item.id}`;
      if (mode === "all") {
        recordFeedback({ artifactId: item.artifactId, positive: item.prompt || item.notes || "" }, 5, item.historyId || "");
        addLiked({ ...item, rating: item.rating || 5, tags: `${item.tags || ""}, full result memory` });
      } else if (mode === "style") {
        addLiked({ ...item, rating: item.rating || 5, tags: `${item.tags || ""}, style only` });
      } else if (mode === "failure") {
        const avoid = prompt("What exactly should PromptBrain avoid from this result?");
        if (avoid) addTrainingRule({ trigger: item.prompt || item.notes || "general", avoid, prefer: "", sentiment: "dislike", example: item.prompt || "" });
        else saveState();
      } else {
        saveState();
      }
      toast(mode === "none" ? "This image is excluded from learning." : "Image learning preference saved.");
    }
  });

  [els.checkpointSelect, els.vibeSelect, els.contentModeSelect, els.characterModeSelect, els.animeSeriesSelect].filter(Boolean).forEach((control) => {
    control.addEventListener("change", () => {
      state.builder.checkpointId = els.checkpointSelect.value;
      state.builder.vibe = els.vibeSelect.value;
      state.builder.contentMode = els.contentModeSelect.value;
      state.builder.characterMode = els.characterModeSelect.value;
      state.builder.animeSeries = els.animeSeriesSelect?.value || "All Anime";
      state.builder.character = "";
      state.builder.characterQuery = "";
      pruneBuilderSelections();
      state.builder.selectedLoras = state.builder.selectedLoras.filter((name) => compatibleLoras(activeCheckpointRule()).some((loraItem) => loraItem.name === name));
      state.builder.selectedStyleTokens = state.builder.selectedStyleTokens.filter((id) => compatibleStyleTokens(activeCheckpointRule()).some((token) => token.id === id));
      saveState();
    });
  });
  [els.userPrompt, els.customNegativeInput, els.characterSearch].filter(Boolean).forEach((control) => {
    control.addEventListener("input", () => {
      state.builder.customNegative = els.customNegativeInput?.value || "";
      if (control === els.characterSearch) {
        if (state.builder.characterMode === "manual") {
          state.builder.character = els.characterSearch.value || "";
        } else {
          state.builder.characterQuery = els.characterSearch.value || "";
        }
      }
      if (control === els.userPrompt) {
        state.builder.draft = els.userPrompt.value || "";
      }
      renderCharacterList();
      renderLivePrompt();
      saveState({ render: false });
    });
  });
  els.characterList?.addEventListener("change", () => {
    if (state.builder.characterMode === "manual") return;
    state.builder.character = els.characterList.value || "";
    saveState();
  });
  document.body.addEventListener("input", (event) => {
    const loraWeightInput = event.target.closest("[data-lora-weight]");
    if (loraWeightInput) {
      state.builder.loraWeights[loraWeightInput.dataset.loraWeight] = Number(loraWeightInput.value);
      renderLivePrompt();
      renderLoraPicker();
      renderModelLibrary();
      saveState({ render: false });
      return;
    }
    const search = event.target.closest("[data-category-search]");
    if (!search) return;
    const category = search.dataset.categorySearch;
    const value = search.value;
    state.builder.categorySearches[category] = value;
    saveState({ render: false });
    renderCategoryGrid();
    const next = document.querySelector(`[data-category-search="${CSS.escape(category)}"]`);
    if (next) {
      next.focus();
      next.setSelectionRange(value.length, value.length);
    }
  });
  els.copyPositiveLive?.addEventListener("click", () => copyText(els.positivePromptOutput.textContent || ""));
  els.copyNegativeLive?.addEventListener("click", () => copyText(els.negativePromptOutput.textContent || ""));

  $("#generateBtn").addEventListener("click", async () => {
    const input = els.userPrompt.value.trim();
    if (!input) {
      toast("Type what you want first.");
      return;
    }
    const button = $("#generateBtn");
    const originalButtonText = button.textContent;
    const chat = activeChat();
    if (chat.title === "New Chat") chat.title = shorten(input, 32);
    chat.messages.push({ role: "user", text: input });
    chat.messages.push({ role: "assistant", text: "Thinking..." });
    renderMessages();
    button.disabled = true;
    button.textContent = "...";
    try {
      const ready = await ensureEngineCatalog();
      if (!ready) throw new Error(engineRuntime.error || "The offline engine catalog did not load.");
      const pack = await buildPromptPackSmart(input);
      chat.messages.pop();
      const historyId = recordPromptUsage(pack);
      pack.historyId = historyId;
      chat.messages.push({ role: "assistant", text: pack.text, promptPack: pack, artifactId: pack.artifactId });
      addVersion("Generated", pack.text, pack);
      // Keep the request visible for iterative prompt work. Starting a new
      // session still creates a clean draft, but Generate no longer erases the
      // context the user is actively refining.
      state.builder.draft = input;
      saveState();
    } catch (error) {
      chat.messages.pop();
      console.error("Prompt generation failed", error);
      chat.messages.push({ role: "assistant", text: `Generation stopped: ${error.message || error}. No fallback prompt was substituted.` });
      saveState();
      toast("Generation stopped. Open Settings to see the engine status.");
    } finally {
      button.disabled = false;
      button.textContent = originalButtonText || "Generate Prompt";
    }
  });

  $(".suggestion-row")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-quick-variation]");
    if (!target) return;
    applyVariation(target.dataset.quickVariation, latestPromptText());
  });

  $("#makeCompareBtn")?.addEventListener("click", () => {
    const base = els.variationBaseInput.value.trim() || latestPromptText();
    if (!base) return toast("Generate or paste a base prompt first.");
    ["more cinematic", "stronger lighting", "less busy"].forEach((instruction) => applyVariation(instruction, base));
    $(`.nav-btn[data-view="variationsView"]`)?.click();
  });

  $$(".variation-grid [data-variation]").forEach((button) => button.addEventListener("click", () => {
    const base = els.variationBaseInput.value.trim() || latestPromptText();
    applyVariation(button.dataset.variation, base);
  }));

  // compareGrid is included here because Result Lab renders the same version
  // controls; without it the variant Use/Copy buttons and stars are inert.
  [els.versionList, els.historyVersionList, els.compareGrid].filter(Boolean).forEach((list) => list.addEventListener("click", (event) => {
    const use = event.target.closest("[data-use-version]");
    const copy = event.target.closest("[data-copy-version]");
    const del = event.target.closest("[data-delete-version]");
    const rate = event.target.closest("[data-rate-version]");
    if (rate) {
      const item = state.versions.find((version) => version.id === rate.dataset.rateVersion);
      if (item) {
        item.rating = Number(rate.dataset.score);
        // Feed the rating into learning: a comparison winner must influence later
        // optional choices, not just paint a star.
        recordFeedback(item.pack || { positive: item.text || "", negative: "" }, item.rating, item.pack?.historyId || "");
        if (item.rating >= 4) addLiked({ ...(item.pack || {}), prompt: item.pack?.positive || item.text, tags: `variant rated ${item.rating}`, rating: item.rating });
        saveState();
        renderAll();
        toast(`Rated ${item.rating}/5. PromptBrain will favour this direction.`);
      }
    }
    if (use) {
      const item = state.versions.find((version) => version.id === use.dataset.useVersion);
      if (item) els.userPrompt.value = item.pack?.positive || item.text;
      toast("Version added to chat box.");
    }
    if (copy) {
      const item = state.versions.find((version) => version.id === copy.dataset.copyVersion);
      if (item) copyText(item.text);
    }
    if (del) {
      state.versions = state.versions.filter((version) => version.id !== del.dataset.deleteVersion);
      saveState();
      toast("Version deleted.");
    }
  }));

  els.messages.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const chat = activeChat();
    const index = Number(target.dataset.rate ?? target.dataset.copy ?? target.dataset.learn ?? target.dataset.workflow ?? target.dataset.likePrompt ?? target.dataset.dislikePrompt ?? target.dataset.trainPrompt);
    const message = chat.messages[index];
    if (!message) return;
    if (target.dataset.rate) {
      message.rating = Number(target.dataset.score);
      if (message.promptPack) recordFeedback(message.promptPack, message.rating);
      if (message.rating >= 4) addLiked({ ...(message.promptPack || {}), prompt: message.promptPack?.positive || message.text, tags: `rated ${message.rating}`, rating: message.rating });
      if (message.promptPack) addVersion(`Rated ${message.rating}`, message.text, message.promptPack);
      saveState();
      toast("Rating saved. Brain updated.");
    }
    if (target.dataset.copy) {
      const part = target.dataset.part;
      const text = part === "positive" ? message.promptPack.positive : part === "negative" ? message.promptPack.negative : message.text;
      copyText(text);
    }
    if (target.dataset.workflow) {
      exportWorkflow(message.promptPack);
    }
    if (target.dataset.learn) {
      addLiked({ ...(message.promptPack || {}), prompt: message.promptPack?.positive || message.text, tags: "chat result", rating: 5 });
      toast("Added to liked results.");
    }
    if (target.dataset.likePrompt) {
      trainFromPrompt(message, "like");
    }
    if (target.dataset.dislikePrompt) {
      trainFromPrompt(message, "dislike");
    }
    if (target.dataset.trainPrompt) {
      const source = chat.messages.slice(0, index).reverse().find((item) => item.role === "user")?.text || "";
      const button = $(`.nav-btn[data-view="trainingView"]`);
      if (button) button.click();
      els.trainingTriggerInput.value = cleanUserIntent(source);
      els.trainingPreferInput.value = message.promptPack?.positive || message.text;
      toast("Training form filled from this prompt.");
    }
  });

  els.likedImageInput.addEventListener("change", async () => {
    const file = els.likedImageInput.files[0];
    likedImageData = file ? await fileToDataUrl(file) : "";
    els.likedPreview.innerHTML = likedImageData ? `<img src="${likedImageData}" alt="">` : "No image yet";
  });

  $("#saveLikedBtn").addEventListener("click", () => {
    addLiked({
      image: likedImageData,
      prompt: els.likedPromptInput.value.trim(),
      tags: els.likedTagsInput.value.trim(),
      rating: els.likedRatingInput.value
    });
    likedImageData = "";
    els.likedImageInput.value = "";
    els.likedPromptInput.value = "";
    els.likedTagsInput.value = "";
    els.likedPreview.textContent = "No image yet";
    toast("Saved. It will use this taste next time.");
  });

  els.likedGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-delete-liked]");
    if (!target) return;
    state.liked = state.liked.filter((item) => item.id !== target.dataset.deleteLiked);
    saveState();
    toast("Deleted from learning library.");
  });

  els.referenceImageInput.addEventListener("change", async () => {
    const file = els.referenceImageInput.files[0];
    referenceImageData = file ? await fileToDataUrl(file) : "";
    referenceAnalysis = referenceImageData ? await analyzeImage(referenceImageData) : null;
    els.referencePreview.innerHTML = referenceImageData
      ? `<img src="${referenceImageData}" alt=""><p class="meta">${escapeHtml(referenceAnalysis.summary)}</p><div class="swatches">${referenceAnalysis.colors.map((color) => `<span class="swatch" style="background:${color}"></span>`).join("")}</div>`
      : "No image yet";
  });

  $("#saveReferenceBtn").addEventListener("click", () => {
    if (!referenceImageData && !els.referenceNotesInput.value.trim()) return toast("Add a reference image or notes first.");
    state.references.push({
      id: crypto.randomUUID(),
      image: referenceImageData,
      analysis: referenceAnalysis || { summary: "manual reference notes", colors: [] },
      notes: els.referenceNotesInput.value.trim(),
      createdAt: Date.now()
    });
    referenceImageData = "";
    referenceAnalysis = null;
    els.referenceImageInput.value = "";
    els.referenceNotesInput.value = "";
    els.referencePreview.textContent = "No image yet";
    saveState();
    toast("Reference saved into memory.");
  });

  els.referenceGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-delete-reference]");
    if (!target) return;
    state.references = state.references.filter((item) => item.id !== target.dataset.deleteReference);
    saveState();
    toast("Reference deleted.");
  });

  $("#buildOcBtn").addEventListener("click", buildOc);
  $("#buildPoseBtn").addEventListener("click", () => {
    const pose = buildPosePrompt();
    els.poseOutput.textContent = pose;
    els.userPrompt.value = `${els.userPrompt.value} ${pose}`.trim();
    toast("Pose added to chat box.");
  });
  $("#cleanupBtn").addEventListener("click", () => {
    const cleaned = cleanPromptText(els.cleanupInput.value.trim());
    els.cleanupOutput.textContent = cleaned;
    addVersion("Cleaned prompt", cleaned, parsePromptText(cleaned, { positive: cleaned, negative: state.settings.negativePrompt || defaultNegative }));
    saveState();
  });
  $("#copyCleanupBtn").addEventListener("click", () => copyText(els.cleanupOutput.textContent || ""));
  $("#useCleanupBtn").addEventListener("click", () => {
    if (!els.cleanupOutput.textContent) return toast("Clean something first.");
    els.userPrompt.value = els.cleanupOutput.textContent;
    toast("Clean prompt added to chat box.");
  });
  $("#researchBtn").addEventListener("click", runResearch);
  $("#saveResearchNotesBtn").addEventListener("click", () => {
    const text = els.manualResearchNotes.value.trim();
    if (!text) return toast("Paste notes first.");
    state.researchNotes.push({ id: crypto.randomUUID(), query: "manual", text, ideas: extractResearchIdeas(text), createdAt: Date.now() });
    els.manualResearchNotes.value = "";
    saveState();
    toast("Manual notes saved to memory.");
  });

  $("#saveSettingsBtn").addEventListener("click", () => {
    state.settings.negativePrompt = els.negativeInput.value.trim() || defaultNegative;
    state.settings.rules = els.rulesInput.value.trim();
    state.settings.ollamaModel = els.ollamaModelInput.value.trim() || "qwen2.5:7b";
    state.settings.workflowType = els.workflowTypeInput.value || "basic";
    state.settings.enableNegativePrompt = !!els.enableNegativePromptToggle?.checked;
    state.settings.useBreak = els.useBreakToggle?.checked !== false;
    state.settings.theme = els.themeSelect?.value || "night-cyan";
    state.settings.compactMode = els.compactModeToggle.checked;
    state.settings.reduceMotion = els.reduceMotionToggle.checked;
    state.settings.denseSidebar = els.denseSidebarToggle.checked;
    state.settings.sidebarCollapsed = !!els.sidebarCollapsedToggle?.checked;
    state.settings.defaultAi = !!els.defaultAiToggle?.checked;
    state.settings.defaultResearch = !!els.defaultResearchToggle?.checked;
    state.settings.autoTraining = !!els.autoTrainingToggle?.checked;
    state.settings.promptStrictness = els.promptStrictnessInput?.value || "balanced";
    state.settings.ollamaEndpoint = els.ollamaEndpointInput?.value.trim() || "http://127.0.0.1:11434";
    state.settings.modelFolder = els.modelFolderInput?.value.trim() || "E:\\PromptBrain\\models";
    state.settings.appFolder = els.appFolderInput?.value.trim() || "E:\\PromptBrain";
    state.settings.maxTrainingRules = Math.max(1, Math.min(30, Number(els.maxTrainingRulesInput?.value || 12)));
    state.settings.minGalleryRating = Math.max(1, Math.min(5, Number(els.minGalleryRatingInput?.value || 4)));
    state.settings.learnFromChats = !!els.learnFromChatsToggle?.checked;
    state.settings.learnFromResearch = !!els.learnFromResearchToggle?.checked;
    saveState();
    els.settingsModal.hidden = true;
    toast("Settings saved.");
  });

  $("#saveTrainingBtn").addEventListener("click", () => {
    if (!els.trainingTriggerInput.value.trim() && !els.trainingPreferInput.value.trim() && !els.trainingAvoidInput.value.trim()) {
      return toast("Add a trigger, avoid, or prefer rule first.");
    }
    addTrainingRule({
      trigger: els.trainingTriggerInput.value,
      avoid: els.trainingAvoidInput.value,
      prefer: els.trainingPreferInput.value,
      sentiment: "manual"
    });
    els.trainingTriggerInput.value = "";
    els.trainingAvoidInput.value = "";
    els.trainingPreferInput.value = "";
    toast("Training rule saved.");
  });

  els.trainingList.addEventListener("click", (event) => {
    const use = event.target.closest("[data-use-training]");
    const del = event.target.closest("[data-delete-training]");
    if (use) {
      const rule = state.trainingRules.find((item) => item.id === use.dataset.useTraining);
      if (rule) {
        els.userPrompt.value = `${els.userPrompt.value} ${rule.trigger} ${rule.prefer}`.trim();
        $(`.nav-btn[data-view="chatView"]`)?.click();
        toast("Training rule added to workspace.");
      }
    }
    if (del) {
      state.trainingRules = state.trainingRules.filter((item) => item.id !== del.dataset.deleteTraining);
      saveState();
      toast("Training rule deleted.");
    }
  });

  [els.compactModeToggle, els.reduceMotionToggle, els.denseSidebarToggle, els.sidebarCollapsedToggle, els.enableNegativePromptToggle, els.useBreakToggle, els.defaultAiToggle, els.defaultResearchToggle, els.autoTrainingToggle, els.learnFromChatsToggle, els.learnFromResearchToggle].filter(Boolean).forEach((toggle) => {
    toggle.addEventListener("change", () => {
      state.settings.compactMode = els.compactModeToggle.checked;
      state.settings.reduceMotion = els.reduceMotionToggle.checked;
      state.settings.denseSidebar = els.denseSidebarToggle.checked;
      state.settings.sidebarCollapsed = !!els.sidebarCollapsedToggle?.checked;
      state.settings.enableNegativePrompt = !!els.enableNegativePromptToggle?.checked;
      state.settings.useBreak = els.useBreakToggle?.checked !== false;
      state.settings.defaultAi = !!els.defaultAiToggle?.checked;
      state.settings.defaultResearch = !!els.defaultResearchToggle?.checked;
      state.settings.autoTraining = !!els.autoTrainingToggle?.checked;
      state.settings.learnFromChats = !!els.learnFromChatsToggle?.checked;
      state.settings.learnFromResearch = !!els.learnFromResearchToggle?.checked;
      saveState();
    });
  });

  $("#saveProfileBtn").addEventListener("click", () => {
    const name = els.profileNameInput.value.trim();
    if (!name) return toast("Name the profile first.");
    state.profiles.push({
      id: crypto.randomUUID(),
      name,
      description: els.profileDescInput.value.trim(),
      tags: els.profileTagsInput.value.trim(),
      createdAt: Date.now()
    });
    els.profileNameInput.value = "";
    els.profileDescInput.value = "";
    els.profileTagsInput.value = "";
    saveState();
    toast("Profile saved.");
  });

  els.profileGrid.addEventListener("click", (event) => {
    const use = event.target.closest("[data-use-profile]");
    const del = event.target.closest("[data-delete-profile]");
    if (use) {
      const item = state.profiles.find((profile) => profile.id === use.dataset.useProfile);
      if (item) els.userPrompt.value = `${els.userPrompt.value} ${item.name}, ${item.description}, ${item.tags}`.trim();
      toast("Profile added to chat box.");
    }
    if (del) {
      state.profiles = state.profiles.filter((item) => item.id !== del.dataset.deleteProfile);
      saveState();
      toast("Profile deleted.");
    }
  });

  $("#saveLoraBtn").addEventListener("click", () => {
    const name = els.loraNameInput.value.trim();
    const tags = els.loraTagsInput.value.trim();
    if (!name || !tags) return toast("Preset needs a name and tags.");
    state.loras.push({
      id: crypto.randomUUID(),
      name,
      tags,
      notes: els.loraNotesInput.value.trim(),
      createdAt: Date.now()
    });
    els.loraNameInput.value = "";
    els.loraTagsInput.value = "";
    els.loraNotesInput.value = "";
    saveState();
    toast("LoRA preset saved.");
  });

  els.loraGrid.addEventListener("click", (event) => {
    const use = event.target.closest("[data-use-lora]");
    const del = event.target.closest("[data-delete-lora]");
    if (use) {
      const item = state.loras.find((lora) => lora.id === use.dataset.useLora);
      if (item) els.userPrompt.value = `${els.userPrompt.value} ${item.tags}`.trim();
      toast("LoRA tags added to chat box.");
    }
    if (del) {
      state.loras = state.loras.filter((item) => item.id !== del.dataset.deleteLora);
      saveState();
      toast("LoRA preset deleted.");
    }
  });

  els.galleryImageInput.addEventListener("change", async () => {
    const files = Array.from(els.galleryImageInput.files || []);
    const prompt = els.galleryPromptInput.value.trim();
    const sourcePack = promptPackForBase(prompt) || activeChat().messages.slice().reverse().find((message) => message.promptPack)?.promptPack || null;
    for (const file of files) {
      const id = crypto.randomUUID();
      state.gallery.push({
        id,
        artifactId: `image-${id}`,
        parentArtifactId: sourcePack?.artifactId || "",
        historyId: sourcePack?.historyId || "",
        sessionId: activeChatId,
        image: await fileToDataUrl(file),
        prompt: prompt || sourcePack?.positive || "",
        negative: sourcePack?.negative || "",
        checkpointId: state.builder.checkpointId,
        vibe: state.builder.vibe,
        loras: selectedLoraObjects().map((lora) => lora.name),
        selectedTags: sourcePack?.selectedTags || selectedBuilderTags(),
        builderSnapshot: sourcePack?.builderSnapshot || captureBuilderSnapshot(),
        engine: sourcePack?.engine || null,
        settings: {},
        rating: 0,
        createdAt: Date.now()
      });
    }
    els.galleryImageInput.value = "";
    saveState();
    toast(`${files.length} image(s) imported.`);
  });

  $("#saveGalleryPromptBtn").addEventListener("click", () => {
    const prompt = els.galleryPromptInput.value.trim();
    state.gallery.forEach((item) => {
      if (!item.prompt) item.prompt = prompt;
    });
    saveState();
    toast("Gallery notes attached.");
  });

  els.galleryGrid.addEventListener("click", (event) => {
    const rate = event.target.closest("[data-rate-gallery]");
    const del = event.target.closest("[data-delete-gallery]");
    if (rate) {
      const item = state.gallery.find((entry) => entry.id === rate.dataset.rateGallery);
      if (!item) return;
      item.rating = Number(rate.dataset.score);
      item.artifactId ||= `image-${item.id}`;
      recordFeedback({ artifactId: item.artifactId, positive: item.prompt || "", negative: "" }, item.rating, item.historyId || "");
      if (item.rating >= (Number(state.settings.minGalleryRating) || 4)) {
        addLiked({
          ...item,
          image: item.image,
          prompt: item.prompt,
          tags: `gallery rated ${item.rating}`,
          rating: item.rating
        });
      } else {
        saveState();
      }
      toast("Gallery rating saved.");
    }
    if (del) {
      state.gallery = state.gallery.filter((item) => item.id !== del.dataset.deleteGallery);
      saveState();
      toast("Gallery image deleted.");
    }
  });

  $("#exportDataBtn").addEventListener("click", exportMemory);
  els.settingsExportBtn?.addEventListener("click", exportMemory);

  $("#importDataBtn").addEventListener("click", () => els.importDataInput.click());
  els.settingsImportBtn?.addEventListener("click", () => els.importDataInput.click());
  els.resetMemoryBtn?.addEventListener("click", resetLocalMemory);
  els.importDataInput.addEventListener("change", async () => {
    const file = els.importDataInput.files[0];
    if (!file) return;
    try {
      await importMemoryFile(file);
      toast("Memory imported and saved.");
    } catch (error) {
      console.error("Memory import failed", error);
      toast(`Import failed: ${error.message || error}`);
    } finally {
      els.importDataInput.value = "";
    }
  });
}

function deleteChat(chatId) {
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return;

  const confirmed = confirm(`Delete "${chat.title}"? This removes the saved chat from this app.`);
  if (!confirmed) return;

  state.chats = state.chats.filter((item) => item.id !== chatId);
  state.versions = state.versions.filter((item) => item.chatId !== chatId && item.pack?.sessionId !== chatId);
  state.gallery = state.gallery.filter((item) => item.sessionId !== chatId);
  state.usageStats.history = state.usageStats.history.filter((item) => item.sessionId !== chatId);
  if (!state.chats.length) {
    createChat(false);
  } else if (activeChatId === chatId) {
    activeChatId = state.chats[0].id;
    restoreChatWorkspace(state.chats[0], false);
  }

  saveState();
  toast("Chat deleted.");
}

function promptPackForBase(base) {
  const message = activeChat().messages.slice().reverse().find((item) =>
    item.promptPack && (item.text === base || item.promptPack.positive === base));
  if (message?.promptPack) return message.promptPack;
  const version = state.versions.slice().reverse().find((item) =>
    item.pack && (item.text === base || item.pack.positive === base));
  return version?.pack || null;
}

async function applyVariation(instruction, base) {
  if (!base) {
    toast("Generate or paste a base prompt first.");
    return;
  }
  try {
    const ready = await ensureEngineCatalog();
    if (!ready) throw new Error(engineRuntime.error || "Offline engine unavailable.");
    const parent = promptPackForBase(base);
    const request = parent?.request || parsePromptText(base, { positive: base, negative: "" }).positive;
    const pack = buildPromptPackEngine(`${request}, variation direction: ${instruction}`, {
      seed: randomGenerationSeed(),
      originalInput: request,
      source: "offline-engine-variation"
    });
    pack.parentArtifactId = parent?.artifactId || "";
    pack.historyId = recordPromptUsage(pack);
    const chat = activeChat();
    chat.messages.push({ role: "assistant", text: pack.text, promptPack: pack, artifactId: pack.artifactId });
    addVersion(`Variation: ${instruction}`, pack.text, pack);
    els.variationBaseInput.value = pack.text;
    saveState();
    toast("Engine variation created.");
  } catch (error) {
    console.error("Variation failed", error);
    toast(`Variation stopped: ${error.message || error}`);
  }
}

function buildPosePrompt() {
  const expression = els.poseExpressionInput.value.trim() || "expressive face";
  return [
    els.poseBodyInput.value,
    els.poseCameraInput.value,
    els.poseHeadInput.value,
    els.poseHandsInput.value,
    expression,
    "clear readable pose",
    "natural anatomy",
    "balanced silhouette"
  ].join(", ");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const original = reader.result;
      if (!String(file.type || "").startsWith("image/")) {
        resolve(original);
        return;
      }

      const image = new Image();
      image.onload = () => {
        const maxEdge = 1280;
        const longest = Math.max(image.width, image.height);
        if (longest <= maxEdge && file.size < 850000) {
          resolve(original);
          return;
        }

        const scale = Math.min(1, maxEdge / longest);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = () => resolve(original);
      image.src = original;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function analyzeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 80;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const buckets = new Map();
      let brightness = 0;
      let saturation = 0;

      for (let i = 0; i < pixels.length; i += 16) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        brightness += (r + g + b) / 3;
        saturation += max === 0 ? 0 : (max - min) / max;
        const key = [r, g, b].map((value) => Math.round(value / 48) * 48).join(",");
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }

      const sampleCount = pixels.length / 16;
      const colors = Array.from(buckets.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key]) => `rgb(${key})`);
      const ratio = image.width / image.height;
      const orientation = ratio > 1.15 ? "wide landscape composition" : ratio < 0.85 ? "vertical portrait composition" : "square balanced composition";
      const light = brightness / sampleCount > 155 ? "bright high-key lighting" : brightness / sampleCount < 85 ? "dark low-key lighting" : "balanced mid-tone lighting";
      const colorFeel = saturation / sampleCount > 0.42 ? "vivid saturated colors" : "muted restrained colors";
      resolve({
        width: image.width,
        height: image.height,
        colors,
        summary: `${orientation}, ${light}, ${colorFeel}`
      });
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function referenceTerms(item) {
  return unique([
    item.analysis?.summary,
    ...(item.analysis?.colors || []),
    ...extractTerms(item.notes || "")
  ]);
}

function parsePromptText(text, fallback) {
  const positiveMatch = text.match(/positive prompt\s*([\s\S]*?)(negative prompt|$)/i);
  const negativeMatch = text.match(/negative prompt\s*([\s\S]*)/i);
  return {
    positive: String(positiveMatch?.[1] || fallback?.positive || "").trim(),
    negative: String(negativeMatch?.[1] || fallback?.negative || "").trim()
  };
}

function exportWorkflow(pack) {
  const workflow = makeWorkflow(pack);
  downloadJson(workflow, `promptbrain-workflow-${new Date().toISOString().slice(0, 10)}.json`);
  toast("Workflow JSON exported.");
}

function makeWorkflow(pack) {
  return {
    id: "promptbrain-basic",
    revision: 0,
    last_node_id: 7,
    last_link_id: 9,
    nodes: [
      {
        id: 1,
        type: "CheckpointLoaderSimple",
        pos: [80, 260],
        size: [360, 98],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [],
        outputs: [
          { name: "MODEL", type: "MODEL", links: [1] },
          { name: "CLIP", type: "CLIP", links: [2, 3] },
          { name: "VAE", type: "VAE", links: [8] }
        ],
        properties: { "Node name for S&R": "CheckpointLoaderSimple" },
        widgets_values: ["model.safetensors"]
      },
      {
        id: 2,
        type: "CLIPTextEncode",
        pos: [500, 120],
        size: [420, 180],
        flags: {},
        order: 1,
        mode: 0,
        inputs: [{ name: "clip", type: "CLIP", link: 2 }],
        outputs: [{ name: "CONDITIONING", type: "CONDITIONING", links: [4] }],
        properties: { "Node name for S&R": "CLIPTextEncode" },
        widgets_values: [pack.positive]
      },
      {
        id: 3,
        type: "CLIPTextEncode",
        pos: [500, 340],
        size: [420, 180],
        flags: {},
        order: 2,
        mode: 0,
        inputs: [{ name: "clip", type: "CLIP", link: 3 }],
        outputs: [{ name: "CONDITIONING", type: "CONDITIONING", links: [5] }],
        properties: { "Node name for S&R": "CLIPTextEncode" },
        widgets_values: [pack.negative]
      },
      {
        id: 4,
        type: "EmptyLatentImage",
        pos: [500, 580],
        size: [315, 106],
        flags: {},
        order: 3,
        mode: 0,
        inputs: [],
        outputs: [{ name: "LATENT", type: "LATENT", links: [6] }],
        properties: { "Node name for S&R": "EmptyLatentImage" },
        widgets_values: [1024, 1024, 1]
      },
      {
        id: 5,
        type: "KSampler",
        pos: [980, 260],
        size: [315, 262],
        flags: {},
        order: 4,
        mode: 0,
        inputs: [
          { name: "model", type: "MODEL", link: 1 },
          { name: "positive", type: "CONDITIONING", link: 4 },
          { name: "negative", type: "CONDITIONING", link: 5 },
          { name: "latent_image", type: "LATENT", link: 6 }
        ],
        outputs: [{ name: "LATENT", type: "LATENT", links: [7] }],
        properties: { "Node name for S&R": "KSampler" },
        widgets_values: [Date.now() % 1000000000, "randomize", 28, 7, "dpmpp_2m", "karras", 1]
      },
      {
        id: 6,
        type: "VAEDecode",
        pos: [1340, 300],
        size: [210, 46],
        flags: {},
        order: 5,
        mode: 0,
        inputs: [
          { name: "samples", type: "LATENT", link: 7 },
          { name: "vae", type: "VAE", link: 8 }
        ],
        outputs: [{ name: "IMAGE", type: "IMAGE", links: [9] }],
        properties: { "Node name for S&R": "VAEDecode" },
        widgets_values: []
      },
      {
        id: 7,
        type: "SaveImage",
        pos: [1600, 280],
        size: [320, 270],
        flags: {},
        order: 6,
        mode: 0,
        inputs: [{ name: "images", type: "IMAGE", link: 9 }],
        outputs: [],
        properties: { "Node name for S&R": "SaveImage" },
        widgets_values: ["PromptBrain"]
      }
    ],
    links: [
      [1, 1, 0, 5, 0, "MODEL"],
      [2, 1, 1, 2, 0, "CLIP"],
      [3, 1, 1, 3, 0, "CLIP"],
      [4, 2, 0, 5, 1, "CONDITIONING"],
      [5, 3, 0, 5, 2, "CONDITIONING"],
      [6, 4, 0, 5, 3, "LATENT"],
      [7, 5, 0, 6, 0, "LATENT"],
      [8, 1, 2, 6, 1, "VAE"],
      [9, 6, 0, 7, 0, "IMAGE"]
    ],
    groups: [],
    config: {},
    extra: {
      promptbrain: {
        workflowType: state.settings.workflowType || "basic",
        exportedAt: new Date().toISOString()
      }
    },
    version: 0.4
  };
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportMemory() {
  syncActiveChatWorkspace();
  await persistentStateStore?.flush().catch(() => {});
  const portable = await makePortableExportState();
  downloadJson(portable, `promptbrain-memory-${new Date().toISOString().slice(0, 10)}.json`);
  toast("Memory exported.");
}

async function makePortableExportState() {
  const portable = JSON.parse(JSON.stringify(state));
  for (const collectionName of ["liked", "references", "gallery"]) {
    for (const item of portable[collectionName] || []) {
      if (!item.image || /^data:image\//i.test(item.image)) continue;
      try {
        const response = await fetch(item.image, { cache: "no-store", headers: apiClientHeaders });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        item.image = await blobToDataUrl(await response.blob());
      } catch (error) {
        console.warn(`Could not embed exported asset ${item.assetId || item.image}`, error);
      }
    }
  }
  portable.meta ||= {};
  portable.meta.exportedAt = Date.now();
  portable.meta.portableAssets = true;
  return portable;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function importMemoryFile(file) {
  const parsed = JSON.parse(await file.text());
  const migrated = window.PromptBrainStateStore?.migrateState(parsed).state;
  if (!migrated) throw new Error("This file does not contain PromptBrain memory data.");
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, migrated);
  normalizeState();
  activeChatId = state.activeChatId || state.chats[0]?.id || null;
  restoreChatWorkspace(state.chats.find((chat) => chat.id === activeChatId), false);
  await saveState({ immediate: true });
  renderAll();
}

function resetLocalMemory() {
  if (!confirm("Reset sessions, training, ratings, references, images, and learned scores? This cannot be undone unless you exported memory first.")) return;
  const settings = JSON.parse(JSON.stringify(state.settings || {}));
  const fresh = window.PromptBrainStateStore.createDefaultState();
  fresh.settings = settings;
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);
  normalizeState();
  activeChatId = state.activeChatId;
  restoreChatWorkspace(state.chats[0], false);
  saveState({ immediate: true });
  renderAll();
  toast("Local memory reset. App settings were kept.");
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  toast("Copied.");
}

function unique(items) {
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function pick(items, index, fallback) {
  return items[index] || fallback;
}

function makeName(seed) {
  const words = extractTerms(seed).filter((term) => !term.includes(" "));
  const first = (words[0] || "Nova").replace(/^\w/, (char) => char.toUpperCase());
  const second = (words[2] || "Vale").replace(/^\w/, (char) => char.toUpperCase());
  return `${first} ${second}`;
}

function suggestPalette(seed) {
  const text = seed.toLowerCase();
  if (text.includes("ice") || text.includes("winter")) return "white, silver, cold blue, black accent";
  if (text.includes("fire") || text.includes("demon")) return "charcoal, ember red, gold highlights";
  if (text.includes("cyber")) return "black, chrome, neon teal, warning pink";
  if (text.includes("forest") || text.includes("elf")) return "deep green, bone white, soft gold";
  return "main color, contrast accent, neutral anchor, small bright detail";
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

window.addEventListener("beforeunload", () => {
  try {
    state.activeChatId = activeChatId;
    state.savedAt = Date.now();
    if (persistentStateStore) {
      persistentStateStore.save(state, { immediate: true }).catch(() => {});
      persistentStateStore.flush().catch(() => {});
    } else {
      saveLocalBackup();
    }
  } catch {
    // Closing should never be blocked by a failed final save.
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistentStateStore?.flush().catch(() => {});
});

async function bootstrap() {
  wireEvents();
  renderAll();
  await hydratePersistentState();
  const ready = await ensureEngineCatalog();
  if (!ready) {
    console.error("PromptBrain engine catalog unavailable:", engineRuntime.error);
    renderEngineStatus();
    toast("The offline engine catalog failed to load. Generation is disabled until it is repaired.");
    return;
  }
  renderAll();
  console.info(`PromptBrain engine ready: ${globalThis.PromptBrainEngine.ALL_CONCEPTS.length} concepts, ${globalThis.PromptBrainEngine.ALL_ART_RECIPES.length} recipes, catalog ${engineRuntime.fingerprint.slice(0, 12)}`);
}

bootstrap().catch((error) => {
  console.error("PromptBrain startup failed", error);
  engineRuntime.error = error?.message || String(error);
  renderEngineStatus();
  toast("PromptBrain startup stopped. Open Settings for the error.");
});
