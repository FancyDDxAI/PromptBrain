# PromptBrain Phase 7 Knowledge Toolchain

Status: implemented in source and verified on 2026-07-17.

## Shipping boundary

Phase 7 provides an offline authoring, compilation, audit, coverage, quality, baseline, and semantic-diff toolchain for PromptBrain knowledge. It does **not** yet deploy generated knowledge into the shipping PromptBrain UI or either `PromptBrain.exe` build.

The shipping files do not load `tools/knowledge-toolchain.js`, `tools/knowledge-cli.js`, the policy, the baseline, or compiled pack artifacts. `currentCatalog()` still assembles the existing JavaScript seed/curated modules. Compiling a pack writes a reviewable JSON artifact only; it does not merge that artifact into the engine, update the UI, rebuild the executable, or copy data into `dist/`. Shipping integration belongs to Phase 8 or a later deployment phase.

## Goals

Phase 7 exists to make a much larger knowledge library safe to author and review before it is allowed into the product:

1. Normalize the current in-memory catalog into one auditable shape.
2. Validate checkpoints, named entities, concepts, recipes, references, compatibility, content-mode boundaries, and requirement graphs.
3. Detect duplicate IDs, exact prompt/alias collisions, and token-based near duplicates.
4. Produce coverage and catalog-quality reports with deterministic fingerprints.
5. Compile direct entries and constrained semantic matrices into schema-valid concepts with provenance.
6. Compare catalog versions semantically by stable ID.
7. Gate known diagnostics against a checked-in Phase 7 baseline.
8. Prove that structural audit and coverage reporting work at 30,000 concepts.

The toolchain is local and deterministic. It makes no API, model, Ollama, or network calls.

## Implemented components

| Component | Role |
| --- | --- |
| [`tools/knowledge-toolchain.js`](../tools/knowledge-toolchain.js) | Pure CommonJS core: normalization, validation, duplicate analysis, coverage, quality, pack compilation, fingerprints, baseline comparison, semantic diff, and text reports. |
| [`tools/knowledge-cli.js`](../tools/knowledge-cli.js) | Present and executable Node CLI. Adds JSON file I/O, command parsing, exit codes, policy/baseline loading, and compiled artifact writing. |
| [`knowledge/catalog-policy.json`](../knowledge/catalog-policy.json) | Schema 1 Phase 7 coverage floors plus Phase 8 target metadata. |
| [`knowledge/catalog-baseline.json`](../knowledge/catalog-baseline.json) | Schema 1 snapshot of current totals, fingerprint, quality, known diagnostics, near-duplicate analysis, and Phase 8 rule metadata. |
| [`knowledge/packs/phase-7-example-art-direction.json`](../knowledge/packs/phase-7-example-art-direction.json) | Human-curated schema 1 example with two direct entries and one constrained lighting matrix. |
| [`tests/knowledge-toolchain.test.js`](../tests/knowledge-toolchain.test.js) | API-level structural, failure, deterministic compilation, diff, and 30,000-entry scale tests. |
| [`tests/knowledge-cli.test.js`](../tests/knowledge-cli.test.js) | CLI parsing, policy/baseline loading, deterministic file output, rejection, diff, and exit-code tests. |

## Architecture

### Current catalog path

`currentCatalog()` builds a schema 2 catalog from:

- `seed-knowledge.js`: checkpoint profiles, named entities, foundational concepts, and foundational recipes.
- `curated-knowledge.js`: Phase 5 concepts.
- `art-director.js`: expanded art recipes.

`normalizeCatalog()` accepts a few legacy aliases, then returns four arrays:

```text
checkpointProfiles or checkpoints -> checkpoints
entities                          -> entities
entries or concepts               -> concepts
artRecipes or recipes             -> recipes
```

The audit pipeline then runs in this order:

1. Build ID indexes and report duplicate IDs and cross-type ID reuse.
2. Validate each checkpoint, entity, concept, and recipe.
3. Validate dependencies, conflicts, recipe ingredients, compatibility, and SFW/adult boundaries.
4. Detect requirement cycles.
5. Detect exact canonical-prompt and alias collisions.
6. Optionally run bounded near-duplicate analysis.
7. Build coverage and apply the supplied/default coverage policy.
8. Compute the weighted quality report and family repetition risks.
9. Sort issues and fingerprint the canonical catalog.

### Pack compilation path

```text
schema 1 pack
  -> validate pack, entries, matrices, selectors, and limits
  -> expand allowed matrix combinations
  -> inherit defaults and attach provenance
  -> create schema 2 concepts
  -> sort concepts by stable ID
  -> reject duplicate IDs/prompts inside the pack and against the target catalog
  -> audit the combined target + generated concepts
  -> emit a fingerprinted compiled-pack artifact
```

The core does not perform file I/O. The CLI is the thin filesystem adapter around it.

## Schema contracts

There are three independent version numbers. They must not be substituted for one another.

| Layer | Current version | Meaning |
| --- | ---: | --- |
| Engine/catalog objects | `2` | `engine/contracts.js` schema for `KnowledgeEntry` and `ArtRecipe`, and the normalized catalog root. |
| Authoring pack | `1` | Input accepted by `compilePack()`. |
| Toolchain reports | `1` | Audit, coverage, quality, diff, baseline-comparison, and compile-result envelopes. |

### Catalog

The normalized catalog shape is:

```json
{
  "schemaVersion": 2,
  "checkpoints": [],
  "entities": [],
  "concepts": [],
  "recipes": []
}
```

Checkpoint validation requires `id`, `name`, `family`, `base`, `type`, `promptStyle`, `separator`, `weightSyntax`, `supportsNegative`, `qualityPrefix`, and `maxEstimatedTokens`. Supported bases are `SD1.5`, `SDXL`, `Pony`, and `FLUX`; prompt styles are `tags`, `natural_language`, and `score_tags`; weight syntaxes are `classic` and `none`.

Named entities require a stable lowercase `id`, `kind`, `name`, `namespace`, non-empty `aliases`, non-empty `promptTags`, `traits`, and boolean `adultAllowed`.

A schema 2 concept has this effective shape:

```json
{
  "schemaVersion": 2,
  "id": "stable.lowercase-id",
  "kind": "style",
  "label": "Human label",
  "aliases": ["matching phrase"],
  "promptForms": { "default": "rendered prompt" },
  "compatibility": { "bases": ["SDXL"], "checkpointIds": [] },
  "requires": [],
  "conflicts": [],
  "contentMode": "sfw",
  "group": "",
  "priority": 0,
  "traits": [],
  "provenance": {}
}
```

Allowed concept kinds are `quality`, `style`, `subject`, `anatomy`, `action`, `interaction`, `pose`, `expression`, `wardrobe`, `environment`, `lighting`, `camera`, `composition`, `palette`, `motif`, `effect`, `entity`, `lora`, and `checkpoint`. Content mode is `sfw` or `adult`. `promptForms.default` is mandatory; additional prompt-form keys must name a known checkpoint ID or base.

A schema 2 recipe requires `id`, `name`, `aliases`, `contentModes`, `ingredients`, `requiredSlots`, `optionalSlots`, and `conflicts`. Ingredient slots are checked against their concept kind. Supported slots are the prompt blocks from `quality` through `effects`, plus `loras`; plural `motifs`, `effects`, and `loras` map to concept kinds `motif`, `effect`, and `lora`.

### Authoring pack

A schema 1 pack contains:

```json
{
  "schemaVersion": 1,
  "packId": "stable.lowercase-pack-id",
  "source": "source-name",
  "defaults": {},
  "entries": [],
  "matrices": []
}
```

`packId` and matrix IDs use stable lowercase identifiers. `entries` and `matrices`, when present, must be arrays; each entry must be an object; matrix IDs must be unique within the pack.

A direct entry can provide `id`, `kind`, `prompt` or `promptForms.default`, `label`, `aliases`, `promptForms`, `bases`, `checkpointIds`, `compatibility`, `requires`, `conflicts`, `contentMode`, `group`, `priority`, `traits`, `source`, and `family`. Pack defaults supply the same shared fields. Generated concepts always include the canonical prompt as their first alias and include provenance.

A matrix adds:

- `id`, `kind`, `template`, and `axes`.
- Optional `aliasTemplates`, `include`, `exclude`, `constraints`, `maxCombinations`, and matrix-level concept fields.
- Axis values as strings/numbers or objects shaped as `{ "value": "...", "aliases": [], "traits": [] }`.
- Constraints shaped as `{ "when": {...}, "require": {...} }` and/or `{ "when": {...}, "forbid": {...} }`.

Selectors are validated against declared axis names and exact declared values. Optional selector/template collections must be arrays. Empty axes, duplicate normalized values, unknown placeholders, unknown selector values, constraints without `require`/`forbid`, matrices producing no allowed combinations, and packs producing no concepts are compilation errors.

### Compiled pack

Successful compilation returns a toolchain schema 1 result whose `output` is:

```json
{
  "schemaVersion": 2,
  "packSchemaVersion": 1,
  "packId": "...",
  "source": "...",
  "concepts": [],
  "stats": {
    "directEntries": 0,
    "matrices": 0,
    "generatedConcepts": 0,
    "byKind": {}
  },
  "fingerprint": "sha256"
}
```

Each generated concept records provenance fields `source`, `family`, `packId`, `ruleId`, and `sourceValues`. Direct entries use `ruleId: "direct"`; matrix entries use the matrix ID and the selected axis values.

The compiler currently emits **concepts only**. It does not author or emit recipes, named entities, checkpoints, or a merged catalog.

### Audit and issue reports

An audit result contains `valid`, `fingerprint`, `summary`, `catalog`, `analysis.nearDuplicates`, `coverage`, `quality`, applied `policy`, and sorted `issues`. An issue is:

```json
{
  "severity": "error",
  "code": "concept.dangling-requirement",
  "message": "...",
  "entityType": "concept",
  "id": "...",
  "path": "requires",
  "relatedIds": [],
  "data": {}
}
```

The default retained-issue limit is 10,000. `summary.total` still counts findings beyond that limit, while `retained` and `truncated` make loss explicit. Issues sort by severity, code, entity type, ID, then message.

Coverage reports include totals; concepts by kind, mode, kind-and-mode, declared/effective base and checkpoint, provenance source/family; recipes by family; entities by namespace; and checkpoints by base/type.

Quality is a weighted score:

```text
40% structural validity
25% canonical prompt uniqueness
15% alias coverage
10% provenance coverage
10% complete required recipe slots
```

Families with at least 25 concepts and canonical prompt uniqueness below `0.98` become `quality.family-prompt-repetition` warnings.

Semantic diff reports fingerprints and per-collection `added`, `removed`, `changed`, and `unchanged` values. Changed IDs include sorted top-level field names; it is not a line-oriented JSON diff.

## Issue severities

| Severity | Meaning and effect | Representative findings |
| --- | --- | --- |
| `error` | Structural or semantic invalidity. Any error makes `audit.valid` or `compile.valid` false and produces CLI exit `1`. Unknown severity names are coerced to `error`. | Invalid schema/ID, duplicate ID, dangling reference, wrong recipe ingredient kind, impossible requirement, requirement cycle, SFW-to-adult leak, entity alias collision, unknown base/checkpoint. |
| `warning` | Reviewable risk. It does not make the API report invalid. CLI exits `1` only with `--fail-on-warning`, or when a baseline regression is detected. | Same-kind duplicate prompt/alias, named-entity/concept alias overlap, duplicate checkpoint name, long prompt, cross-family recipe alias, cross-type ID reuse, missing policy coverage, near duplicate at least `0.95`, analysis budget exhaustion, family repetition. |
| `info` | Non-blocking ambiguity or lower-confidence similarity. | Cross-kind prompt/alias reuse, asymmetric conflicts, same-family recipe aliases, broad aliases, near duplicate below `0.95`, omitted near-duplicate results. |

Exact matching uses normalized text. Near matching uses same-kind token postings and Jaccard similarity. Defaults are threshold `0.90`, maximum posting size `400`, candidate-pair budget `250,000`, and at most `1,000` emitted near-duplicate issues. Similarity at least `0.95` is a warning; lower matches are informational.

## Deterministic compilation rules

1. Text normalization applies Unicode NFKC, lowercases, normalizes curly apostrophes, unwraps escaped/weighted parentheses, treats underscores and hyphens as spaces, removes other punctuation, and collapses whitespace.
2. Generated IDs are `<packId>.<kind>.<slug(prompt)>`; slugs are ASCII, lowercase, hyphenated, and limited to 72 characters.
3. Matrix axis names are sorted lexically. Values retain their authored order. Cartesian expansion traverses the sorted axes deterministically.
4. A non-empty `include` list is a whitelist. `exclude` is applied next. Matching `constraints` then enforce `require` and `forbid` selectors.
5. The theoretical Cartesian size is checked before filtering. The default matrix ceiling is `5,000` combinations; `matrix.maxCombinations` or API `maxMatrixCombinations` can set the limit.
6. The complete direct-plus-expanded pack is capped at `50,000` concepts by default through API `maxPackConcepts`.
7. Defaults merge before entry-specific values. Compatibility, requirements, conflicts, traits, and aliases are de-duplicated while preserving first occurrence.
8. Matrix axis aliases/traits flow into concepts. Provenance preserves the source rule and selected axis values.
9. Generated concepts are sorted by ID before validation and output.
10. Duplicate IDs and same-kind normalized prompts are rejected inside a pack and against the target catalog. The default target is `currentCatalog()`; API `existingCatalog: false` or CLI `--against none` performs standalone validation.
11. Compilation audits the target plus generated concepts with coverage policy disabled. Errors touching a generated ID invalidate the pack; the result exposes only generated-related issues, although its audit summary covers the combined catalog.
12. Object keys are recursively sorted for stable JSON and SHA-256 fingerprints. Array order remains significant. A catalog reordering can therefore change its fingerprint; compiled concepts avoid that instability by sorting by ID.

The controlled matrix test proves repeatability by compiling the same pack twice and requiring deep-equal output and identical fingerprints. Its 12 theoretical combinations are reduced to five expected prompts by include, exclude, and conditional constraints.

## CLI usage

**CLI present:** all commands below are implemented in [`tools/knowledge-cli.js`](../tools/knowledge-cli.js). There is no repository `package.json` or installed `knowledge-cli` bin alias, so the concrete repository invocation is `node tools/knowledge-cli.js ...`.

```powershell
# Full current audit with checked-in policy and diagnostic baseline
node tools/knowledge-cli.js audit current `
  --policy knowledge/catalog-policy.json `
  --baseline knowledge/catalog-baseline.json

# Fast structural audit without near-duplicate work
node tools/knowledge-cli.js audit current --no-near --json

# Coverage only
node tools/knowledge-cli.js coverage current --json

# Validate the example against the current catalog
node tools/knowledge-cli.js validate `
  knowledge/packs/phase-7-example-art-direction.json `
  --against current --no-near

# Compile a review artifact; this does not import or deploy it
node tools/knowledge-cli.js compile `
  knowledge/packs/phase-7-example-art-direction.json `
  --against current --no-near `
  --out output/phase-7-example-art-direction.compiled.json

# Semantic catalog diff (exit 1 is expected when changes exist)
node tools/knowledge-cli.js diff `
  tests/fixtures/phase-7/diff-before.json `
  tests/fixtures/phase-7/diff-after.json --json

node tools/knowledge-cli.js help
```

Implemented command/option scope:

| Command | Implemented options |
| --- | --- |
| `audit [target=current]` | `--json`, `--no-near`, `--near-threshold`, `--policy`, `--baseline`, `--fail-on-warning` |
| `coverage [target=current]` | `--json` |
| `validate <pack.json>` | `--json`, `--no-near`, `--near-threshold`, `--against current|none`, `--fail-on-warning` |
| `compile <pack.json> --out <json>` | Validation options plus `--out`; writes nothing when blocking findings exist. |
| `diff <before|current> <after|current>` | `--json` |
| `help [command]` | `--json` |

CLI pack validation enables near-duplicate analysis by default. A custom threshold from `0.5` through `0.99` triggers a second combined-catalog audit because core `compilePack()` only has an on/off near-duplicate option.

Exit codes are `0` for success, `1` for domain findings/diff/baseline regression, and `2` for usage or file I/O failure. With `--json`, usage and I/O failures are emitted as structured errors on stderr.

### Baseline gate

`--baseline knowledge/catalog-baseline.json` compares issue counts by diagnostic code, structural error count, and audit truncation. It fails only when:

- A diagnostic code already listed in `knownDiagnostics` increases.
- Structural errors exceed `structuralErrors`.
- Any audit issues are truncated.

The comparison reports fingerprint and quality delta, but a fingerprint change or quality decrease does not currently fail the gate. New warning/info codes absent from `knownDiagnostics` also do not currently fail it. `phase8Rules` in the baseline file are metadata; `compareAuditToBaseline()` does not read those flags directly.

## Core API usage

```js
const fs = require("node:fs");
const knowledge = require("./tools/knowledge-toolchain.js");

const catalog = knowledge.currentCatalog();
const audit = knowledge.auditCatalog(catalog, {
  nearDuplicates: true,
  nearDuplicateThreshold: 0.9,
  policy: JSON.parse(fs.readFileSync("knowledge/catalog-policy.json", "utf8"))
});

const pack = JSON.parse(fs.readFileSync(
  "knowledge/packs/phase-7-example-art-direction.json",
  "utf8"
));
const compiled = knowledge.compilePack(pack, {
  existingCatalog: catalog,
  nearDuplicates: false
});

const coverage = knowledge.buildCoverageReport(catalog);
const diff = knowledge.diffCatalog(beforeCatalog, afterCatalog);
```

Exported APIs are `normalizeText`, `slug`, `tokenize`, `stableStringify`, `fingerprint`, `normalizeCatalog`, `currentCatalog`, `buildCoverageReport`, `assessCatalogQuality`, `auditCatalog`, `compilePack`, `diffCatalog`, `compareAuditToBaseline`, `formatAuditReport`, and `formatCoverageReport`, plus schema/base/slot constants.

Important API options:

- `auditCatalog`: `maxIssues`, `nearDuplicates`, `nearDuplicateThreshold`, `maxNearDuplicatePosting`, `maxNearDuplicatePairs`, `maxNearDuplicateIssues`, `applyPolicy`, and `policy`.
- `compilePack`: `existingCatalog`, `nearDuplicates`, `maxMatrixCombinations`, `maxPackConcepts`, and `maxIssues`.
- Core `compilePack` does not accept a near threshold; callers needing one must re-audit, as the CLI does.

## Policy and current baseline

The checked-in policy's Phase 7 coverage floors all pass. The runtime applies `minimums`, `minimumConceptsByKind`, `requiredCheckpointBases`, and `coverageSeverity`. The policy's `schemaVersion` and `phase8Targets` are currently descriptive metadata and are not enforced by `applyCoveragePolicy()`.

| Metric | Current | Phase 7 minimum | Phase 8 target |
| --- | ---: | ---: | ---: |
| Checkpoints | 17 | 12 | Not specified |
| Named entities | 6 | 4 | 250 |
| Concepts | 2,950 | 2,800 | 20,000 |
| Recipes | 294 | 250 | 1,000 |
| Adult concepts | 41 | 30 | Not specified |
| Structural errors | 0 | 0 in practice | 0 maximum |
| New canonical duplicate groups | N/A | N/A | 0 maximum |

Current concepts by kind:

| Kind | Count | Kind | Count |
| --- | ---: | --- | ---: |
| Action | 278 | Anatomy | 166 |
| Camera | 190 | Composition | 184 |
| Effect | 180 | Environment | 199 |
| Expression | 221 | Interaction | 35 |
| Lighting | 226 | Motif | 184 |
| Palette | 189 | Pose | 253 |
| Quality | 24 | Style | 242 |
| Subject | 44 | Wardrobe | 335 |

Additional coverage facts:

- Content modes: 2,909 SFW and 41 adult concepts.
- Provenance source: 2,841 Phase 5 curated concepts and 109 foundation concepts.
- All 2,950 concepts currently declare universal compatibility, so each is effective for all four bases and all 17 checkpoints.
- Checkpoint bases: 8 SD1.5, 6 SDXL, 2 Pony, and 1 FLUX.
- Concepts with requirements: 0. Concepts with conflicts: 9. Custom prompt forms beyond `default`: 0.

Saved/verified baseline:

```text
Catalog fingerprint: c299d7fef6a1c01b534c0b31ef006b7a38b661e1d6540054d3dfab9e1f056d96
Catalog quality:     99.4 / 100
Structural errors:  0
Near threshold:     0.90
Candidate pairs:    78,091
Near matches:       2
```

Quality ratios are structural validity `1.0000`, canonical prompt uniqueness `0.9895`, alias coverage `1.0000`, provenance coverage `0.9631`, and complete required recipe slots `1.0000`. There are no current family-repetition quality risks.

The full baseline audit is valid with 0 errors, 74 warnings, and 66 informational findings:

| Severity/code | Count |
| --- | ---: |
| `warning:concept.alias-collision` | 33 |
| `warning:concept.duplicate-prompt` | 29 |
| `warning:concept.near-duplicate-prompt` | 2 |
| `warning:recipe.alias-cross-family` | 10 |
| `info:concept.alias-cross-kind` | 1 |
| `info:concept.cross-kind-prompt` | 1 |
| `info:recipe.alias-same-family` | 64 |

With near analysis disabled, the same catalog has 72 warnings and 66 info findings. The fingerprint and quality score are unchanged.

The example pack compiles standalone and against the current catalog with no generated-related issues. It produces 7 concepts: 2 direct entries and 5 lighting concepts from 6 theoretical combinations after excluding `magenta` plus `window spill`. Counts are 1 style, 1 composition, and 5 lighting. Its compiled-pack fingerprint is `0b4b4908203463e31c527f06c5b5eeb26129cb2274ba2caa1376debfd1b007fa`.

## Tests and verification

`tests/knowledge-toolchain.test.js` contains eight direct API tests:

1. Current catalog structural validity, zero errors, SHA-256 fingerprint shape, totals, coverage agreement, and explicit near-analysis skip.
2. Duplicate concept IDs plus dangling concept requirement/conflict and recipe ingredient/conflict references.
3. Requirement-cycle detection and rejection of an SFW concept requiring an adult concept.
4. Deterministic constrained-matrix compilation, exact five-prompt output, identical repeated output/fingerprint, inherited SDXL compatibility, axis traits, and rendered aliases.
5. Invalid pack rejection for repeated IDs, schema failure, unknown kind/empty prompt, and dangling requirement.
6. Rejection of unknown matrix selector values and a matrix exceeding its authored combination ceiling.
7. Semantic diff with one added, one removed, one changed, and one unchanged concept; changed fields are `label` and `priority`.
8. A 30,000-concept structural and coverage audit.

The 30k fixture is generated in memory with 15,000 `style` and 15,000 `lighting` concepts, 3,000 adult and 27,000 SFW concepts, 15,000 universal and 15,000 SDXL-declared concepts, and provenance source `phase-7-scale`. Near-duplicate analysis and policy application are intentionally disabled. The test requires:

- `valid: true` and exactly zero errors, warnings, info findings, or truncation.
- 30,000 concepts in both catalog and coverage totals.
- Effective base coverage of 15,000 for SD1.5, Pony, and FLUX, and 30,000 for SDXL.
- A skipped near-analysis report with zero candidate pairs/matches.
- `policy: null`.

Verification rerun on 2026-07-17 with Node `v24.14.0`:

```text
PASS: Knowledge toolchain Phase 7 tests passed (30,000-entry scale audit included).
PASS: current policy + baseline CLI audit, baseline gate passed.
```

The final full eight-file JavaScript regression run completed in about 6.6 seconds in this environment. This is observational, not a performance assertion; the tests have no wall-clock limit. `knowledge-cli.test.js` separately exercises CLI parsing, policy/baseline loading, a deliberate baseline regression, deterministic file writes, rejection without output, semantic diff, and exit codes.

The Release .NET build also passed with zero errors. It retains the existing single `WindowsBase` version-conflict warning from WebView2; Phase 7 did not introduce it.

## Explicit Phase 8 handoff

Phase 8 owns the structured library expansion. Phase 9 owns the large evaluation campaign, and Phase 10 owns shipping UI/executable integration and E-drive deployment. The checked-in Phase 8 catalog targets are:

- At least 20,000 concepts.
- At least 1,000 recipes.
- At least 250 named entities.
- Zero structural errors.
- Zero new canonical duplicate groups.
- No new cross-family alias-collision regressions, deterministic compilation, and complete provenance according to the baseline metadata.

Required Phase 8 work:

1. Treat `knowledge/catalog-baseline.json` as the Phase 7 diagnostic ceiling and update it only after explicit review. Run full near analysis when using that baseline; `--no-near` would make its tracked near-duplicate count incomparable.
2. Author reviewed schema 1 concept packs, compile both standalone and against `current`, and retain `source`, `family`, `ruleId`, and `sourceValues` for every generated concept.
3. Add authoring/import paths for recipes and named entities, or extend the pack schema. The current compiler cannot reach the recipe/entity targets because it emits concepts only.
4. Add an actual catalog merge/shard/loading layer. Decide where compiled concepts live, how duplicate IDs are prevented across shards, and how deterministic ordering is preserved before fingerprinting.
5. Turn Phase 8 target metadata into enforceable gates. `phase8Targets`, baseline `phase8Rules`, fingerprint changes, quality decreases, and brand-new untracked warning codes are not currently blocking conditions.
6. Keep structural errors and audit truncation at zero. Reject increases in `concept.duplicate-prompt`, `recipe.alias-cross-family`, and other tracked diagnostic groups; inspect semantic diffs for every import.
7. Exercise full-audit behavior at the real 20k-30k library size. The existing 30k test proves structural/coverage scaling with near analysis disabled, not full near-duplicate performance at 30k.
8. Add tests for multi-pack collisions, recipe/entity import, shard loading, and UI search/filter behavior. Policy loading, baseline regressions, CLI exit codes/file writes, and malformed matrix selector/limit rejection are already covered in Phase 7.
9. Preserve the accepted catalog and evaluation artifacts for Phase 10, where the runtime/UI wiring, packaging, executable rebuild, and source plus packaged-executable smoke tests will happen.

Until item 9 is complete, Phase 7 remains a verified offline knowledge toolchain and review gate, **not a deployment into the shipping UI or executable**.
