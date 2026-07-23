(function attachPromptBrainStateStore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PromptBrainStateStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createStateStoreModule() {
  "use strict";

  const STATE_SCHEMA_VERSION = 2;
  const STATE_FORMAT = "promptbrain-state";
  const DEFAULT_STORAGE_KEY = "promptbrain.v2.backup";
  const LEGACY_STORAGE_KEYS = Object.freeze(["promptbrain.v1"]);
  const IMAGE_COLLECTIONS = Object.freeze(["liked", "references", "gallery"]);
  const STABLE_ID_COLLECTIONS = Object.freeze([
    "chats", "liked", "references", "profiles", "loras", "versions",
    "gallery", "trainingRules", "researchNotes"
  ]);
  const API_CLIENT_HEADER = "X-PromptBrain-Client";
  const API_CLIENT_VALUE = "PromptBrainDesktop";
  const activeStores = new Set();

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function idFactory() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function createDefaultState(options = {}) {
    const now = Number(options.now || Date.now());
    const chatId = options.idFactory ? options.idFactory() : idFactory();
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      meta: {
        format: STATE_FORMAT,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        migratedFrom: null,
        lastWriter: "default"
      },
      activeChatId: chatId,
      savedAt: now,
      chats: [{
        id: chatId,
        title: "New Chat",
        createdAt: now,
        messages: [{
          role: "assistant",
          text: "Tell me what you want and I will build a ComfyUI prompt."
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
      builder: {},
      usageStats: {
        totalPrompts: 0,
        feedbackGood: 0,
        feedbackBad: 0,
        tagScores: {},
        vibeUsage: {},
        checkpointUsage: {},
        loraUsage: {},
        history: []
      },
      settings: {}
    };
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function ensureObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function migrateState(input, options = {}) {
    const now = Number(options.now || Date.now());
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { state: createDefaultState({ now, idFactory: options.idFactory }), migrated: true, fromVersion: null, warnings: ["No usable state was found."] };
    }

    const state = clone(input);
    const fromVersion = Number.isInteger(state.schemaVersion) ? state.schemaVersion : 1;
    const warnings = [];
    state.chats = ensureArray(state.chats);
    state.liked = ensureArray(state.liked);
    state.references = ensureArray(state.references);
    state.profiles = ensureArray(state.profiles);
    state.loras = ensureArray(state.loras);
    state.versions = ensureArray(state.versions);
    state.gallery = ensureArray(state.gallery);
    state.trainingRules = ensureArray(state.trainingRules);
    state.researchNotes = ensureArray(state.researchNotes);
    state.builder = ensureObject(state.builder);
    state.settings = ensureObject(state.settings);
    state.usageStats = ensureObject(state.usageStats);
    state.usageStats.totalPrompts = Number(state.usageStats.totalPrompts || 0);
    state.usageStats.feedbackGood = Number(state.usageStats.feedbackGood || 0);
    state.usageStats.feedbackBad = Number(state.usageStats.feedbackBad || 0);
    state.usageStats.tagScores = ensureObject(state.usageStats.tagScores);
    state.usageStats.vibeUsage = ensureObject(state.usageStats.vibeUsage);
    state.usageStats.checkpointUsage = ensureObject(state.usageStats.checkpointUsage);
    state.usageStats.loraUsage = ensureObject(state.usageStats.loraUsage);
    state.usageStats.history = ensureArray(state.usageStats.history).slice(0, 50);

    if (!state.chats.length) {
      const fallback = createDefaultState({ now, idFactory: options.idFactory });
      state.chats = fallback.chats;
      state.activeChatId = fallback.activeChatId;
      warnings.push("A replacement chat was created because the saved chat list was empty.");
    }
    if (!state.activeChatId || !state.chats.some((chat) => chat.id === state.activeChatId)) {
      state.activeChatId = state.chats[0].id;
    }

    const previousMeta = ensureObject(state.meta);
    const createdAt = Number(previousMeta.createdAt || state.savedAt || now);
    state.schemaVersion = STATE_SCHEMA_VERSION;
    state.meta = {
      ...previousMeta,
      format: STATE_FORMAT,
      revision: Math.max(0, Number(previousMeta.revision || 0)),
      createdAt,
      updatedAt: Math.max(createdAt, Number(previousMeta.updatedAt || state.savedAt || now)),
      migratedFrom: fromVersion < STATE_SCHEMA_VERSION ? fromVersion : previousMeta.migratedFrom ?? null,
      lastWriter: previousMeta.lastWriter || "migration"
    };
    state.savedAt = state.meta.updatedAt;

    return {
      state,
      migrated: fromVersion !== STATE_SCHEMA_VERSION,
      fromVersion,
      warnings
    };
  }

  function isEmbeddedImage(value) {
    return typeof value === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value);
  }

  function fallbackHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  async function digestImage(dataUrl) {
    if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataUrl));
      return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
    }
    return fallbackHash(dataUrl);
  }

  async function externalizeAssets(input, uploadAsset) {
    const state = clone(input);
    const uploaded = [];
    if (typeof uploadAsset !== "function") return { state, uploaded };
    for (const collectionName of IMAGE_COLLECTIONS) {
      const collection = ensureArray(state[collectionName]);
      for (const item of collection) {
        if (!isEmbeddedImage(item?.image)) continue;
        const assetId = `img-${await digestImage(item.image)}`;
        const result = await uploadAsset({ id: assetId, dataUrl: item.image });
        if (!result?.url) throw new Error(`Asset upload did not return a URL for ${assetId}.`);
        item.assetId = result.id || assetId;
        item.image = result.url;
        uploaded.push({ id: item.assetId, url: item.image, collection: collectionName, itemId: item.id || "" });
      }
    }
    return { state, uploaded };
  }

  function createLocalBackup(input) {
    // The local copy is the emergency journal. Keep embedded bytes until the
    // asset upload and revisioned disk commit have both succeeded.
    return clone(input);
  }

  function sameValue(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function mergeStableCollection(baseValue, localValue, remoteValue) {
    const base = ensureArray(baseValue);
    const local = ensureArray(localValue);
    const remote = ensureArray(remoteValue);
    const keyed = (items) => new Map(items.filter((item) => item && typeof item === "object" && item.id).map((item) => [String(item.id), item]));
    const baseById = keyed(base);
    const localById = keyed(local);
    const remoteById = keyed(remote);
    const order = [];
    [...local, ...remote, ...base].forEach((item) => {
      const id = item && typeof item === "object" ? String(item.id || "") : "";
      if (id && !order.includes(id)) order.push(id);
    });

    const merged = [];
    order.forEach((id) => {
      const original = baseById.get(id);
      const localItem = localById.get(id);
      const remoteItem = remoteById.get(id);
      const localChanged = !sameValue(localItem, original);
      const remoteChanged = !sameValue(remoteItem, original);

      if (!localItem && original && !remoteChanged) return;
      if (!remoteItem && original && !localChanged) return;
      if (localChanged && localItem) merged.push(clone(localItem));
      else if (remoteItem) merged.push(clone(remoteItem));
      else if (localItem) merged.push(clone(localItem));
    });

    // Preserve unkeyed legacy rows rather than silently discarding them.
    [...local, ...remote].forEach((item) => {
      if (item && typeof item === "object" && item.id) return;
      if (!merged.some((candidate) => sameValue(candidate, item))) merged.push(clone(item));
    });
    return merged;
  }

  function mergeObjects(baseValue, localValue, remoteValue) {
    const base = ensureObject(baseValue);
    const local = ensureObject(localValue);
    const remote = ensureObject(remoteValue);
    const merged = { ...clone(remote) };
    new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]).forEach((key) => {
      const localChanged = !sameValue(local[key], base[key]);
      const remoteChanged = !sameValue(remote[key], base[key]);
      if (!(key in local) && key in base && !remoteChanged) delete merged[key];
      else if (localChanged && local[key] && typeof local[key] === "object" && !Array.isArray(local[key]) &&
        remote[key] && typeof remote[key] === "object" && !Array.isArray(remote[key])) {
        merged[key] = mergeObjects(base[key], local[key], remote[key]);
      }
      else if (localChanged && Array.isArray(local[key]) && Array.isArray(remote[key])) {
        merged[key] = mergeStableCollection(base[key], local[key], remote[key]);
      }
      else if (localChanged) merged[key] = clone(local[key]);
      else if (!remoteChanged && key in local) merged[key] = clone(local[key]);
    });
    return merged;
  }

  function mergeConcurrentState(baseValue, localValue, remoteValue, options = {}) {
    const base = migrateState(baseValue, options).state;
    const local = migrateState(localValue, options).state;
    const remote = migrateState(remoteValue, options).state;
    const merged = { ...clone(remote), ...clone(local) };
    STABLE_ID_COLLECTIONS.forEach((name) => {
      merged[name] = mergeStableCollection(base[name], local[name], remote[name]);
    });
    ["builder", "settings", "usageStats"].forEach((name) => {
      merged[name] = mergeObjects(base[name], local[name], remote[name]);
    });
    merged.meta = { ...remote.meta, ...local.meta, revision: remote.meta.revision };
    merged.savedAt = Math.max(Number(local.savedAt || 0), Number(remote.savedAt || 0));
    if (!merged.chats.some((chat) => chat.id === merged.activeChatId)) {
      merged.activeChatId = merged.chats[0]?.id || remote.activeChatId;
    }
    return migrateState(merged, options).state;
  }

  function stateFreshness(state) {
    return {
      revision: Number(state?.meta?.revision || 0),
      updatedAt: Number(state?.meta?.updatedAt || state?.savedAt || 0)
    };
  }

  function chooseFreshest(a, b) {
    if (!a) return b;
    if (!b) return a;
    const af = stateFreshness(a);
    const bf = stateFreshness(b);
    if (af.revision !== bf.revision) return af.revision > bf.revision ? a : b;
    return af.updatedAt >= bf.updatedAt ? a : b;
  }

  function createStateStore(options = {}) {
    const fetchImpl = options.fetch || globalThis.fetch?.bind(globalThis);
    const storage = options.storage || globalThis.localStorage;
    const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    const apiBase = String(options.apiBase || "/api").replace(/\/$/, "");
    const debounceMs = Math.max(0, Number(options.debounceMs ?? 180));
    const now = options.now || (() => Date.now());
    const onError = typeof options.onError === "function" ? options.onError : () => {};
    const onSaved = typeof options.onSaved === "function" ? options.onSaved : () => {};
    const apiHeaders = Object.freeze({ [API_CLIENT_HEADER]: API_CLIENT_VALUE });
    let revision = 0;
    let pendingState = null;
    let baseState = null;
    let timer = null;
    let activeFlush = null;
    let closed = false;
    const waiters = [];

    function readLocal() {
      if (!storage) return null;
      const keys = [storageKey, ...LEGACY_STORAGE_KEYS];
      for (const key of keys) {
        try {
          const raw = storage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") return parsed;
        } catch (error) {
          onError(error, { operation: "read-local", key });
        }
      }
      return null;
    }

    function writeLocal(state) {
      if (!storage) return;
      try {
        storage.setItem(storageKey, JSON.stringify(createLocalBackup(state)));
      } catch (error) {
        onError(error, { operation: "write-local", key: storageKey });
      }
    }

    async function readRemote() {
      if (!fetchImpl) return null;
      const response = await fetchImpl(`${apiBase}/state`, { cache: "no-store", headers: apiHeaders });
      if (!response.ok) throw new Error(`State load failed with HTTP ${response.status}.`);
      const value = await response.json();
      return value && typeof value === "object" && Object.keys(value).length ? value : null;
    }

    async function uploadAsset(asset) {
      if (!fetchImpl) throw new Error("No fetch implementation is available for asset storage.");
      const response = await fetchImpl(`${apiBase}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify(asset)
      });
      if (!response.ok) throw new Error(`Asset save failed with HTTP ${response.status}.`);
      return response.json();
    }

    async function load() {
      const local = readLocal();
      let remote = null;
      try {
        remote = await readRemote();
      } catch (error) {
        onError(error, { operation: "read-remote" });
      }
      const selected = chooseFreshest(local, remote);
      const migration = migrateState(selected, { now: now(), idFactory: options.idFactory });
      revision = migration.state.meta.revision;
      baseState = clone(migration.state);
      writeLocal(migration.state);
      return migration;
    }

    async function persistSnapshot(snapshot, conflictAttempt = 0) {
      const migrated = migrateState(snapshot, { now: now(), idFactory: options.idFactory }).state;
      migrated.meta.updatedAt = now();
      migrated.savedAt = migrated.meta.updatedAt;
      const externalized = await externalizeAssets(migrated, uploadAsset);
      const response = await fetchImpl(`${apiBase}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          schemaVersion: STATE_SCHEMA_VERSION,
          expectedRevision: revision,
          state: externalized.state
        })
      });
      if (response.status === 409) {
        const conflict = await response.json();
        revision = Number(conflict.revision || revision);
        if (conflictAttempt >= 2) throw new Error(`State revision conflict after retry. Disk is at revision ${revision}.`);
        const remote = await readRemote();
        if (!remote) throw new Error("State revision conflict could not reload the disk state.");
        const migratedRemote = migrateState(remote, { now: now(), idFactory: options.idFactory }).state;
        revision = migratedRemote.meta.revision;
        const merged = mergeConcurrentState(baseState || migratedRemote, migrated, migratedRemote, {
          now: now(),
          idFactory: options.idFactory
        });
        return persistSnapshot(merged, conflictAttempt + 1);
      }
      if (!response.ok) throw new Error(`State save failed with HTTP ${response.status}.`);
      const result = await response.json();
      revision = Number(result.revision || revision + 1);
      externalized.state.meta.revision = revision;
      externalized.state.meta.updatedAt = Number(result.savedAt || externalized.state.meta.updatedAt);
      externalized.state.savedAt = externalized.state.meta.updatedAt;
      baseState = clone(externalized.state);
      writeLocal(externalized.state);
      onSaved(externalized.state, result);
      return { state: externalized.state, result, uploaded: externalized.uploaded };
    }

    async function runFlush() {
      if (activeFlush) return activeFlush;
      activeFlush = (async () => {
        let latest = null;
        let inFlightSnapshot = null;
        try {
          while (pendingState) {
            inFlightSnapshot = pendingState;
            pendingState = null;
            latest = await persistSnapshot(inFlightSnapshot);
            inFlightSnapshot = null;
          }
          waiters.splice(0).forEach(({ resolve }) => resolve(latest));
          return latest;
        } catch (error) {
          if (inFlightSnapshot) {
            pendingState = pendingState
              ? mergeConcurrentState(baseState || inFlightSnapshot, pendingState, inFlightSnapshot, {
                now: now(), idFactory: options.idFactory
              })
              : clone(inFlightSnapshot);
          }
          waiters.splice(0).forEach(({ reject }) => reject(error));
          onError(error, { operation: "write-remote" });
          throw error;
        }
      })();
      try {
        return await activeFlush;
      } finally {
        activeFlush = null;
      }
    }

    function save(state, saveOptions = {}) {
      if (closed) return Promise.reject(new Error("State store is closed."));
      pendingState = clone(state);
      writeLocal(migrateState(pendingState, { now: now(), idFactory: options.idFactory }).state);
      if (timer) clearTimeout(timer);
      if (saveOptions.immediate || debounceMs === 0) return runFlush();
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
        timer = setTimeout(() => {
          timer = null;
          runFlush().catch(() => {});
        }, debounceMs);
      });
    }

    async function flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return runFlush();
    }

    function whenIdle() {
      if (!timer && !activeFlush && !pendingState) return Promise.resolve(null);
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    }

    async function close() {
      await flush();
      closed = true;
      activeStores.delete(storeApi);
    }

    const storeApi = Object.freeze({
      load,
      save,
      flush,
      whenIdle,
      close,
      readLocal,
      getRevision: () => revision,
      isIdle: () => !timer && !activeFlush && !pendingState
    });
    activeStores.add(storeApi);
    return storeApi;
  }

  async function flushAll() {
    await Promise.all(Array.from(activeStores, (store) => store.flush()));
    return true;
  }

  async function whenAllIdle() {
    await Promise.all(Array.from(activeStores, (store) => store.whenIdle()));
    return true;
  }

  return Object.freeze({
    STATE_SCHEMA_VERSION,
    STATE_FORMAT,
    DEFAULT_STORAGE_KEY,
    LEGACY_STORAGE_KEYS,
    createDefaultState,
    migrateState,
    externalizeAssets,
    createLocalBackup,
    mergeConcurrentState,
    chooseFreshest,
    createStateStore,
    flushAll,
    whenAllIdle,
    isEmbeddedImage
  });
});
