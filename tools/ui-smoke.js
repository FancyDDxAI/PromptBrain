"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const catalogRoot = path.join(root, "knowledge", "generated", "phase-8");
const outputRoot = path.join(root, "output");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

let persistedState = null;
let revision = 0;
let saveCount = 0;
const assets = new Map();

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("Asset payload is not a base64 data URL.");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}

function safeFile(base, relative) {
  const candidate = path.resolve(base, relative.replace(/^[/\\]+/, ""));
  return candidate === base || candidate.startsWith(`${base}${path.sep}`) ? candidate : "";
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/status") {
    return sendJson(response, 200, { dataRoot: "ui-smoke", statePath: "ui-smoke/promptbrain-state.json" });
  }
  if (pathname === "/api/state" && request.method === "GET") {
    return sendJson(response, 200, persistedState || {});
  }
  if (pathname === "/api/state" && request.method === "POST") {
    const payload = JSON.parse(await readBody(request) || "{}");
    const expected = Number(payload.expectedRevision ?? revision);
    if (expected !== revision) return sendJson(response, 409, { revision });
    revision += 1;
    const now = Date.now();
    persistedState = payload.state || payload;
    persistedState.meta = {
      ...(persistedState.meta || {}),
      format: "promptbrain-state",
      revision,
      updatedAt: now,
      lastWriter: "ui-smoke"
    };
    persistedState.savedAt = now;
    saveCount += 1;
    return sendJson(response, 200, { revision, savedAt: now });
  }
  if (pathname === "/api/assets" && request.method === "POST") {
    const payload = JSON.parse(await readBody(request) || "{}");
    const id = payload.id || "smoke-asset";
    assets.set(id, decodeDataUrl(payload.dataUrl));
    return sendJson(response, 200, { id, url: `/api/assets/${id}.png` });
  }
  if (pathname.startsWith("/api/assets/") && request.method === "GET") {
    const id = path.basename(pathname, path.extname(pathname));
    const asset = assets.get(id);
    if (!asset) return sendJson(response, 404, { error: "Asset not found" });
    response.writeHead(200, { "Content-Type": asset.mimeType, "Cache-Control": "no-store" });
    return response.end(asset.buffer);
  }
  return sendJson(response, 404, { error: "Not found" });
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      if (pathname.startsWith("/api/")) return await handleApi(request, response, pathname);

      const fromCatalog = pathname.startsWith("/catalog/");
      const relative = fromCatalog
        ? pathname.slice("/catalog/".length)
        : pathname === "/" ? "promptbrain.html" : pathname.slice(1);
      const base = fromCatalog ? catalogRoot : root;
      const file = safeFile(base, relative);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404);
        return response.end("Not found");
      }
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function waitForSave(page, previousCount = saveCount) {
  await page.waitForFunction(() => document.querySelector("#sessionSaveStatus")?.textContent.includes("Saved"));
  const deadline = Date.now() + 5000;
  while (saveCount <= previousCount && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(saveCount > previousCount, "UI change did not reach the revisioned state endpoint");
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    composer: (() => {
      const rect = document.querySelector("#workspaceComposer").getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    })()
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.innerWidth + 1, `${label} has horizontal overflow: ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.composer.left >= -1 && dimensions.composer.right <= dimensions.innerWidth + 1, `${label} composer escapes the viewport`);
  return dimensions;
}

async function run() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const server = createServer();
  const port = await listen(server);
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#brainStats")?.textContent.includes("26,200"), null, { timeout: 30000 });
    assert.match(await page.locator("#brainStats").innerText(), /1,446 recipes/);

    const request = "artistic dragon girl warrior above a neon city, dynamic action scene";
    await page.locator("#userPrompt").fill(request);
    await page.waitForFunction(() => document.querySelector("#positivePromptOutput")?.textContent.includes("dragon girl"));
    let positive = await page.locator("#positivePromptOutput").innerText();
    const waiHead = "masterpiece, best quality, premium illustration, clean polished anime shading, anime style";
    assert.ok(positive.startsWith(waiHead), `WAI prompt head drifted: ${positive.slice(0, 160)}`);
    assert.ok(!/tohru|maid.?dragon/i.test(positive), "generic dragon girl resolved to a named Maid Dragon character");

    await page.locator(".lora-context").evaluate((node) => { node.open = true; });
    await page.locator('#styleTokenPicker [data-style-token="usnr"]').click();
    positive = await page.locator("#positivePromptOutput").innerText();
    assert.match(positive, /(?:^|, )usnr(?:,|$)/);
    assert.doesNotMatch(positive, /<lora:usnr/i);

    const firstLora = page.locator("#loraPicker [data-lora]").first();
    assert.ok(await firstLora.count(), "no compatible installed LoRA was rendered");
    await firstLora.click();
    const slider = page.locator("#selectedLoras [data-lora-weight]").first();
    assert.ok(await slider.count(), "selected LoRA did not render its live weight slider");
    await slider.fill("0.55");
    await slider.dispatchEvent("input");
    positive = await page.locator("#positivePromptOutput").innerText();
    assert.match(positive, /<lora:[^>]+:0\.55>/i, "LoRA slider did not update the prompt command");

    const beforeGenerate = saveCount;
    await page.locator("#generateBtn").click();
    await page.waitForFunction(() => !document.querySelector("#generateBtn")?.disabled);
    assert.equal(await page.locator("#userPrompt").inputValue(), request, "generation cleared the working request");
    await waitForSave(page, beforeGenerate);
    assert.equal(persistedState.usageStats.totalPrompts, 1, "real prompt counter did not increment");
    await page.locator(".session-drawer > details").evaluate((node) => { node.open = true; });
    const reasoningSummary = page.locator(".message.assistant .reasoning-details summary").last();
    assert.ok(await reasoningSummary.count(), "generated prompt did not expose scene reasoning");
    assert.match(await reasoningSummary.textContent(), /Scene reasoning\s+\d+\/100/i);
    const savedReasoning = persistedState.chats
      .flatMap((chat) => chat.messages || [])
      .findLast((message) => message.promptPack)?.promptPack?.engine?.reasoning;
    assert.ok(savedReasoning?.score >= 80, "reasoning diagnostics were not persisted with the prompt");
    assert.ok(savedReasoning?.archetype, "saved reasoning has no scene archetype");
    const feedbackSave = saveCount;
    await page.locator('.message.assistant [data-rate][data-score="5"]').last().click();
    await waitForSave(page, feedbackSave);
    const contextBuckets = Object.keys(persistedState.usageStats.contextTagScores || {});
    assert.ok(contextBuckets.some((key) => key === `archetype:${savedReasoning.archetype}`), "feedback did not enter contextual memory");
    assert.ok(contextBuckets.some((key) => key.startsWith("checkpoint:")), "feedback lost its checkpoint context");

    await page.locator("#contentModeSelect").selectOption("adult");
    await page.waitForTimeout(100);
    const adultOptions = await page.locator("#characterList option").allTextContents();
    const allowed = new Set([
      "No named character selected",
      "Android 18, Dragon Ball",
      "Tohru, Miss Kobayashi's Dragon Maid",
      "Yor Forger, Spy x Family"
    ]);
    adultOptions.forEach((name) => assert.ok(allowed.has(name), `unreviewed adult character leaked into UI: ${name}`));
    assert.ok(!adultOptions.some((name) => /Anya|Momo Ayase|Nezuko/i.test(name)), "known ineligible character leaked into adult mode");
    const sfwSave = saveCount;
    await page.locator("#contentModeSelect").selectOption("sfw");
    await waitForSave(page, sfwSave);
    await page.locator(".lora-context").evaluate((node) => { node.open = false; });
    await page.locator(".session-drawer > details").evaluate((node) => { node.open = false; });
    await page.locator(".creative-stage").evaluate((node) => { node.scrollTop = 0; });
    await page.locator(".library-panel").evaluate((node) => { node.scrollTop = 0; });

    await assertNoOverflow(page, "desktop");
    await page.screenshot({ path: path.join(outputRoot, "ui-final-desktop.png"), fullPage: false });

    const views = [
      ["loraView", "models"],
      ["memoryView", "insights"],
      ["trainingView", "training"],
      ["variationsView", "result-lab"],
      ["galleryView", "image-memory"],
      ["historyView", "history"]
    ];
    for (const [viewId, fileName] of views) {
      await page.locator(`.nav-btn[data-view="${viewId}"]`).click();
      assert.ok(await page.locator(`#${viewId}`).evaluate((node) => node.classList.contains("is-visible")), `${viewId} did not open`);
      await page.waitForTimeout(220);
      await assertNoOverflow(page, viewId);
      await page.screenshot({ path: path.join(outputRoot, `ui-final-${fileName}.png`), fullPage: false });
    }

    await page.locator('.nav-btn[data-view="trainingView"]').click();
    await page.waitForTimeout(220);
    await page.locator("#trainingTriggerInput").fill("moonlit portrait");
    await page.locator("#trainingAvoidInput").fill("flat lighting");
    await page.locator("#trainingPreferInput").fill("silver rim light, quiet expression");
    const trainingSave = saveCount;
    await page.locator("#saveTrainingBtn").click();
    await waitForSave(page, trainingSave);
    assert.equal(persistedState.trainingRules.length, 1, "training rule did not persist");
    assert.match(persistedState.trainingRules[0].prefer, /silver rim light/);

    await page.locator('.nav-btn[data-view="galleryView"]').click();
    await page.waitForTimeout(220);
    const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    await page.locator("#referenceImageInput").setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: tinyPng });
    await page.locator("#referencePreview img").waitFor({ state: "visible" });
    await page.locator("#referenceNotesInput").fill("high contrast red disc, graphic composition");
    const referenceSave = saveCount;
    await page.locator("#saveReferenceBtn").click();
    await waitForSave(page, referenceSave);
    assert.equal(persistedState.references.length, 1, "reference did not persist");
    assert.match(persistedState.references[0].image, /^\/api\/assets\//, "reference image was not externalized");
    assert.ok(assets.has(persistedState.references[0].assetId), "externalized reference asset was not stored");

    await page.locator('.nav-btn[data-view="chatView"]').click();

    await page.locator("#openSettingsBtn").click();
    const themeSave = saveCount;
    await page.locator("#themeSelect").selectOption("daylight");
    assert.equal(await page.locator("body").getAttribute("data-theme"), "daylight");
    await page.screenshot({ path: path.join(outputRoot, "ui-final-settings-daylight.png"), fullPage: false });
    await page.locator("#closeSettingsBtn").click();
    await waitForSave(page, themeSave);

    const draftSave = saveCount;
    await page.locator("#newChatBtn").click();
    await page.locator("#userPrompt").fill("session draft persistence check");
    await waitForSave(page, draftSave);
    assert.ok(persistedState.chats.length >= 2, "new session was not persisted");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#brainStats")?.textContent.includes("26,200"), null, { timeout: 30000 });
    assert.equal(await page.locator("body").getAttribute("data-theme"), "daylight", "theme did not survive reload");
    assert.equal(await page.locator("#userPrompt").inputValue(), "session draft persistence check", "session draft did not survive reload");

    await page.locator('.nav-btn[data-view="trainingView"]').click();
    await page.waitForTimeout(220);
    assert.match(await page.locator("#trainingList").innerText(), /moonlit portrait/);
    assert.match(await page.locator("#trainingList").innerText(), /silver rim light/);

    await page.locator('.nav-btn[data-view="galleryView"]').click();
    await page.waitForTimeout(220);
    assert.equal(await page.locator("#referenceGrid .learn-card").count(), 1, "reference card did not survive reload");
    const referenceLoaded = await page.locator("#referenceGrid img").evaluate((image) => image.complete && image.naturalWidth > 0);
    assert.ok(referenceLoaded, "externalized reference image did not reload");

    await page.locator('.nav-btn[data-view="historyView"]').click();
    await page.waitForTimeout(220);
    const chatsBeforeDelete = persistedState.chats.length;
    const deleteSave = saveCount;
    await page.locator("#historyChatList [data-delete-chat]").first().click();
    await waitForSave(page, deleteSave);
    assert.equal(persistedState.chats.length, chatsBeforeDelete - 1, "chat deletion did not persist");
    const chatsAfterDelete = persistedState.chats.length;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#brainStats")?.textContent.includes("26,200"), null, { timeout: 30000 });
    assert.equal(persistedState.chats.length, chatsAfterDelete, "deleted chat returned after reload");
    assert.equal(persistedState.trainingRules.length, 1, "training rule disappeared after later saves");
    assert.equal(persistedState.references.length, 1, "reference disappeared after later saves");

    await page.locator("#openSettingsBtn").click();
    const finalThemeSave = saveCount;
    await page.locator("#themeSelect").selectOption("night-cyan");
    await page.locator("#closeSettingsBtn").click();
    await waitForSave(page, finalThemeSave);

    await page.setViewportSize({ width: 1024, height: 768 });
    await assertNoOverflow(page, "compact");
    await page.screenshot({ path: path.join(outputRoot, "ui-final-compact.png"), fullPage: false });

    await page.setViewportSize({ width: 800, height: 700 });
    const small = await assertNoOverflow(page, "small");
    assert.ok(small.composer.top >= 0 && small.composer.bottom <= 700, `small composer is not fixed inside the viewport: ${JSON.stringify(small.composer)}`);
    await page.screenshot({ path: path.join(outputRoot, "ui-final-small.png"), fullPage: false });

    assert.deepEqual(browserErrors, [], `browser errors: ${browserErrors.join(" | ")}`);
    console.log(JSON.stringify({
      catalog: { concepts: 26200, recipes: 1446 },
      saves: saveCount,
      sessions: persistedState.chats.length,
      theme: persistedState.settings.theme,
      screenshots: [
        "ui-final-desktop.png", "ui-final-models.png", "ui-final-insights.png", "ui-final-training.png",
        "ui-final-result-lab.png", "ui-final-image-memory.png", "ui-final-history.png",
        "ui-final-compact.png", "ui-final-small.png", "ui-final-settings-daylight.png"
      ]
    }, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
