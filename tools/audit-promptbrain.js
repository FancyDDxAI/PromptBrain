"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "promptbrain.js");
const statePath = "E:\\PromptBrain\\data\\promptbrain-state.json";
const source = fs.readFileSync(sourcePath, "utf8");
const stop = source.indexOf("const state = loadState();");

if (stop < 0) throw new Error("Could not locate PromptBrain knowledge boundary.");

const context = {
  document: {
    querySelector() { return null; },
    querySelectorAll() { return []; }
  },
  unique(items) {
    return [...new Set((items || []).map((item) => String(item).trim()).filter(Boolean))];
  },
  engineReady() {
    return false;
  },
  console
};

vm.createContext(context);
vm.runInContext(source.slice(0, stop) + `
  globalThis.__audit = {
    checkpoints: Object.keys(CHECKPOINT_RULES).length,
    loras: typeof LORA_KB === "undefined" ? "catalog-backed" : LORA_KB.length,
    styleTokens: STYLE_TOKEN_KB.length,
    categories: Object.fromEntries(BUILDER_CATEGORIES.map((key) => [key, (CATEGORY_BASE[key] || []).length])),
    adultCategories: Object.fromEntries(BUILDER_CATEGORIES.map((key) => [key, (ADULT_TAGS[key] || []).length])),
    vibeEntries: Object.values(VIBE_CATEGORY_TAGS).reduce((sum, group) => sum + Object.values(group).reduce((n, values) => n + values.length, 0), 0),
    adultVibeEntries: Object.values(ADULT_VIBE_TAGS).reduce((sum, group) => sum + Object.values(group).reduce((n, values) => n + values.length, 0), 0),
    series: ANIME_SERIES_LIBRARY.length,
    femaleCharacters: new Set(ANIME_SERIES_LIBRARY.flatMap((item) => item.female)).size,
    maleCharacters: new Set(ANIME_SERIES_LIBRARY.flatMap((item) => item.male)).size,
    adultCharacters: adultCharacterSet().size
  };
`, context);

const report = context.__audit;
report.categoryTotal = Object.values(report.categories).reduce((a, b) => a + b, 0);
report.adultCategoryTotal = Object.values(report.adultCategories).reduce((a, b) => a + b, 0);

if (fs.existsSync(statePath)) {
  const rawState = fs.readFileSync(statePath, "utf8");
  const cleanState = rawState.replace(/^\uFEFF/, "");
  const state = JSON.parse(cleanState);
  report.state = {
    bytes: Buffer.byteLength(rawState),
    hasByteOrderMark: rawState.charCodeAt(0) === 0xFEFF,
    schemaVersion: state.schemaVersion || null,
    sections: Object.fromEntries(Object.entries(state).map(([key, value]) => [
      key,
      Buffer.byteLength(JSON.stringify(value))
    ]))
  };
}

console.log(JSON.stringify(report, null, 2));
