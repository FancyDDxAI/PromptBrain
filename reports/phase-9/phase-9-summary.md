# PromptBrain Phase 9 Evaluation Summary

- Catalog fingerprint: `6888adf92531b2225930cc66f892b0ece6a186db2e9a36d18feb6af242d0347d`
- Deterministic invocations: 10,200
- Total engine invocations: 11,005
- Checkpoints: 17
- Modes: adult, sfw
- Gates: 23/23 passed
- Reproducible digest: `f4a2a0af3c94202b66375aeb47cd3fbb907f9f165b7a7f297d628af1300257f1`
- Runtime: 126.30s, p95 18.1733ms, peak heap 190.3 MiB

| Status | Gate | Actual | Expected |
|---|---|---:|---:|
| PASS | `catalog.full-registration` | {"concepts":26200,"entities":330,"recipes":1446} | {"adultConcepts":2525,"checkpoints":17,"concepts":26200,"conceptsWithConflicts":17,"conceptsWithRequirements":4814,"customPromptForms":0,"entities":330,"recipes":1446} |
| PASS | `campaign.minimum-deterministic-invocations` | 10200 | >= 10000 |
| PASS | `campaign.profile-mode-coverage` | {"modes":["adult","sfw"],"profiles":17} | {"modes":["adult","sfw"],"profiles":17} |
| PASS | `runtime.no-exceptions` | 0 | 0 |
| PASS | `determinism.zero-mismatches` | 0 | 0 |
| PASS | `syntax.wai-quality-head` | 0 | 0 |
| PASS | `syntax.pony-score-head` | 0 | 0 |
| PASS | `syntax.flux` | 0 | 0 |
| PASS | `safety.sfw-no-adult-leakage` | 0 | 0 |
| PASS | `quality.nonempty` | 0 | 0 |
| PASS | `quality.block-coverage` | 0 | 0 |
| PASS | `semantics.regressions` | {"failures":0,"internalAdultEligibilityFailures":0} | {"failures":0,"internalAdultEligibilityFailures":0} |
| PASS | `semantics.no-conflicts` | 0 | 0 |
| PASS | `semantics.no-duplicates` | 0 | 0 |
| PASS | `tokens.warning-integrity` | 0 | 0 |
| PASS | `tokens.overrun-rate` | 0% | <= 5% |
| PASS | `art-direction.family-coverage` | {"missing":[],"selected":48,"total":48} | {"missing":[],"selected":48} |
| PASS | `character-staging.family-coverage` | {"missing":[],"selected":6,"total":6} | {"missing":[],"selected":6,"total":6} |
| PASS | `entities.mode-eligibility` | {"adultAllowed":3,"adultRejected":327,"adultResolved":3,"failures":0,"sfwResolved":330,"total":330} | {"adultRejected":327,"adultResolved":3,"failures":0,"sfwResolved":330} |
| PASS | `loras.installed-coverage` | {"exercised":28,"explicitlyIncompatible":["phase8.installed-loras.lora.anima-masterpiece-v51","phase8.installed-loras.lora.anima-turbo-v0.2","phase8.installed-loras.lora.gpt-image-2-anima-base1-v1","phase8.installed-loras.lora.gpt-image-2-anima-base1-v1-1","phase8.installed-loras.lora.oily-shiny-glossy-skin-v2.1","phase8.installed-loras.lora.zit-splatter-ink-art-v0.1"],"failures":0,"mapped":28,"total":34,"unclassified":[]} | {"exercised":28,"explicitlyIncompatible":["phase8.installed-loras.lora.anima-masterpiece-v51","phase8.installed-loras.lora.anima-turbo-v0.2","phase8.installed-loras.lora.gpt-image-2-anima-base1-v1","phase8.installed-loras.lora.gpt-image-2-anima-base1-v1-1","phase8.installed-loras.lora.oily-shiny-glossy-skin-v2.1","phase8.installed-loras.lora.zit-splatter-ink-art-v0.1"],"failures":0,"mapped":28,"total":34,"unclassified":[]} |
| PASS | `style-tokens.prompt-only` | {"exercised":17,"failures":0,"profiles":17,"tokens":3} | {"exercised":17,"failures":0,"profiles":17,"tokens":3} |
| PASS | `learning.memory-influence` | {"baselineRecipe":"phase9.staging.grounded-portrait.7936ea0fcec3","explicitPrecedenceObserved":true,"failures":0,"influenceObserved":true,"learnedRecipe":"phase9.staging.grounded-portrait.1acb8d6cd913"} | {"explicitPrecedenceObserved":true,"failures":0,"influenceObserved":true} |
| PASS | `runtime.heap-budget` | 199587416 | < 1073741824 |

The JSON report contains capped deterministic failure examples for every failed gate. Runtime metrics are observational and are excluded from the reproducible digest.
