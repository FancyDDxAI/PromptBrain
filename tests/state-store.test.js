"use strict";

const assert = require("node:assert/strict");
const stateModule = require("../engine/state-store.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values)
  };
}

function response(status, value) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => JSON.parse(JSON.stringify(value))
  };
}

async function run() {

const legacy = {
  savedAt: 100,
  activeChatId: "chat-1",
  chats: [{ id: "chat-1", title: "Old chat", messages: [] }],
  liked: [{ id: "liked-1", prompt: "oni portrait" }],
  references: [],
  gallery: [],
  trainingRules: [{ id: "rule-1", type: "like" }],
  settings: { theme: "night-cyan" },
  usageStats: { totalPrompts: 9, tagScores: { oni: 4 } }
};

const migration = stateModule.migrateState(legacy, { now: 500 });
assert.equal(migration.migrated, true);
assert.equal(migration.fromVersion, 1);
assert.equal(migration.state.schemaVersion, 2);
assert.equal(migration.state.meta.format, "promptbrain-state");
assert.equal(migration.state.meta.migratedFrom, 1);
assert.equal(migration.state.liked[0].prompt, "oni portrait");
assert.equal(migration.state.trainingRules[0].id, "rule-1");
assert.equal(migration.state.usageStats.totalPrompts, 9);
assert.deepEqual(migration.state.usageStats.vibeUsage, {});

const dataUrl = `data:image/png;base64,${Buffer.from("fake-png").toString("base64")}`;
const assetSource = stateModule.migrateState({
  ...legacy,
  gallery: [{ id: "image-1", image: dataUrl, rating: 5 }]
}, { now: 600 }).state;
const uploaded = [];
const externalized = await stateModule.externalizeAssets(assetSource, async (asset) => {
  uploaded.push(asset);
  return { id: asset.id, url: `/api/assets/${asset.id}.png` };
});
assert.equal(uploaded.length, 1);
assert.ok(externalized.state.gallery[0].image.startsWith("/api/assets/"));
assert.ok(externalized.state.gallery[0].assetId.startsWith("img-"));
const localBackup = stateModule.createLocalBackup(assetSource);
assert.equal(localBackup.gallery[0].image, dataUrl);
assert.equal(localBackup.gallery[0].imageStoredOnDisk, undefined);

const localOlder = stateModule.migrateState(legacy, { now: 100 }).state;
localOlder.meta.revision = 2;
const remoteNewer = stateModule.migrateState(legacy, { now: 200 }).state;
remoteNewer.meta.revision = 3;
assert.equal(stateModule.chooseFreshest(localOlder, remoteNewer), remoteNewer);

let remoteState = remoteNewer;
let remoteRevision = 3;
let concurrentWrites = 0;
let maxConcurrentWrites = 0;
const statePosts = [];
const fetchMock = async (url, options = {}) => {
  assert.equal(options.headers?.["X-PromptBrain-Client"], "PromptBrainDesktop");
  if (url === "/api/state" && !options.method) return response(200, remoteState);
  if (url === "/api/assets" && options.method === "POST") {
    const asset = JSON.parse(options.body);
    return response(200, { id: asset.id, url: `/api/assets/${asset.id}.png` });
  }
  if (url === "/api/state" && options.method === "POST") {
    concurrentWrites += 1;
    maxConcurrentWrites = Math.max(maxConcurrentWrites, concurrentWrites);
    const payload = JSON.parse(options.body);
    await new Promise((resolve) => setTimeout(resolve, 6));
    assert.equal(payload.expectedRevision, remoteRevision);
    remoteRevision += 1;
    remoteState = payload.state;
    remoteState.meta.revision = remoteRevision;
    remoteState.meta.updatedAt = 1000 + remoteRevision;
    remoteState.savedAt = remoteState.meta.updatedAt;
    statePosts.push(JSON.parse(JSON.stringify(remoteState)));
    concurrentWrites -= 1;
    return response(200, { ok: true, revision: remoteRevision, savedAt: remoteState.savedAt });
  }
  return response(404, {});
};

const storage = memoryStorage({ "promptbrain.v1": JSON.stringify(localOlder) });
let clock = 1000;
const store = stateModule.createStateStore({
  fetch: fetchMock,
  storage,
  debounceMs: 0,
  now: () => ++clock
});
const loaded = await store.load();
assert.equal(loaded.state.meta.revision, 3);

const stateA = JSON.parse(JSON.stringify(loaded.state));
stateA.settings.marker = "A";
const firstSave = store.save(stateA, { immediate: true });
const stateB = JSON.parse(JSON.stringify(stateA));
stateB.settings.marker = "B";
const secondSave = store.save(stateB, { immediate: true });
const stateC = JSON.parse(JSON.stringify(stateB));
stateC.settings.marker = "C";
const thirdSave = store.save(stateC, { immediate: true });
await Promise.all([firstSave, secondSave, thirdSave]);
assert.equal(maxConcurrentWrites, 1);
assert.equal(remoteState.settings.marker, "C");
assert.ok(statePosts.length >= 2);
assert.equal(store.getRevision(), remoteRevision);
assert.equal(store.isIdle(), true);

const conflictBase = stateModule.createDefaultState({ now: 3000, idFactory: () => "chat-conflict" });
conflictBase.meta.revision = 7;
let conflictRemote = JSON.parse(JSON.stringify(conflictBase));
let conflictPosts = 0;
const conflictStorage = memoryStorage();
const conflictStore = stateModule.createStateStore({
  storage: conflictStorage,
  debounceMs: 0,
  now: () => 3100 + conflictPosts,
  fetch: async (url, options = {}) => {
    assert.equal(options.headers?.["X-PromptBrain-Client"], "PromptBrainDesktop");
    if (!options.method) return response(200, conflictRemote);
    if (url.endsWith("/assets")) return response(200, {});
    conflictPosts += 1;
    const payload = JSON.parse(options.body);
    if (conflictPosts === 1) {
      conflictRemote = JSON.parse(JSON.stringify(conflictBase));
      conflictRemote.meta.revision = 8;
      conflictRemote.liked.push({ id: "remote-like", prompt: "remote edit" });
      conflictRemote.settings.remoteOnly = true;
      conflictRemote.usageStats.tagScores.remoteTag = 2;
      return response(409, { error: "revision_conflict", revision: 8 });
    }
    assert.equal(payload.expectedRevision, 8);
    assert.ok(payload.state.liked.some((item) => item.id === "local-like"));
    assert.ok(payload.state.liked.some((item) => item.id === "remote-like"));
    assert.equal(payload.state.settings.localOnly, true);
    assert.equal(payload.state.settings.remoteOnly, true);
    assert.equal(payload.state.usageStats.tagScores.localTag, 3);
    assert.equal(payload.state.usageStats.tagScores.remoteTag, 2);
    conflictRemote = JSON.parse(JSON.stringify(payload.state));
    conflictRemote.meta.revision = 9;
    return response(200, { ok: true, revision: 9, savedAt: 3200 });
  }
});
const conflictLoaded = await conflictStore.load();
const conflictLocal = JSON.parse(JSON.stringify(conflictLoaded.state));
conflictLocal.liked.push({ id: "local-like", prompt: "local edit" });
conflictLocal.settings.localOnly = true;
conflictLocal.usageStats.tagScores.localTag = 3;
await conflictStore.save(conflictLocal, { immediate: true });
assert.equal(conflictStore.getRevision(), 9);
assert.equal(conflictPosts, 2);

let permitAssetUpload = false;
let durableRevision = 0;
const imageStorage = memoryStorage();
const imageStore = stateModule.createStateStore({
  storage: imageStorage,
  debounceMs: 0,
  now: () => 4000,
  fetch: async (url, options = {}) => {
    if (!options.method) return response(200, {});
    if (url.endsWith("/assets")) {
      if (!permitAssetUpload) return response(500, { error: "disk_full" });
      const asset = JSON.parse(options.body);
      return response(200, { id: asset.id, url: `/api/assets/${asset.id}.png` });
    }
    const payload = JSON.parse(options.body);
    durableRevision += 1;
    return response(200, { ok: true, revision: durableRevision, savedAt: payload.state.savedAt });
  }
});
await imageStore.load();
const imageState = stateModule.createDefaultState({ now: 4000, idFactory: () => "chat-image" });
imageState.gallery.push({ id: "image-pending", image: dataUrl });
await assert.rejects(imageStore.save(imageState, { immediate: true }), /Asset save failed/);
const emergency = JSON.parse(imageStorage.getItem(stateModule.DEFAULT_STORAGE_KEY));
assert.equal(emergency.gallery[0].image, dataUrl);
assert.equal(imageStore.isIdle(), false);
permitAssetUpload = true;
await imageStore.flush();
assert.equal(imageStore.isIdle(), true);
const committedLocal = JSON.parse(imageStorage.getItem(stateModule.DEFAULT_STORAGE_KEY));
assert.ok(committedLocal.gallery[0].image.startsWith("/api/assets/"));

const debounceStorage = memoryStorage();
let debouncePosts = 0;
const debounceStore = stateModule.createStateStore({
  fetch: async (url, options = {}) => {
    if (!options.method) return response(200, {});
    if (url.endsWith("/assets")) return response(200, {});
    debouncePosts += 1;
    const payload = JSON.parse(options.body);
    return response(200, { ok: true, revision: debouncePosts, savedAt: payload.state.savedAt });
  },
  storage: debounceStorage,
  debounceMs: 8,
  now: () => 2000
});
const base = stateModule.createDefaultState({ now: 2000, idFactory: () => "chat-debounce" });
const d1 = debounceStore.save({ ...base, settings: { marker: 1 } });
const d2 = debounceStore.save({ ...base, settings: { marker: 2 } });
const d3 = debounceStore.save({ ...base, settings: { marker: 3 } });
await Promise.all([d1, d2, d3]);
assert.equal(debouncePosts, 1);
await stateModule.flushAll();
await stateModule.whenAllIdle();

  console.log(`State store tests passed (${statePosts.length} serialized disk writes, conflict retry, durable image journal).`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
