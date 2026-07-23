"use strict";

const assert = require("node:assert/strict");
const contracts = require("../engine/contracts.js");
const seed = require("../engine/seed-knowledge.js");
const curated = require("../engine/curated-knowledge.js");
const artDirector = require("../engine/art-director.js");
const engine = require("../engine/prompt-engine.js");

function generate(input, options = {}) {
  return engine.generate(input, {
    checkpointId: "waiIllustriousXL",
    contentMode: "sfw",
    ...options
  });
}

function positive(input, options = {}) {
  return generate(input, options).compiled.positive;
}

function includesAll(text, expected) {
  expected.forEach((value) => assert.ok(
    text.toLowerCase().includes(value.toLowerCase()),
    `Expected prompt to contain '${value}'.\nPrompt: ${text}`
  ));
}

function excludesAll(text, rejected) {
  rejected.forEach((value) => assert.ok(
    !text.toLowerCase().includes(value.toLowerCase()),
    `Expected prompt not to contain '${value}'.\nPrompt: ${text}`
  ));
}

function fixtureConcept(id, kind, prompt, aliases = [], options = {}) {
  return Object.freeze({
    schemaVersion: contracts.SCHEMA_VERSION,
    id,
    kind,
    label: prompt,
    aliases: Object.freeze([prompt, ...aliases]),
    promptForms: Object.freeze({ default: prompt, ...(options.promptForms || {}) }),
    compatibility: Object.freeze({
      bases: Object.freeze([...(options.bases || [])]),
      checkpointIds: Object.freeze([...(options.checkpointIds || [])])
    }),
    requires: Object.freeze([...(options.requires || [])]),
    conflicts: Object.freeze([...(options.conflicts || [])]),
    contentMode: options.contentMode || "sfw",
    group: options.group || "",
    priority: 0,
    traits: Object.freeze([])
  });
}

function loadEngineWithConcepts(extraConcepts) {
  const enginePath = require.resolve("../engine/prompt-engine.js");
  const seedPath = require.resolve("../engine/seed-knowledge.js");
  const originalEngineModule = require.cache[enginePath];
  const originalSeedModule = require.cache[seedPath];
  try {
    require.cache[seedPath] = {
      ...originalSeedModule,
      exports: Object.freeze({
        ...seed,
        CONCEPTS: Object.freeze([...seed.CONCEPTS, ...extraConcepts])
      })
    };
    delete require.cache[enginePath];
    return require(enginePath);
  } finally {
    require.cache[seedPath] = originalSeedModule;
    require.cache[enginePath] = originalEngineModule;
  }
}

seed.CONCEPTS.forEach((entry) => {
  const result = contracts.validateKnowledgeEntry(entry);
  assert.equal(result.valid, true, `${entry.id}: ${result.errors.join("; ")}`);
});

curated.CONCEPTS.forEach((entry) => {
  const result = contracts.validateKnowledgeEntry(entry);
  assert.equal(result.valid, true, `${entry.id}: ${result.errors.join("; ")}`);
});

seed.ART_RECIPES.forEach((recipe) => {
  const result = contracts.validateArtRecipe(recipe);
  assert.equal(result.valid, true, `${recipe.id}: ${result.errors.join("; ")}`);
});

artDirector.ART_RECIPES.forEach((recipe) => {
  const result = contracts.validateArtRecipe(recipe);
  assert.equal(result.valid, true, `${recipe.id}: ${result.errors.join("; ")}`);
});

const graphic = generate("make it artistic: an oni woman with black white and red graphic design");
includesAll(graphic.compiled.positive, [
  "graphic anime illustration",
  "oni woman",
  "small oni horns",
  "limited jet black, bone white, and blood red palette"
]);
excludesAll(graphic.compiled.positive, ["it artistic:", "rainbow palette"]);
assert.equal(graphic.plan.artRecipe.familyId, "graphic-poster");

const ukiyoe = generate("Miqote woman in a purple kimono, ukiyo-e portrait with Hokusai waves");
includesAll(ukiyoe.compiled.positive, [
  "Miqo'te woman",
  "purple kimono",
  "ukiyo-e",
  "cresting Hokusai waves",
  "decorative floral framing"
]);
excludesAll(ukiyoe.compiled.positive, ["soft studio portrait"]);
assert.equal(ukiyoe.plan.artRecipe.familyId, "ukiyoe");

const horror = generate("horror oni woman from above inside a ring of blood");
includesAll(horror.compiled.positive, [
  "oni woman",
  "from above",
  "ring of blood around the subject",
  "black white and crimson palette"
]);
excludesAll(horror.compiled.positive, ["from below", "pastel"]);
assert.equal(horror.plan.artRecipe.familyId, "symbolic-horror");

const eren = generate("Eren Yeager flying through a city using ODM gear at sunset");
includesAll(eren.compiled.positive, [
  "eren yeager",
  "shingeki no kyojin",
  "using three-dimensional maneuver gear",
  "flying through the city",
  "airborne forward lunge",
  "dramatic foreshortening",
  "deep layered city perspective",
  "warm sunset rim light"
]);
excludesAll(eren.compiled.positive, ["standing still", "studio backdrop"]);

const dragon = generate("dragon girl fighting in ancient ruins");
includesAll(dragon.compiled.positive, [
  "dragon girl",
  "dragon horns",
  "dragon tail",
  "engaged in fast close-range combat",
  "ancient stone ruins",
  "dynamic combat pose"
]);
excludesAll(dragon.compiled.positive, ["Tohru", "maid dragon"]);

const android = generate("Android 18 from Dragon Ball fighting in a ruined city");
includesAll(android.compiled.positive, [
  "android 18",
  "dragon ball",
  "engaged in fast close-range combat",
  "ruined city",
  "high-impact action composition"
]);
excludesAll(android.compiled.positive, ["dragon horns", "dragon tail", "dragon wings"]);

const cameraLock = generate(
  "adult demon woman in a neon hotel room, low angle, dutch tilt, close-up",
  { contentMode: "adult" }
);
includesAll(cameraLock.compiled.positive, ["demon woman", "neon hotel room", "from below", "dutch tilt", "close-up"]);
excludesAll(cameraLock.compiled.positive, ["rating: explicit", "hentai", "adult woman"]);
excludesAll(cameraLock.compiled.positive, ["from above", "wide establishing shot"]);

const forbidden = generate("an ice elf charging with a spear, no cape, no close-up");
includesAll(forbidden.compiled.positive, ["ice elf woman", "charging forward", "wielding a long spear", "low forward-leaning stance"]);
excludesAll(forbidden.compiled.positive, ["cape", "close-up"]);
assert.ok(forbidden.intent.directives.forbidden.some((item) => item.conceptId === "camera.close-up"));

// WAI tag prompts keep the learned quality/style head first, then subject/anatomy,
// then a single BREAK before scene/action blocks.
const ordered = positive("mouse woman in a moonlit bedroom with cinematic lighting");
assert.ok(ordered.startsWith("masterpiece, best quality, premium illustration, clean polished anime shading, anime style"));
assert.ok(ordered.includes("BREAK"), "BREAK must be emitted by default for tag checkpoints");
assert.ok(ordered.indexOf("mouse woman") < ordered.indexOf("moonlit bedroom"), "subject still precedes environment");
assert.ok(ordered.indexOf("small round mouse ears") < ordered.indexOf("moonlit bedroom"), "anatomy stays with the subject");

const withoutBreak = generate("mouse woman in a moonlit bedroom with cinematic lighting", { useBreak: false });
assert.ok(!withoutBreak.compiled.positive.includes("BREAK"), "BREAK can be disabled per target");

const withoutQuality = generate("mouse woman in a moonlit bedroom", { includeQualityPrefix: false });
assert.ok(!withoutQuality.compiled.positive.startsWith("masterpiece"), "quality head can be disabled per target");

const seededA = generate("artistic fantasy swordswoman on a rooftop", { seed: 481516 });
const seededB = generate("artistic fantasy swordswoman on a rooftop", { seed: 481516 });
assert.deepEqual(seededA.plan, seededB.plan);
assert.equal(seededA.compiled.positive, seededB.compiled.positive);

const explicitCamera = generate("fighter from above", { seed: 12 });
excludesAll(explicitCamera.compiled.positive, ["from below"]);
assert.ok(explicitCamera.plan.locked.includes("camera.from-above"));

const adultEntityGate = generate("Eren Yeager in an adult intimate scene", { contentMode: "adult" });
excludesAll(adultEntityGate.compiled.positive, ["eren yeager", "shingeki no kyojin", "adult woman", "adult man"]);
assert.ok(adultEntityGate.compiled.warnings.some((warning) => (
  warning.includes("not enabled for adult-mode")
  && warning.includes("request was rejected")
  && warning.includes("no generic adult subject was substituted")
)));

const directAdultEntityIntent = engine.parseIntent("Eren Yeager portrait", { contentMode: "sfw" });
directAdultEntityIntent.contentMode = "adult";
const directAdultEntityPlan = engine.planScene(directAdultEntityIntent);
excludesAll(directAdultEntityPlan.blocks.subject.join(", "), ["eren yeager", "shingeki no kyojin"]);
assert.equal(directAdultEntityPlan.participants.some((item) => item.id === "character.eren-yeager"), false);
assert.ok(directAdultEntityPlan.rejected.some((item) => item.conceptId === "character.eren-yeager"));
assert.equal(directAdultEntityPlan.decisions.some((item) => item.conceptId === "action.odm-gear"), false);

const runtimeConcepts = [
  fixtureConcept("audit.compat.sdxl", "style", "SDXL compatibility marker", ["audit cobalt seal"], {
    bases: ["SDXL"]
  }),
  fixtureConcept("audit.compat.flux", "style", "FLUX compatibility marker", ["audit magenta seal"], {
    bases: ["FLUX"]
  }),
  fixtureConcept("audit.compat.wai-only", "effect", "WAI checkpoint marker", ["audit checkpoint seal"], {
    checkpointIds: ["waiIllustriousXL"]
  }),
  fixtureConcept("audit.mode.sfw", "effect", "SFW mode marker", ["audit linen seal"]),
  fixtureConcept("audit.mode.adult", "effect", "adult mode marker", ["audit velvet seal"], {
    contentMode: "adult"
  }),
  fixtureConcept("audit.forms", "style", "default form marker", ["audit form seal"], {
    promptForms: {
      SDXL: "SDXL base form marker",
      FLUX: "FLUX base form marker",
      dreamShaperXL: "DreamShaper checkpoint form marker"
    }
  }),
  fixtureConcept("audit.requires.accessory", "effect", "required accessory marker"),
  fixtureConcept("audit.requires.action", "action", "dependent action marker", ["audit linked seal"], {
    requires: ["audit.requires.accessory"]
  }),
  fixtureConcept("audit.requires.flux-parent", "action", "blocked dependency marker", ["audit blocked link seal"], {
    requires: ["audit.compat.sdxl"]
  }),
  fixtureConcept("audit.conflict.alpha", "composition", "alpha conflict marker", ["audit longer alpha conflict seal"], {
    conflicts: ["audit.conflict.beta"]
  }),
  fixtureConcept("audit.conflict.beta", "composition", "beta conflict marker", ["audit beta seal"], {
    conflicts: ["audit.conflict.alpha"]
  })
];
runtimeConcepts.forEach((entry) => {
  const result = contracts.validateKnowledgeEntry(entry);
  assert.equal(result.valid, true, `${entry.id}: ${result.errors.join("; ")}`);
});
const fixtureEngine = loadEngineWithConcepts(runtimeConcepts);

const sdxlCompatibility = fixtureEngine.generate("audit cobalt seal, audit magenta seal", {
  checkpointId: "dreamShaperXL",
  contentMode: "sfw"
});
includesAll(sdxlCompatibility.compiled.positive, ["SDXL compatibility marker"]);
excludesAll(sdxlCompatibility.compiled.positive, ["FLUX compatibility marker"]);
assert.ok(sdxlCompatibility.plan.rejected.some((item) => (
  item.conceptId === "audit.compat.flux" && item.reason.includes("incompatible")
)));

const fluxCompatibility = fixtureEngine.generate("audit cobalt seal, audit magenta seal", {
  checkpointId: "fluxDev",
  contentMode: "sfw"
});
includesAll(fluxCompatibility.compiled.positive, ["FLUX compatibility marker"]);
excludesAll(fluxCompatibility.compiled.positive, ["SDXL compatibility marker"]);
assert.ok(fluxCompatibility.plan.rejected.some((item) => (
  item.conceptId === "audit.compat.sdxl" && item.reason.includes("incompatible")
)));

const checkpointCompatibility = fixtureEngine.generate("audit checkpoint seal", {
  checkpointId: "dreamShaperXL",
  contentMode: "sfw"
});
excludesAll(checkpointCompatibility.compiled.positive, ["WAI checkpoint marker"]);
assert.ok(checkpointCompatibility.plan.rejected.some((item) => item.conceptId === "audit.compat.wai-only"));

const sfwFiltering = fixtureEngine.generate("audit linen seal, audit velvet seal", {
  checkpointId: "waiIllustriousXL",
  contentMode: "sfw"
});
includesAll(sfwFiltering.compiled.positive, ["SFW mode marker"]);
excludesAll(sfwFiltering.compiled.positive, ["adult mode marker"]);
assert.ok(sfwFiltering.plan.rejected.some((item) => (
  item.conceptId === "audit.mode.adult" && item.reason.includes("sfw mode")
)));

const adultFiltering = fixtureEngine.generate("audit linen seal, audit velvet seal", {
  checkpointId: "waiIllustriousXL",
  contentMode: "adult"
});
includesAll(adultFiltering.compiled.positive, ["SFW mode marker", "mode marker"]);
assert.ok(adultFiltering.plan.decisions.some((item) => item.conceptId === "audit.mode.adult"));

const checkpointPromptForm = fixtureEngine.generate("audit form seal", {
  checkpointId: "dreamShaperXL",
  contentMode: "sfw"
});
includesAll(checkpointPromptForm.compiled.positive, ["DreamShaper checkpoint form marker"]);
excludesAll(checkpointPromptForm.compiled.positive, ["SDXL base form marker", "default form marker"]);

const basePromptForm = fixtureEngine.generate("audit form seal", {
  checkpointId: "juggernautXL",
  contentMode: "sfw"
});
includesAll(basePromptForm.compiled.positive, ["SDXL base form marker"]);
excludesAll(basePromptForm.compiled.positive, ["default form marker"]);

const fluxPromptForm = fixtureEngine.generate("audit form seal", {
  checkpointId: "fluxDev",
  contentMode: "sfw"
});
includesAll(fluxPromptForm.compiled.positive, ["FLUX base form marker"]);

const defaultPromptForm = fixtureEngine.generate("audit form seal", {
  checkpointId: "anythingV5",
  contentMode: "sfw"
});
includesAll(defaultPromptForm.compiled.positive, ["default form marker"]);

const requirements = fixtureEngine.generate("audit linked seal", {
  checkpointId: "waiIllustriousXL",
  contentMode: "sfw"
});
includesAll(requirements.compiled.positive, ["dependent action marker", "required accessory marker"]);
assert.ok(requirements.plan.decisions.some((item) => (
  item.conceptId === "audit.requires.accessory" && item.reason === "required by audit.requires.action"
)));

const incompatibleRequirement = fixtureEngine.generate("audit blocked link seal", {
  checkpointId: "fluxDev",
  contentMode: "sfw"
});
excludesAll(incompatibleRequirement.compiled.positive, ["blocked dependency marker", "SDXL compatibility marker"]);
assert.ok(incompatibleRequirement.plan.rejected.some((item) => (
  item.conceptId === "audit.requires.flux-parent" && item.reason.includes("could not be selected")
)));

const conflicts = fixtureEngine.generate("audit longer alpha conflict seal, audit beta seal", {
  checkpointId: "waiIllustriousXL",
  contentMode: "sfw"
});
includesAll(conflicts.compiled.positive, ["alpha conflict marker"]);
excludesAll(conflicts.compiled.positive, ["beta conflict marker"]);
assert.ok(conflicts.plan.rejected.some((item) => (
  item.conceptId === "audit.conflict.beta" && item.reason.includes("conflicts with locked")
)));
assert.ok(conflicts.plan.warnings.some((warning) => warning.includes("Explicit concepts conflict")));

const pony = generate("dragon girl fighting in ancient ruins", { checkpointId: "ponyDiffusionXL" });
assert.ok(pony.compiled.positive.startsWith("score_9, score_8_up, score_7_up, source_anime"));

const flux = generate("dragon girl fighting in ancient ruins", { checkpointId: "fluxDev" });
assert.ok(flux.compiled.positive.startsWith("Create an image featuring"));
assert.ok(!flux.compiled.positive.includes("BREAK"));
assert.equal(flux.compiled.negative, "");

const noNegative = generate("artistic oni portrait", { negativePrompt: "bad anatomy" });
assert.equal(noNegative.compiled.negative, "");

const withOptionalNegative = generate("artistic oni portrait", {
  includeNegative: true,
  negativePrompt: "bad anatomy"
});
assert.equal(withOptionalNegative.compiled.negative, "bad anatomy");

console.log(`PromptBrain engine tests passed (${engine.ALL_CONCEPTS.length} concepts, ${engine.ALL_ART_RECIPES.length} art recipes).`);
