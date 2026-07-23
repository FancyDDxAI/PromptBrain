# PromptBrain Offline Engine Architecture

Architecture version: 3

## Objective

PromptBrain must construct coherent ComfyUI prompts without requiring an API,
Ollama, or internet access. Optional local AI may propose ideas, but the local
engine owns interpretation, planning, validation, checkpoint formatting, and
memory.

## Design Principles

1. Explicit user requirements outrank every inferred or learned preference.
2. Generic concepts remain generic unless a named entity is explicitly chosen
   or the user requests a random established character.
3. Random choices are seeded and reproducible.
4. Art direction is a coordinated recipe, not a single `artistic` tag.
5. Every selected concept records its source and reason.
6. Knowledge is structured around compatibility, dependencies, and conflicts.
7. Checkpoint syntax is applied only after the scene is semantically valid.
8. Adult content is limited to adult participants; ambiguous or underage
   character entries are excluded from adult-mode selection.
9. The UI displays relevant choices, while the full knowledgebase remains
   searchable and filtered behind the engine.
10. The engine remains useful when every optional backend is disabled.

## Pipeline

### 1. Normalize

- Preserve the original request.
- Normalize punctuation and aliases without destroying character names.
- Detect negation, intensity, conjunctions, and quoted literal text.
- Assign a deterministic seed when one is not provided.

### 2. Parse Intent

Produce a `PromptIntent` contract containing entities, participants, explicit
requirements, forbidden concepts, requested art direction, content mode,
checkpoint, vibe, and unresolved ambiguities.

### 3. Compile Semantic Intent

`engine/reasoning-engine.js` converts the parsed request into a checkpoint-
independent semantic model. It identifies scene goals, themes, archetype,
participant count, relationships, explicit slots, open slots, and the policy
for inference, randomization, identity preservation, and memory.

Words such as `artistic` or `action` become coordinated planning goals rather
than tags appended to the output.

### 4. Build Scene Graph

The semantic model becomes a graph of actors, relationships, setting, camera,
and style nodes. Unnamed supporting actors may exist as semantic roles without
being converted into named characters. A generic fantasy species therefore
remains generic unless entity resolution has explicit evidence.

### 5. Resolve Entities

Resolve named characters, series, species, clothing, locations, and actions.
Resolution requires evidence and a confidence score. Namespace-aware matching
prevents collisions such as `Dragon Ball` versus `dragon girl`.

### 6. Build Constraints

Convert explicit requirements into locks. Derive dependencies and exclusions.
Examples:

- `from above` excludes a simultaneous locked `from below`.
- `solo` excludes partner-dependent actions.
- `lying on back` excludes standing poses unless the request describes two
  separate participants.
- A selected checkpoint limits syntax, supported weights, and negative-prompt
  behavior.

### 7. Select Art Direction

An `ArtRecipe` coordinates medium, rendering, composition, palette, lighting,
motifs, atmosphere, and finishing effects. A request may lock some ingredients
while the engine fills compatible open slots.

Examples of recipe families:

- Graphic limited-palette portrait
- Ukiyo-e decorative portrait
- Symbolic overhead horror composition
- Cinematic foreshortened action

### 8. Plan The Scene

Create a `ScenePlan` with participant roles, action, pose, expression,
wardrobe, environment, lighting, camera, palette, motifs, and effects. Every
decision is marked `explicit`, `entity`, `recipe`, `memory`, or `inferred`.

### 9. Rank Knowledge

Candidate score:

```text
explicit requirement       +100
entity identity             +80
recipe compatibility        +30
intent phrase match         +25
checkpoint compatibility    +20
learned preference           +8
variety bonus                +4
redundancy penalty          -15
soft conflict penalty       -40
hard conflict              reject
```

Memory influences ties and optional choices. It cannot override explicit
requirements, identity, hard compatibility, or adult-participant rules.

The reasoning layer adds archetype and theme compatibility to optional
selection. Kinetic scenes favor motion-compatible poses, camera, and effects;
quiet scenes favor restrained staging. Variation remains seeded and protects
every explicitly selected block.

### 10. Repair And Validate

Run semantic validators before rendering:

- Participant and anatomy consistency
- Action/pose compatibility
- Camera/composition compatibility
- Wardrobe/state compatibility
- Duplicate and near-duplicate concepts
- Art-recipe completeness
- Checkpoint support
- Prompt budget and block priority

Invalid optional choices are replaced. Invalid explicit combinations are kept
visible as warnings rather than silently rewritten.

The repair pass also handles literal selections without catalog conflict
metadata. It resolves incompatible camera direction, shot distance, base pose,
participant count, and wardrobe state; removes semantic duplicates; and prunes
overloaded optional blocks. Every repair remains in the reasoning trace.

### 11. Compile

The checkpoint compiler transforms the validated plan into final syntax.

WAI/Illustrious block order:

```text
quality + style + prompt-only style tokens
subject + identity + anatomy
BREAK
action + interaction + pose + expression
wardrobe
environment + lighting
camera + composition + palette + motifs + effects
LoRA commands
```

The exact order is a checkpoint profile setting. FLUX uses natural language;
tag checkpoints use checkpoint-aware separators and weight syntax.

### 12. Critique

The completed prompt is scored for subject coverage, requested actions and
relationships, unresolved conflicts, explicit requirement survival, block
coherence, fallback dependence, and checkpoint token budget. The score,
issues, metrics, variation axis, and repair trace are saved with the prompt and
shown in the expandable Scene Reasoning panel.

### 13. Learn In Context

Ratings update global scores and contextual memory buckets for checkpoint,
scene archetype, theme, vibe, and content mode. Matching context receives the
strongest signal. Learned preferences still cannot override explicit
requirements.

## Contracts

Executable contract definitions live in `engine/contracts.js`.

### PromptIntent

Represents what the user requested and what remains ambiguous. It never
contains final prompt formatting.

### KnowledgeEntry

Represents one canonical concept with aliases, prompt forms, compatibility,
dependencies, conflicts, content classification, and scoring metadata.

### ArtRecipe

Represents a coordinated visual system. It contains required and optional
ingredient slots plus rules that keep composition, palette, and rendering
coherent.

### ScenePlan

Represents the selected semantic scene before checkpoint syntax is applied.
It includes a decision trace and rejected candidates.

### CompiledPrompt

Contains positive and optional negative output, rendered blocks, warnings,
estimated budget, checkpoint identity, seed, and a decision trace.

## Knowledge Storage

The future knowledgebase will be sharded so the app does not parse one enormous
file or render every entry at once:

```text
knowledge/
  checkpoints/
  concepts/
  art-recipes/
  entities/
  aliases/
  constraints/
  generated/
```

Generated entries must retain the source rule that produced them. Curated and
generated data remain distinguishable for scoring and review.

## State Version 2

`promptbrain-state.json` will contain small metadata and references. Images
will be stored as separate files under `E:\PromptBrain\data\assets`.

Required persistence behavior:

- `schemaVersion` and ordered migrations
- Serialized write queue
- Atomic temporary write followed by replace
- Last-known-good backup
- Save acknowledgement and dirty-state indicator
- Recovery from invalid JSON
- Image assets referenced by ID rather than base64
- Separate knowledge version and user-memory version

## Phase 3 Boundary

Phase 3 may begin only after the contracts and golden fixtures validate. It
will implement normalization, deterministic randomization, entity resolution,
constraint handling, scene planning, and checkpoint compilation against a
small curated seed library. Bulk expansion remains out of scope until those
tests pass.
