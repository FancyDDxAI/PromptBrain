# PromptBrain Phase 1 Audit

Audit date: 2026-07-17

## Scope

This audit records the current PromptBrain implementation before the offline
reasoning engine is introduced. It is a baseline, not a description of the
target architecture.

## Current Application Shape

- `promptbrain.js` is a 274 KB monolith containing checkpoint knowledge,
  generated tag pools, characters, intent rules, state handling, rendering,
  event wiring, prompt assembly, and workflow export.
- `promptbrain.html` and `promptbrain.css` provide the embedded WebView UI.
- `src/PromptBrain/Program.cs` hosts the app in WinForms/WebView2 and exposes
  local HTTP endpoints for state, Ollama, and optional research.
- The installed state is stored at
  `E:\PromptBrain\data\promptbrain-state.json`.
- The local AI endpoint is optional. The built-in generator is currently a
  rule matcher and tag assembler rather than an independent reasoning engine.

## Inventory

| Area | Current count |
| --- | ---: |
| Checkpoints | 17 |
| LoRA definitions | 38 |
| Prompt-only style tokens | 3 |
| Base category entries | 2,233 |
| Adult category entries | 954 |
| Regular vibe entries | 973 |
| Adult vibe entries | 4,668 |
| Anime series | 35 |
| Unique female character rows | 226 |
| Unique male character rows | 190 |
| Adult-allowed character rows | 285 |

These are raw record counts. They overstate useful knowledge because many
entries are mechanical word-pair combinations, repeated between pools, or
lack dependency and conflict metadata.

## Persistence Findings

The current state file is about 609 KB. Two gallery images account for roughly
562 KB of it. State and image payloads are stored in one JSON document.

Important risks:

1. The state has no schema version or migration pipeline.
2. Every save serializes the entire state, including embedded image data.
3. Disk writes are debounced, but overlapping asynchronous writes are not
   serialized or acknowledged by the UI.
4. A final `sendBeacon` save is best-effort and has no recovery confirmation.
5. The disk state has no rotating backup or last-known-good copy.
6. Browser storage can exceed its quota, after which a trimmed fallback is
   stored. Timestamp conflict resolution can still prefer an incomplete local
   copy under some chat-count conditions.
7. State hydration replaces the full in-memory object instead of migrating and
   merging known fields.
8. The current .NET state writer emits a UTF-8 byte-order marker. Browsers and
   .NET accept it in this path, but strict JSON tooling must strip it before
   parsing.

The target state format must version metadata, serialize writes, retain a
last-known-good backup, and move image blobs out of the main JSON document.

## Prompt Engine Findings

The current generator has two overlapping intent systems:

- `inferIntentTags` performs direct keyword-to-tag mapping.
- `INTENT_RULES` and `analyzePromptIntent` perform another rule pass with
  priority and removal lists.

The systems do not share a typed intermediate representation. Consequently:

- Requirements, suggestions, and random defaults are indistinguishable.
- Character identity is represented as a string rather than a resolved entity.
- Participant count and relationships are inferred late and inconsistently.
- Art direction is treated as style tags rather than a coordinated recipe.
- Conflicts are removed using flat strings instead of semantic constraints.
- `Math.random()` makes failures difficult to reproduce.
- Prompt ordering is hardcoded during final assembly and cannot explain why a
  tag was selected.
- Generated word pairs inflate the library while producing phrases with weak
  visual meaning.

## Baseline Cases

All cases used WAI-NSFW Illustrious SDXL with empty manual selections.

### Artistic oni portrait

Input:

```text
make it artistic: an oni woman with black white and red graphic design
```

Current defect: the output contains the broken raw fragment
`it artistic: an oni woman...` and does not plan a graphic composition,
palette hierarchy, motifs, or negative space.

### Ukiyo-e portrait

Input:

```text
Miqote woman in a purple kimono, ukiyo-e portrait with Hokusai waves
```

Current defect: it adds generic studio portrait defaults while leaving the
ukiyo-e medium and Hokusai composition as unstructured raw text.

### Graphic horror composition

Input:

```text
horror oni woman from above inside a ring of blood
```

Current defect: it keeps the camera angle but drops the ring composition,
limited palette, symbolic framing, and horror rendering language.

### Cinematic action

Input:

```text
Eren Yeager flying through a city using ODM gear at sunset
```

Current defect: character detection succeeds, but action, equipment,
foreshortening, motion, environment depth, and sunset lighting are not planned.

### Generic versus named identity

Input:

```text
dragon girl fighting in ancient ruins
```

Current success: it remains a generic dragon girl and does not force Tohru.
Current defect: action planning is weak and unrelated moonlight is added.

Input:

```text
Android 18 from Dragon Ball fighting in a ruined city
```

Current success: Android 18 is identified without interpreting `Dragon Ball`
as dragon anatomy.
Current defect: the raw request is duplicated and the fight is not composed.

## Phase 2 Decision

The replacement engine will use a typed, versioned pipeline:

```text
request -> intent -> entity resolution -> constraints -> art direction
        -> scene plan -> ranked knowledge -> validation -> checkpoint compiler
```

Bulk library expansion is deliberately blocked until a small seed library can
pass the golden cases in `tests/fixtures/phase-3-golden-cases.json`.
