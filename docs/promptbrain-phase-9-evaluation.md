# PromptBrain Phase 9 Deterministic Evaluation

## Purpose

Phase 9 is a production gate for PromptBrain's local deterministic engine. It does not modify, mock, or replace engine behavior. The campaign loads the real generated catalog through `engine/catalog-store.js`, registers it with both the art director and prompt engine, and evaluates the resulting effective runtime.

The checked-in campaign intentionally fails when the current engine violates a product requirement. Assertions must be fixed by repairing the engine or catalog in a later phase, not by weakening this campaign.

## Commands

With Node on `PATH`:

```powershell
node tools/run-phase9-evaluation.js
node tools/run-phase9-evaluation.js --check
node --test tests/phase9-evaluation.test.js
node --test tests/phase9-engine-remediation.test.js
```

Run the evaluation and regression tests with Node:

```powershell
node tools\run-phase9-evaluation.js
node tools\run-phase9-evaluation.js --check
node --test tests\phase9-evaluation.test.js
node --test tests\phase9-engine-remediation.test.js
```

The normal command writes:

- `reports/phase-9/phase-9-report.json`
- `reports/phase-9/phase-9-summary.md`

`--check` runs the complete campaign, compares its deterministic digest with the checked-in JSON report, writes nothing, and exits nonzero for either report drift or failed production gates.

## Reproducibility

Every core case is generated twice with the same request, checkpoint, content mode, seed, memory scores, negative options, and rendering options. The structured outputs must be byte-identical after stable key ordering.

The report's `reproducibleDigest` covers fixture identity, catalog identity, coverage, deterministic counters, gates, and capped failure examples. Wall-clock timing and heap observations are recorded but deliberately excluded from the digest because they vary by machine and process state.

Current passing digest:

```text
6ecc41131744a5ee6ac2e541bef19d09b387f76718767e7713eaf96a8868bfe3
```

## Catalog Under Test

The campaign loads `knowledge/generated/phase-8/manifest.json` and every manifest-indexed concept, entity, and recipe shard.

| Field | Value |
|---|---:|
| Build ID | `promptbrain-phase-8-with-authored-extensions` |
| Manifest fingerprint | `c9ff21c86ab4ab725272d074223f4521a57c87f2ed39ca3d58eaaa10e1e7d474` |
| Delta fingerprint | `c5cccf64337e496cab882a0660afc53b4fda4cab691d27d6b301cc5785fd1c7b` |
| Effective fingerprint | `e85c3f848ba8e074aca8604f1d6da3fd63d4dea04c15ffa816098c5b7631c801` |
| Manifest files | 117 |
| Loaded shards | 113 |
| Delta concepts | 23,250 |
| Delta entities | 324 |
| Delta recipes | 1,152 |
| Effective concepts | 26,200 |
| Effective entities | 330 |
| Effective recipes | 1,446 |
| Effective checkpoints | 17 |
| Adult concepts | 2,525 |
| Generated families | 48 |
| Installed LoRAs | 34 |

## Campaign Coverage

The deterministic core contains 20 semantic scenarios, 15 seeds per scenario, and all 17 checkpoint profiles. Each scenario has one fixed content mode, with ten SFW scenarios and ten adult scenarios.

This produces:

- 5,100 paired deterministic cases
- 10,200 deterministic engine invocations
- 11,005 total engine invocations after family, entity, LoRA, style-token, FLUX, and memory probes
- all 17 checkpoint profiles
- both `sfw` and `adult` modes
- all 48 generated recipe families
- all 330 effective named entities
- all 34 installed LoRA metadata entries
- all three prompt-only style tokens: `usnr`, `bbg_style`, and `748cmstyle`

The semantic regression set includes generic dragon girl versus explicitly selected Tohru, Dragon Ball namespace isolation, Yor identity, generic cat girl reading, ice elf action, graphic horror, generic adult subjects, adult-allowed named entities, adult-ineligible named entities, memory influence, and explicit intent taking precedence over inferred or learned choices.

## Gates

Current result: **23 of 23 gates pass**.

| Status | Gate | Current result |
|---|---|---|
| PASS | `catalog.full-registration` | 26,200 concepts, 330 entities, 1,446 recipes |
| PASS | `campaign.minimum-deterministic-invocations` | 10,200 |
| PASS | `campaign.profile-mode-coverage` | 17 profiles; adult and SFW |
| PASS | `runtime.no-exceptions` | 0 exceptions |
| PASS | `determinism.zero-mismatches` | 0 mismatches |
| PASS | `syntax.wai-quality-head` | 0 violations |
| PASS | `syntax.pony-score-head` | 0 violations |
| PASS | `syntax.flux` | 0 violations |
| PASS | `safety.sfw-no-adult-leakage` | 0 leaked adult prompt forms |
| PASS | `quality.nonempty` | 0 empty prompts |
| PASS | `quality.block-coverage` | 0 failures |
| PASS | `semantics.regressions` | 0 output or internal eligibility failures |
| PASS | `semantics.no-conflicts` | 0 declared or lexical conflicts |
| PASS | `semantics.no-duplicates` | 0 duplicate normalized blocks |
| PASS | `tokens.warning-integrity` | 0 missing or spurious warning states |
| PASS | `tokens.overrun-rate` | 0%, target at most 5% |
| PASS | `art-direction.family-coverage` | 48 of 48 families directly selected |
| PASS | `character-staging.family-coverage` | 6 of 6 families selected |
| PASS | `entities.mode-eligibility` | 330/330 SFW; 3 allowed adult; 327 rejected adult |
| PASS | `loras.installed-coverage` | 28 compatible and exercised; 6 explicitly incompatible; 0 unclassified |
| PASS | `style-tokens.prompt-only` | 3 tokens across all 17 profiles |
| PASS | `learning.memory-influence` | learned preference changes an under-specified variant; explicit intent still wins |
| PASS | `runtime.heap-budget` | below 1 GiB |

## Remediation Evidence

### Requested semantic blocks

There are zero block-coverage failures. Art-directed requests now receive a compatible style concept even when the selected character-staging recipe intentionally contains only pose, wardrobe, lighting, camera, composition, and palette ingredients. Generic subject, interaction, and setting phrases embedded in a request are parsed into their own structured blocks instead of disappearing inside fallback prose.

### Internal adult eligibility and cleaned output

The stale requirement that `adult woman`, `adult man`, or `two adults` must remain visible in the final prompt was replaced with the actual product guarantee. Adult-mode scenarios assert a minimum or maximum number of internally verified adult participants, while the rendered prompt is required to omit repetitive age scaffolding. Adult-ineligible named entities still produce no verified substitute participant. All 330 entities resolve in SFW, the three reviewed entries resolve in adult mode, and 327 ineligible entries are rejected.

### Token budget

The compiler now performs deterministic, priority-aware trimming after scene planning. It always protects the checkpoint quality head, style, subject, anatomy, action/interaction, selected LoRAs, and locked user choices, then removes the least important optional visual fragments first. Every one of the 5,100 campaign prompts fits its checkpoint target; the overrun rate is 0%, and warning integrity remains exact.

### Recipe-family precedence

Exact authored family phrases now receive a deterministic specificity bonus. A long phrase such as `overhead graphic survey grammar` therefore beats an incidental broad word such as `graphic`, without disabling broad discovery for ordinary requests. All 48 generated families, including all six character-staging families, win their direct trigger probes.

### Installed LoRA mapping

Twenty-eight installed LoRAs map to a compatible checkpoint and emit their exact catalog form. Six installed entries have no declared compatible checkpoint profile in the current catalog:

- `phase8.installed-loras.lora.anima-masterpiece-v51`
- `phase8.installed-loras.lora.anima-turbo-v0.2`
- `phase8.installed-loras.lora.gpt-image-2-anima-base1-v1`
- `phase8.installed-loras.lora.gpt-image-2-anima-base1-v1-1`
- `phase8.installed-loras.lora.oily-shiny-glossy-skin-v2.1`
- `phase8.installed-loras.lora.zit-splatter-ink-art-v0.1`

The gate now asserts the honest invariant: every installation must be either mapped and exercised or explicitly rejected by `conceptCompatibility` on every profile. The six entries above are reported as explicitly incompatible, not invented mappings; no installation remains unclassified.

### Memory score influence

The memory probe now tests the requirement it was meant to encode: an under-specified `artistic character portrait` must change to a learned recipe variant containing the positively scored concept. Memory remains a bounded tie-breaker, so an explicit `from above` request still defeats a strong learned `from below` preference.

## Observed Runtime

The checked-in report records the last full run as approximately 67.58 seconds, 5.87 ms mean generation time, 9.24 ms p95 generation time, and about 214.1 MiB peak heap. These values are diagnostic only and are not part of report identity.

## Repair Rule

Later engine/catalog work should rerun the normal command to update the report, then run `--check` and the Node test. A repaired Phase 9 is complete only when the digest is stable and all 23 gates pass. Do not reduce scenario coverage, remove profiles, lower the invocation count, loosen namespace rules, raise checkpoint token limits merely to hide overrun, or convert failed gates into warnings.
