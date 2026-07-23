"use strict";

const assert = require("node:assert/strict");
const contracts = require("../engine/contracts.js");

const intent = contracts.createPromptIntent("artistic oni portrait", {
  requestId: "request-1",
  checkpointId: "waiIllustriousXL",
  contentMode: "sfw",
  seed: 42
});
intent.normalizedText = "artistic oni portrait";
assert.equal(contracts.validatePromptIntent(intent).valid, true);

const plan = contracts.createScenePlan(intent);
assert.equal(contracts.validateScenePlan(plan).valid, true);

const compiled = contracts.createCompiledPrompt(plan);
assert.equal(contracts.validateCompiledPrompt(compiled).valid, true);

const entry = {
  schemaVersion: contracts.SCHEMA_VERSION,
  id: "composition.controlled-negative-space",
  kind: "composition",
  label: "controlled negative space",
  aliases: ["intentional empty space"],
  promptForms: { default: "controlled negative space" },
  compatibility: { bases: ["SDXL"], checkpointIds: [] },
  requires: [],
  conflicts: ["composition.edge-to-edge-density"],
  contentMode: "sfw"
};
assert.equal(contracts.validateKnowledgeEntry(entry).valid, true);

const recipe = {
  schemaVersion: contracts.SCHEMA_VERSION,
  id: "art.graphic-limited-palette-portrait",
  name: "Graphic limited-palette portrait",
  aliases: ["graphic red black white portrait"],
  contentModes: ["sfw", "adult"],
  ingredients: {
    medium: ["premium anime illustration"],
    composition: ["controlled negative space", "asymmetric framing"],
    palette: ["jet black", "bone white", "blood red"],
    lighting: ["hard red rim light"],
    motifs: ["fractured graphic panels"],
    effects: ["subtle film grain"]
  },
  requiredSlots: ["composition", "palette"],
  optionalSlots: ["lighting", "motifs", "effects"],
  conflicts: ["palette.rainbow"]
};
assert.equal(contracts.validateArtRecipe(recipe).valid, true);

const badEntry = { ...entry, id: "Bad Identifier", kind: "unknown" };
const badResult = contracts.validateKnowledgeEntry(badEntry);
assert.equal(badResult.valid, false);
assert.ok(badResult.errors.length >= 2);

console.log("PromptBrain engine contract tests passed.");
