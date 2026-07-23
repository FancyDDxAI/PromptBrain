# PromptBrain Repository Map

This is the authoritative ownership and dependency map for PromptBrain. Read it
before deleting, replacing, moving, or regenerating files.

## Status Labels

- **PROTECTED SOURCE**: authored knowledge or policy. Do not delete, flatten, or
  regenerate. Make only small reviewed corrections backed by a failing test.
- **DERIVED**: deterministic output. Never edit by hand; regenerate with its
  owning build tool.
- **RUNTIME SOURCE**: editable application code. Changes require tests.
- **TEST/REPORT**: verification code or evidence. Do not weaken it to obtain a
  pass.
- **BUILD OUTPUT**: disposable compiler/publisher output, not source.
- **USER DATA**: irreplaceable installation data. Never delete or mirror over it.

## What the 23,000 Concepts Are

The Phase 8 catalog is not a pile of disposable filler. The original eight
authored packs compile to exactly **23,200 Phase 8 concepts**, plus 324 named
entities and 1,008 art recipes. The effective engine catalog combines that
delta with the built-in foundation and contains more than 26,000 concepts.

Most concepts come from reviewed semantic matrices. A matrix defines meaningful
axes, templates, allowed combinations, exclusions, requirements, conflicts,
aliases, checkpoint compatibility, content mode, family, and provenance. The
compiler expands those authored rules into stable individual concepts. Every
result retains the source pack, matrix rule, and exact source-axis values. This
is compact knowledge authoring, not random word-pair generation.

Deleting the matrix output removes most of the offline engine's vocabulary for
understanding free-text requests, selecting compatible details, producing
variation, filtering by checkpoint/content mode, and learning preferences.

Original Phase 8 contributions:

| Authored pack | Compiled contribution | Purpose |
| --- | ---: | --- |
| `adult-fantasy.json` | 2,480 concepts | Adult-mode anatomy, actions, interactions, poses, fantasy participants, and related scene vocabulary. |
| `character-performance.json` | 4,800 concepts | Poses, actions, expressions, body language, performance, and participant behavior. |
| `scene-craft.json` | 5,291 concepts | Environments, lighting, cameras, composition, palettes, motifs, effects, and scene grammar. |
| `visual-language.json` | 5,793 concepts | Quality, style, rendering, artistic language, and prompt-only style tokens such as `usnr`, `bbg_style`, and `748cmstyle`. |
| `wardrobe.json` | 4,802 concepts | Garments, outfit components, materials, styling, accessories, and wardrobe states. |
| `installed-loras.json` | 34 concepts | Only real installed image LoRAs, with commands, compatibility, weights, hashes, and safetensors provenance. |
| `anime-entities.json` | 324 entities | Namespaced anime character identity records and prompt tags; not generic traits. |
| `art-recipes.json` | 1,008 recipes | 42 coordinated artistic families with 24 variants each. Recipes select coherent sets rather than loose tags. |

`artistic-richness.json` (11 concepts), `character-traits.json` (39 concepts),
and `character-staging-recipes.json` (144 recipes) are newer authored extension
packs created after the accepted eight-pack baseline. They are **PROTECTED
SOURCE**, not generated output. Keep them, validate them, and document them as
a Phase 9/10 delta rather than silently rewriting Phase 8 history. With them
present, the current manifest reports 23,250 delta concepts, 324 delta entities,
1,152 delta recipes, and an effective engine of 26,200 concepts, 330 entities,
and 1,446 recipes.

## Knowledge Source Files

### `knowledge/packs/phase-8/*.json` — PROTECTED SOURCE

These are the human-reviewable source of truth. Direct `entries` describe
individual concepts. `matrices` describe bounded semantic expansions. Entity
packs use namespaced groups. Recipe packs use recipe families and selectors.
Do not replace these files with their expanded output or reduce them because
their raw JSON has fewer rows than the compiled catalog.

### `knowledge/phase-8-policy.json` — PROTECTED SOURCE

Defines minimum catalog coverage, required checkpoint bases, quality floor,
adult-concept floor, and zero-error/duplicate gates. It prevents a damaged or
truncated catalog from being accepted.

### `knowledge/catalog-policy.json` — PROTECTED SOURCE

General knowledge audit policy used by the Phase 7 toolchain.

### `knowledge/catalog-baseline.json` — PROTECTED SOURCE

The accepted diagnostic ceiling from the previous catalog. It distinguishes
known overlap warnings from new regressions. Never update it merely to hide a
new warning or failure.

### `knowledge/packs/phase-7-example-art-direction.json` — FIXTURE/EXAMPLE

A small example pack for the Phase 7 authoring/compiler workflow. It is not the
shipping Phase 8 library.

## Knowledge Build Tools

### `tools/knowledge-toolchain.js` — BUILD/AUDIT SOURCE

Canonical normalizer, validator, matrix expander, duplicate/near-duplicate
auditor, coverage calculator, quality scorer, fingerprint generator, pack
compiler, and semantic differ. Matrix expansion occurs here. It attaches
provenance (`packId`, `ruleId`, and `sourceValues`) to every compiled concept.

### `tools/phase8-catalog-builder.js` — BUILD SOURCE

Combines multiple concept, entity, and recipe packs with the built-in catalog.
It resolves cross-pack references, validates adult/entity evidence, enforces
recipe semantics, applies policy/baseline gates, produces stable IDs, shards
the catalog, hashes artifacts, and verifies round trips.

### `tools/build-phase8-catalog.js` — PRODUCTION BUILD ENTRY POINT

Reads every JSON pack in `knowledge/packs/phase-8/`, calls the two toolchain
layers, writes deterministic artifacts, and prunes only stale files beneath
`knowledge/generated/phase-8/`. `--check` renders in memory and compares without
writing. This is the only approved writer for generated Phase 8 artifacts.

### Other tools

- `tools/knowledge-cli.js`: Phase 7 audit/compile/coverage/diff CLI.
- `tools/lora-metadata-scanner.js`: read-only bounded safetensors header scanner
  and optional streaming SHA-256 verifier for installed LoRAs.
- `tools/audit-promptbrain.js`: legacy application/library inventory aid.
- `tools/test-state-api.ps1`: state API smoke-test helper.

## Generated Catalog

### `knowledge/generated/phase-8/` — DERIVED

Never hand-edit files here. They can be replaced only by
`node tools/build-phase8-catalog.js` after authored source changes.

- `manifest.json`: runtime index and integrity contract. Lists source/delta/
  effective fingerprints, pack fingerprints, counts, gates, and every artifact
  hash. `catalog-store.js` uses its file list to discover runtime shards.
- `concepts/<kind>.json`: one runtime shard per concept kind (`quality`,
  `style`, `subject`, `anatomy`, `action`, `interaction`, `pose`, `expression`,
  `wardrobe`, `environment`, `lighting`, `camera`, `composition`, `palette`,
  `motif`, `effect`, and `lora`). These contain the expanded 23k vocabulary.
- `entities/<namespace-hash>.json`: one shard per anime namespace/series. Each
  file contains only named identities for that namespace.
- `recipes/<family-hash>.json`: one shard per artistic recipe family, normally
  24 coordinated variants.
- `catalog-delta.json`: aggregate copy of the entire Phase 8 delta for audit and
  tooling. It duplicates shard payloads and is deliberately not embedded in the
  executable.
- `audit.json`: diagnostics from structural, compatibility, alias, duplicate,
  near-duplicate, and semantic validation.
- `coverage.json`: real counts by kind, mode, base, checkpoint, family, source,
  and namespace.
- `quality.json`: calculated quality ratios and risk list.

The shipping executable embeds `manifest.json` and the concept/entity/recipe
shards. It does not need the aggregate delta or report files at runtime.

## Offline Engine

All files in `engine/` are **RUNTIME SOURCE**.

- `contracts.js`: schemas, constructors, block order, enums, and validators for
  PromptIntent, KnowledgeEntry, ArtRecipe, ScenePlan, and CompiledPrompt.
- `seed-knowledge.js`: small trusted foundation: 17 checkpoint compiler
  profiles, essential concepts/entities/recipes, prompt styles, quality order,
  weight syntax, negative support, and token budgets.
- `curated-knowledge.js`: compact built-in curated vocabulary used before and
  alongside the large catalog.
- `art-director.js`: scores coherent recipe families against intent, picks a
  deterministic variant, and validates coordinated artistic direction.
- `reasoning-engine.js`: compiles semantic intent, builds scene graphs, scores
  coherent seeded variation, repairs contradictions, and critiques prompts.
- `prompt-engine.js`: normalizes requests, resolves explicit concepts and named
  entities, applies content/checkpoint compatibility, requirements/conflicts,
  builds ScenePlan blocks, and compiles checkpoint-specific prompts.
- `catalog-store.js`: loads the manifest and shards in Node or WebView, checks
  counts, derives recipe-family indexes, registers concepts/recipes with the Art
  Director first and then concepts/entities/recipes with Prompt Engine, and
  builds compact UI indexes.
- `learning-bridge.js`: converts persisted feedback scores and training rules
  into optional ranking boosts/avoids, including checkpoint/archetype/theme
  context. It cannot override explicit requests.
- `state-store.js`: State V2 browser bridge, migrations, serialized saves,
  revision handling, lightweight local backup, and image externalization.

The built-in seed/curated catalog is the boot foundation. The Phase 8 delta is
registered on top of it; existing trusted IDs win, while new IDs extend the
vocabulary. The two layers are complementary, not alternatives.

## Runtime Connection Chain

1. Authored packs in `knowledge/packs/phase-8/` are compiled by
   `tools/build-phase8-catalog.js`.
2. The builder writes `manifest.json`, 113 catalog shards, and four audit/report
   artifacts beneath `knowledge/generated/phase-8/`.
3. `src/PromptBrain/PromptBrain.csproj` embeds the manifest plus all concept,
   entity, and recipe shards into the executable.
4. `src/PromptBrain/Program.cs` safely serves embedded engine scripts under
   `/engine/...` and catalog resources under `/catalog/...`.
5. `promptbrain.html` loads scripts in dependency order: state store, contracts,
   seed, curated, Art Director, Reasoning Engine, Prompt Engine, catalog store,
   learning bridge, and finally `promptbrain.js`.
6. `promptbrain.js::ensureEngineCatalog()` fetches `/catalog/manifest.json`,
   loads the listed shards, registers them with the Art Director and Prompt
   Engine, builds the alias index, and marks the engine ready.
7. Workspace generation calls the engine with the request, selected checkpoint,
   content mode, vibe, explicit selections, LoRAs, and learned memory.
8. The engine returns semantic intent, scene graph, seeded variation,
   constraint repairs, scene plan, compiled prompt, critic score, warnings,
   token estimate, and decision trace.
9. If catalog loading fails, the UI reports the error and stops generation. It
   does not substitute the older tag builder. Optional Ollama failure falls back
   only to the already-loaded deterministic engine, never to legacy generation.

## Application Files

- `promptbrain.html` — **RUNTIME SOURCE**: WebView DOM and script loading order.
- `promptbrain.css` — **RUNTIME SOURCE**: responsive visual system and themes.
- `promptbrain.js` — **RUNTIME SOURCE**: UI state, navigation, sessions,
  workspace, models, training, result/image memory, insights, settings,
  persistence integration, catalog startup, and authoritative engine invocation.
  Legacy helper data may remain for non-generation UI tools, but Workspace
  generation is engine-only and fails closed when the catalog is unavailable.
- `app-icon.ico`, `app-icon.png` — application branding assets.
- root `PromptBrain.exe` — **BUILD OUTPUT**, not source. Never patch it.
- `output/publish-PromptBrain-*` — **BUILD OUTPUT** from `dotnet publish`; deploy
  only root application files after all source and packaged tests pass.

Files such as `app.js`, `index.html`, `styles.css`, `Cutout Studio.exe`,
`starfall-courier/`, and ComfyUI workflow JSON files are separate projects or
assets. They are not PromptBrain engine/catalog source.

## Native Wrapper

- `src/PromptBrain/PromptBrain.csproj` — **RUNTIME/BUILD SOURCE**: .NET settings,
  WebView2 dependency, and exact embedded resources. Missing an engine or shard
  here means it cannot ship.
- `src/PromptBrain/Program.cs` — **RUNTIME SOURCE**: WinForms/WebView host,
  embedded HTTP server, resource routing, state/assets APIs, optional Ollama and
  research proxy, atomic state writes, backup recovery, and E-drive fallback.
- `src/PromptBrain/app.manifest` — Windows application manifest.
- `src/PromptBrain/Assets/*` — embedded icons.
- `src/PromptBrain/bin/` and `obj/` — **BUILD OUTPUT**; never hand-edit.

## Tests

All files below are **TEST SOURCE**.

- `contracts.test.js`: contract constructors and validation.
- `prompt-engine.test.js`: intent, compatibility, planning, and compiler cases.
- `prompt-engine-stress.test.js`: hundreds of deterministic cross-checkpoint
  generations and invariants.
- `reasoning-engine.test.js`: semantic intent, scene graph, constraints,
  variation, coherence ranking, and critic behavior.
- `reasoning-campaign.test.js`: deterministic semantic quality across every
  checkpoint dialect, including contradictory directions.
- `art-director.test.js`: recipe scoring, variation, and artistic coherence.
- `catalog-store.test.js`: manifest/shard loading, registration, and failures.
- `learning-bridge.test.js`: feedback/training ranking without overriding intent.
- `browser-engine.test.js`: browser/WebView global loading compatibility.
- `state-store.test.js`: State V2 migration, serialized saves, and assets.
- `knowledge-toolchain.test.js`: compiler/audit behavior and 30k scale.
- `knowledge-cli.test.js`: CLI behavior and exit codes.
- `phase8-catalog-builder.test.js`: multi-pack, collision, semantic, integrity,
  adult-evidence, artifact, and target gates.
- `phase8-build-cli.test.js`: production builder write/check/prune behavior.
- `phase8-scale.test.js`: real full-catalog determinism, coverage, near-duplicate
  audit, provenance, adult/SFW separation, recipe depth, and artifact integrity.
- `character-staging.test.js`: neutral staging, authored family reachability,
  content gating, and prompt-budget behavior.
- `phase9-evaluation.test.js`: the accepted 23-gate, 11,005-call campaign.
- `lora-metadata-scanner.test.js`: synthetic safetensors safety and metadata.
- `tools/ui-smoke.js`: real-browser engine, responsive UI, LoRA command, theme,
  session, training, reference-asset, reload, and deletion verification.
- `tests/fixtures/`: immutable golden/invalid inputs used by tests.
- `PromptBrain.ApiSmokeTest/`: starts the real embedded server and verifies UI
  resources, State V2 revision conflicts, backup recovery, and image assets.
- `PromptBrain.PackagedResourceTest/`: verifies the shipping assembly contains
  and serves the engine and generated catalog resources. This must not pass by
  exercising only source files.

Do not delete or weaken a test because it exposes an integration problem.

## Documentation

- `promptbrain-engine-architecture.md`: authoritative offline reasoning design.
- `promptbrain-phase-1-audit.md`: legacy baseline and original defects.
- `promptbrain-phase-3-report.md`: first deterministic reasoning engine report.
- `promptbrain-phases-4-6-report.md`: Art Director, curated knowledge, and State
  V2 implementation.
- `promptbrain-phase-7-toolchain.md`: authoring/audit toolchain and handoff.
- `promptbrain-phase-8-catalog.md`: accepted eight-pack counts, fingerprints,
  diagnostics, LoRA verification, and deployment status at Phase 8 completion.
- `promptbrain-phase-9-evaluation.md`: deterministic campaign design, results,
  digest, and remediation evidence.
- `promptbrain-phase-10-release.md`: final UI/native integration, verification,
  publication, deployment, and protected-folder record.
- `promptbrain-state-v2.md`: disk layout, revision protocol, assets, and recovery.
- This file: repository ownership, purpose, and runtime dependency map.

Phase 9/10 reports must distinguish the accepted eight-pack Phase 8 baseline
from later authored corrections or extensions.

## Installation and Data Boundaries

`E:\PromptBrain\data`, `models`, `runtime`, and `runtimes` are **USER DATA** or
installed dependencies. Never delete, reset, or mirror over them. In particular:

- `data/promptbrain-state.json`: user settings, sessions, ratings, learning, and
  asset references.
- `data/promptbrain-state.backup.json`: last-known-good recovery state.
- `data/assets/`: externalized user images.
- `models/`: local model files.
- `runtime/` or `runtimes/`: local AI/native runtime dependencies.

Only root application files from a verified `output/publish-PromptBrain-*` may
overwrite application binaries in `E:\PromptBrain`, and only after backing up
the existing executable. Never copy or mirror publish-time `data`, `models`,
`runtime`, or `runtimes` folders over the installation.

## Safe Change Rules

1. Never delete a large set because it looks generated. Determine whether it is
   authored source, derived output, runtime code, test evidence, or user data.
2. Never edit generated catalog JSON manually. Change the smallest authored
   rule, add a reproducing test, rebuild, and compare fingerprints/diagnostics.
3. Never rewrite the accepted packs wholesale. A Phase 9 defect permits a small
   documented correction, not replacement.
4. Never treat optional AI output or legacy helper behavior as proof that the
   catalog loaded. Verify the fingerprint and effective counts in the packaged
   app; generation must stop if the authoritative engine is unavailable.
5. Never update policy or baseline merely to make a failure disappear.
6. Never fabricate analytics, evaluation metrics, or UI data.
7. Before irreversible work, back up the target and report the exact protected
   boundary. If this map conflicts with an older instruction, this map controls.
