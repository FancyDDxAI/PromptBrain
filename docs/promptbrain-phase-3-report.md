# PromptBrain Phase 3 Report

Completion date: 2026-07-17

## Delivered

Phase 3 implements a browser-ready, fully offline prompt engine without API,
Ollama, or network dependencies.

- Deterministic request normalization and seeded randomization
- Explicit requirement and forbidden-concept parsing
- Namespace-aware named-character resolution
- Adult-mode eligibility gating for named entities
- Structured participant records
- Semantic dependencies for species, action, pose, camera, and environment
- Conflict groups with explicit-choice precedence
- Memory-score hooks for later learned ranking
- Art-recipe selection and coordinated ingredient application
- WAI/Illustrious, Pony, SDXL, SD1.5, and FLUX compilation profiles
- Empty negative prompts by default, with explicit opt-in support
- Decision traces, rejected candidates, warnings, and token estimates

## Seed Scope

The Phase 3 seed contains:

- 17 checkpoint profiles
- 6 named-character entities used by regression cases
- 109 structured concepts
- 6 foundational art recipes

This seed proves the engine. It is not the planned user-facing knowledgebase.
Large-scale art direction and the 2,000-4,000 curated seed expansion remain in
later phases.

## Verification

- Contract tests: passed
- Golden behavior tests: passed
- Browser/WebView global-loading test: passed
- Cross-checkpoint stress test: 600 generations passed
- Seeded variation: 12 distinct outputs across 24 seeds
- Existing PromptBrain JavaScript syntax: passed
- Desktop .NET build: passed with 0 errors

Stress assertions cover deterministic replay, non-empty output, empty negatives
by default, camera conflicts, shot-distance conflicts, generic versus named
dragon identity, Dragon Ball namespace isolation, contract validity, and all 17
checkpoint profiles.

## Behavioral Improvements Demonstrated

The engine now converts broad intent into coordinated visual direction:

- Artistic oni portrait -> graphic anime medium, controlled negative space,
  circular sun, limited black/white/red palette, red rim light, graphic motifs
- Ukiyo-e portrait -> ukiyo-e and sumi-e, decorative floral framing, Hokusai
  waves, ink texture, controlled negative space
- Overhead oni horror -> locked overhead camera, circular blood composition,
  crimson horror palette, symbolic motifs
- Eren action -> resolved character namespace, ODM gear, airborne lunge,
  foreshortening, city depth, sunset rim light, directional motion

## Current Boundary

The new engine is intentionally not wired into `promptbrain.js` or the installed
executable yet. Integration happens after Art Director and curated-seed quality
gates, avoiding replacement of the working generator with an incomplete
knowledgebase.

Phase 4 expands Art Director recipe grammar, ingredient relationships, visual
mediums, composition systems, palettes, lighting systems, motifs, and artistic
validation while retaining the tested Phase 3 contracts.
