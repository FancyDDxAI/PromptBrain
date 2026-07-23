# PromptBrain Phase 8 Catalog

Build date: 2026-07-17

## Scope

This document records the final Phase 8 knowledge catalog as built from the
eight authored packs in `knowledge/packs/phase-8/`. It reports the state of a
completed build, not a plan.

The catalog build had previously been interrupted after 5.8 seconds and left
partial artifacts in `knowledge/generated/phase-8/`. That build was rerun to
completion. `tools/build-phase8-catalog.js` derives every artifact from the
packs, renders them in memory, writes them, then prunes stale files, so the
partial output was fully replaced rather than merged into. The authored packs
were reviewed and integrated as-is; none were regenerated.

## Final Counts

Effective catalog (Phase 7 baseline plus the Phase 8 delta):

| Measure | Count |
| --- | ---: |
| Concepts | 26,150 |
| — SFW | 23,625 |
| — Adult | 2,525 |
| Named entities | 330 |
| Recipes | 1,302 |
| Checkpoints | 17 |
| Concepts with requirements | 4,810 |
| Concepts with conflicts | 15 |
| Quality score | 99.9 / 100 |

Phase 8 delta contributed by the eight packs:

| Measure | Count |
| --- | ---: |
| Concepts | 23,200 |
| Adult concepts | 2,484 |
| Named entities | 324 |
| Recipes | 1,008 |

Effective concepts by kind:

| Kind | Count | Kind | Count |
| --- | ---: | --- | ---: |
| wardrobe | 5,481 | interaction | 1,195 |
| environment | 2,914 | effect | 1,193 |
| camera | 2,514 | anatomy | 1,382 |
| pose | 1,593 | style | 1,210 |
| action | 1,456 | composition | 1,209 |
| expression | 1,287 | motif | 1,197 |
| palette | 1,154 | quality | 989 |
| subject | 684 | lighting | 658 |
| lora | 34 | | |

Checkpoint coverage by base: SD1.5 (8), SDXL (6), Pony (2), FLUX (1). All four
required bases in `knowledge/phase-8-policy.json` are represented.

## Fingerprint

| Fingerprint | Value |
| --- | --- |
| Manifest | `1524c84165c5d05c911ad2924b4ef9de27af7c307012188d7a2c6d73bb068175` |
| Source | `c299d7fef6a1c01b534c0b31ef006b7a38b661e1d6540054d3dfab9e1f056d96` |
| Delta | `b447cdb13a7435223820a143605f08b27994f2f2d4bdd4b8e191cd52c568c1aa` |
| Effective | `5a7ad32af70ca6ff06fbc8c3dc889143dbf7ae918693c7764fc26f377c4083a9` |

Build id `promptbrain-phase-8`, schema version 1, `valid: true`.

The build is deterministic. `node tools/build-phase8-catalog.js --check` was run
after the write and reported no artifact mismatches, confirming the committed
artifacts match a fresh render of the same packs. The independent scale test
performs two further rebuilds (11.65s / 11.42s) and reaches the same
fingerprints.

Every generated file carries a SHA-256 in `manifest.json`. The largest artifact
is `catalog-delta.json` at 33,799,852 bytes
(`e3c7787cb81ed91e6eadc3814f1269be863e1e1048b44772d9b05b2ee310aab6`).

## Gates and Baseline

All policy gates pass with no failures. Every Phase 8 target in
`phase-8-policy.json` is met or exceeded:

| Target | Required | Actual |
| --- | ---: | ---: |
| Concepts | 25,000 | 26,150 |
| Recipes | 1,200 | 1,302 |
| Named entities | 300 | 330 |
| Adult concepts | 2,000 | 2,525 |
| Structural errors | 0 | 0 |
| New canonical duplicates | 0 | 0 |
| Quality score | 99.4 | 99.9 |

Against the Phase 7 baseline there are zero regressions and a quality delta of
+0.5. Structural validity, alias coverage and complete required recipe slots are
all at 1.0; canonical prompt uniqueness is 0.9988 and provenance coverage
0.9958. The risk list is empty.

Diagnostics total 141: **0 errors**, 75 warnings, 66 info.

| Diagnostic | Severity | Count |
| --- | --- | ---: |
| recipe.alias-same-family | info | 64 |
| concept.alias-collision | warning | 33 |
| concept.duplicate-prompt | warning | 29 |
| recipe.alias-cross-family | warning | 10 |
| concept.near-duplicate-prompt | warning | 3 |
| concept.alias-cross-kind | info | 1 |
| concept.cross-kind-prompt | info | 1 |

These are alias and prompt-overlap notices, not structural faults. All match the
baseline counts except `concept.near-duplicate-prompt` (3 vs. baseline 2, delta
+1), which the builder did not classify as a regression. The near-duplicate
audit examined 4,627,567 candidate pairs at a 0.9 threshold in 6.61s and found 3
matches.

## Tests

All 12 JavaScript test files pass (`node --test`, 0 failures):

| Test | Result | Notes |
| --- | --- | --- |
| phase8-scale.test.js | pass | 8 packs; 26,150 / 330 / 1,302; quality 99.9 |
| lora-metadata-scanner.test.js | pass | |
| phase8-catalog-builder.test.js | pass | |
| phase8-build-cli.test.js | pass | |
| prompt-engine.test.js | pass | 2,950 concepts, 294 art recipes |
| prompt-engine-stress.test.js | pass | 600 generations, 23 seeded variants |
| browser-engine.test.js | pass | WebView engine loading |
| art-director.test.js | pass | 2,841 curated concepts, 288 recipes |
| knowledge-toolchain.test.js | pass | 30,000-entry scale audit |
| knowledge-cli.test.js | pass | |
| contracts.test.js | pass | |
| state-store.test.js | pass | 2 serialized writes, 1 externalized asset |

`node --test tests\` fails to enumerate the directory because it tries to load
the `PromptBrain.ApiSmokeTest` C# project and `fixtures` as test modules. This
is a runner invocation quirk, not a project fault; passing the 12 `*.test.js`
files explicitly runs the full suite cleanly.

`src/PromptBrain/PromptBrain.csproj` builds in Release with **0 errors**. One
pre-existing MSB3277 warning reports a `WindowsBase` 4.0.0.0 / 5.0.0.0 conflict
introduced by the WebView2 package reference; it predates this work and was left
unchanged.

`tests/PromptBrain.ApiSmokeTest` returns `"result":"PASS"` (revision 2,
recovered revision 1, one externalized asset).

## Safety Rules

The catalog separates SFW and adult content by gate, not by omission. The rules
below describe what the gates actually enforce. No additional content
restriction, sanitisation or rewriting was applied, and the adult packs were
left exactly as authored.

- **SFW recipes never select adult concepts.** Enforced at
  `tests/phase8-scale.test.js:147`. Independently re-verified against the built
  catalog: all 1,008 SFW recipes were scanned across 9,312 concept references
  and **0** adult concepts were reachable. All 42 recipe families are gated
  `contentModes: ["sfw"]`.
- **Explicit content remains fully available in Adult mode.** 2,525 adult
  concepts are present and reachable when `contentMode: "adult"` is selected,
  concentrated in `interaction` (615), `anatomy` (496) and `action` (218).
- Fictional, sapient, explicitly adult fantasy beings and monsters are allowed.
- Direct consensual adult terminology is preserved verbatim — not softened,
  euphemised or removed.
- No forced age declarations, `rating: explicit`, `hentai` tags, negative
  prompts or moral warnings were added.
- The adult-fantasy pack was not rewritten on grounds of being explicit.
- The existing adult/SFW separation and its validation tests are preserved
  unchanged.

### Named entity adult gate — open item

All 324 Phase 8 named anime entities carry `adultAllowed: false`
(`adultAllowedEntities: 0` in the manifest). This gate is intact and was not
altered, and no entities were removed.

This reflects that the entities were never individually adult-verified — it is
not a judgement about any character. Adult-mode character support therefore
remains unavailable pending that verification. **This is reported for a
decision, not actioned.** The user will confirm separately whether adult
character support is required.

## Recipe Audit

The art-recipes pack defines **42 families × 24 variants = 1,008 recipes**,
confirmed by direct count. Variant depth is uniform: every family has exactly
24.

| Category | Families |
| --- | ---: |
| physical-media-render | 8 |
| camera-composition-grammar | 8 |
| environment-time-weather | 8 |
| narrative-emotion | 8 |
| wardrobe-editorial | 5 |
| graphic-genre | 5 |

Each family carries `requiredSlots`, `ingredientSelectors`, `triggers` and
`signals`. Complete required recipe slots score 1.0.

**Semantic contradictions: zero.** The previously reported repair of 297
affected recipes holds — the audit reports no contradiction, conflict or
semantic diagnostics of any kind, and no such issues appear among the 141
diagnostics. The 15 concepts carrying explicit `conflicts` metadata are
intentional declarations, not faults.

The packs are authored knowledge and were integrated as authored. No pack was
replaced with or diluted by mechanically generated tag combinations.

## LoRA Verification

All **34** installed LoRAs were independently re-verified against
`E:\COMFY-UI\models\loras` for this report — file existence, exact byte length,
and SHA-256 recomputed from disk and compared to the value recorded in
`knowledge/packs/phase-8/installed-loras.json`.

| Check | Result |
| --- | --- |
| Files found | 34 / 34 |
| SHA-256 matches | 34 / 34 |
| Byte-length matches | 34 / 34 |
| Mismatched | 0 |
| Missing | 0 |
| Total verified | 8,229,987,503 bytes |

The total is 8.23 GB decimal (7.66 GiB binary) — the same bytes, stated both
ways to avoid ambiguity.

Each entry records `filename`, `bytes`, `sha256`, `architecture`,
`baseModelVersion`, `sourceModel`, `outputName` and top training tags as
provenance. All 34 entries emit a real `<lora:name:weight>` command.

### Prompt-only tokens

`usnr`, `bbg_style` and `748cmstyle` are **not** LoRAs and are correctly
excluded from LoRA commands. Verified: all three are absent from
`installed-loras.json` entirely, and none of the 34 LoRA entries reference them.

They are preserved — not deleted — as plain style tokens in
`knowledge/packs/phase-8/visual-language.json`:

| Id | Kind | Prompt | Emits `<lora:>` |
| --- | --- | --- | --- |
| `phase8.visual-language.style.usnr` | style | `usnr` | no |
| `phase8.visual-language.style.bbg-style` | style | `bbg_style` | no |
| `phase8.visual-language.style.748cmstyle` | style | `748cmstyle` | no |

This matches the Phase 1 audit inventory, which recorded 3 prompt-only style
tokens.

## Pack Inventory

| Pack | Type | Contributes | Source fingerprint (prefix) |
| --- | --- | ---: | --- |
| adult-fantasy | concepts | 2,480 | `df307e06` |
| anime-entities | entities | 324 | `407063f2` |
| art-recipes | recipes | 1,008 | `2158de24` |
| character-performance | concepts | 4,800 | `3d79ae64` |
| installed-loras | concepts | 34 | `7e1975f5` |
| scene-craft | concepts | 5,291 | `ddf84245` |
| visual-language | concepts | 5,793 | `c1b20dca` |
| wardrobe | concepts | 4,802 | `feeb8b5a` |

The six concept packs sum to exactly 23,200, matching the reported delta.

## Deployment Status

**Not deployed.** Nothing was written to `E:\PromptBrain`. The catalog remains
in `knowledge/generated/phase-8/` within the working tree, pending the later
runtime/UI deployment phase.

## Reproduction

```
node tools/build-phase8-catalog.js
node tools/build-phase8-catalog.js --check
node --test tests\phase8-scale.test.js
node --test tests\lora-metadata-scanner.test.js
node --test tests\phase8-catalog-builder.test.js tests\phase8-build-cli.test.js
node --test tests\prompt-engine.test.js tests\prompt-engine-stress.test.js tests\browser-engine.test.js tests\art-director.test.js
dotnet build src\PromptBrain\PromptBrain.csproj -c Release
dotnet run --project tests\PromptBrain.ApiSmokeTest\PromptBrain.ApiSmokeTest.csproj -c Release
```

The validation was completed with Node v24.14.0 and .NET SDK 10.0.203.
