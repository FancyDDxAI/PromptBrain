# PromptBrain Phases 4-6 Report

## Status

Phases 4, 5, and 6 are implemented and verified in source.

- Phase 4: Art Director expansion - complete
- Phase 5: curated seed knowledge - complete
- Phase 6: versioned persistent state - complete
- E-drive deployment of the complete new prompt engine remains Phase 10

## Phase 4: Art Director

The Art Director is an offline deterministic planning layer. It does not call an API, Ollama, or the internet.

It performs these steps:

1. Reads normalized intent and explicit concepts.
2. Detects visual purpose such as portrait, action, environment, horror, fantasy, cyberpunk, decorative, or fashion.
3. Scores complete art recipes rather than isolated tags.
4. Selects a seeded variant within the strongest visual family.
5. Supplies a coherent style, composition, palette, lighting setup, camera choice, motifs, and effects.
6. Lets explicit user choices replace recipe choices through conflict groups.
7. Records rationale and the next three alternatives for later UI explanation.

The 12 current visual families are:

- Graphic limited-palette poster
- Ukiyo-e decorative print
- Sumi-e expressive ink painting
- Art Nouveau ornamental portrait
- Gothic stained-glass drama
- Baroque fantasy tableau
- Cinematic foreshortened action
- Neon cyberpunk editorial
- Epic fantasy story moment
- Symbolic psychological horror
- Surreal dreamscape portrait
- Luxury fashion editorial

The Art Director adds 288 coherent recipes. The six foundational Phase 3 recipes remain available, for 294 recipes total.

## Phase 5: Curated Seed

The curated catalog contains 2,841 new structured concepts. Together with the 109 foundational concepts, the engine now exposes 2,950 concepts.

Every concept has:

- A stable ID
- A semantic kind
- Prompt text and aliases
- Content mode
- Model compatibility fields
- Dependencies and conflicts
- A conflict group where applicable
- Provenance metadata

Current curated counts:

| Kind | Count |
| --- | ---: |
| Quality | 24 |
| Style | 232 |
| Subject | 35 |
| Anatomy | 160 |
| Action | 270 |
| Interaction | 35 |
| Pose | 246 |
| Expression | 216 |
| Wardrobe | 330 |
| Environment | 190 |
| Lighting | 218 |
| Camera | 183 |
| Composition | 174 |
| Palette | 183 |
| Motif | 175 |
| Effect | 174 |

The catalog is built from curated direct entries and controlled semantic matrices. Matrices only combine compatible axes, such as lighting quality with lighting setup or material treatment with garment type. They are not arbitrary adjective piles.

Catalog matching is indexed. The 600-generation stress test fell from roughly 84 seconds during the first implementation to roughly 3 seconds after removing repeated full-catalog lookups and gating specialized art families behind actual intent.

## Phase 6: State V2

State V2 is backward-compatible with the existing `promptbrain.v1` browser backup and unversioned JSON state.

Implemented behavior:

- Schema version 2 metadata
- Migration without dropping existing chats, training, ratings, settings, references, or usage statistics
- Monotonic disk revisions
- Serialized browser writes
- Debounced saves where every waiting caller resolves
- Optimistic revision checks with HTTP 409 on stale writes
- Atomic temporary-file replacement
- A known-good backup at `promptbrain-state.backup.json`
- Automatic recovery when the primary JSON is corrupt
- Image extraction to `data/assets` using SHA-256 content IDs
- Main state JSON stores asset URLs instead of base64 image payloads
- Lightweight localStorage backup with embedded image data removed
- Configurable test data directory through `PROMPTBRAIN_DATA_DIR`

The existing app source now loads `engine/state-store.js` and uses the new store for hydration and saves. The old save code remains only as a browser-preview fallback.

## Verification

Passing checks:

- JavaScript syntax checks for the app and all engine modules
- Contract tests
- Core prompt engine tests
- Art Director golden-family tests
- Browser/WebView module loading test
- State migration and serialized-write tests
- 600-generation stress test across all 17 checkpoint profiles
- .NET release build
- Headless real HTTP API smoke test
- Revision-conflict test
- State backup creation test
- Deliberate primary-state corruption and backup recovery test
- Image asset upload and retrieval test

The .NET build still reports the existing WebView2 `WindowsBase` version warning and the existing high-DPI manifest warning. There are zero compilation errors.

## Files

- `engine/art-director.js`
- `engine/curated-knowledge.js`
- `engine/prompt-engine.js`
- `engine/state-store.js`
- `tests/art-director.test.js`
- `tests/state-store.test.js`
- `tests/PromptBrain.ApiSmokeTest/`
- `tools/test-state-api.ps1`

## Next Phase

Phase 7 is the knowledge expansion toolchain: authoring/import validation, duplicate detection, coverage reports, catalog linting, and controlled generation of larger structured packs. Phase 8 then uses that toolchain for the 20,000-30,000 entry library.
