# PromptBrain v1.1.2

PromptBrain v1.1.2 improves how the local reasoning engine handles short, underspecified requests.

## Changes

- Added intent scope classification for brief, standard, and detailed requests.
- Brief subject prompts now preserve the complete subject phrase instead of reducing it to a generic noun.
- Generic fantasy traits such as `elf` add appropriate anatomy without inventing a named character, profession, or franchise.
- Short requests no longer trigger unrelated actions, outfits, environments, camera angles, motifs, or epic art recipes.
- Explicit settings remain intact without causing unrelated scene expansion.
- Exact authored recipe triggers and richer action or art-direction requests still use the full knowledge engine.
- Added regression coverage across randomized short prompts and nearby fantasy, portrait, and scene requests.

## Example

Input:

`cute elf girl`

Output shape:

`masterpiece, best quality, premium illustration, clean polished anime shading, anime style, cute elf girl, pointed elf ears, BREAK, gentle smile, soft magical lighting, clean character-focused composition`

## Verification

- 57 engine and application tests passed.
- 600 randomized generation stress cases passed.
- Phase 8 catalog remains intact: 26,200 concepts, 330 entities, and 1,446 recipes.
