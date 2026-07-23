# PromptBrain v1.1.0

PromptBrain v1.1.0 redesigns the application as a compact creative workstation while preserving the local prompt engine, model knowledge, sessions, ratings, image memory, and learned preferences from v1.0.0.

## Interface

- New Graphite workstation design with restrained borders, compact controls, and clearer information hierarchy.
- Rebuilt three-column Workspace with searchable prompt controls, persistent composer, session output, live prompt, and LoRA inspector.
- Compact top context controls for checkpoint, vibe, content mode, character, style tokens, and compatible LoRAs.
- Redesigned navigation, session list, Models, Insights, Prompt Training, Result Lab, Image Memory, History, and settings surfaces.
- Responsive desktop, compact, and narrow-window layouts.
- Visible in-app v1.1.0 version marker.

## Appearance Studio

- Editable canvas, surface, elevated surface, border, primary, secondary, text, muted text, positive, warning, danger, and selection colors.
- Graphite, Porcelain, and Midnight Plum presets.
- Adjustable corner radius, interface density, sidebar width, and motion strength.
- Portable JSON theme import and export.
- Appearance preferences persist in the local PromptBrain state file.
- Existing v1.0 theme preferences migrate to their closest v1.1 palette.

## Compatibility

- Existing sessions, training rules, ratings, references, galleries, model selections, LoRA weights, and contextual learning remain compatible.
- The embedded deterministic engine and 26,200-concept catalog are unchanged by the visual migration.
- No AI model, checkpoint, LoRA file, or personal user data is bundled.

## Verification

- JavaScript syntax and browser module loading
- Deterministic reasoning and prompt campaigns
- Revisioned state persistence and migration
- Desktop, compact, and narrow-window UI smoke tests
- Native packaged-resource validation
- Self-contained Windows build and launch test

## Integrity

SHA-256 for `PromptBrain-v1.1.0-win-x64.zip`:

`713006C2F7C5C337AA3C8F0F7041C274771B0AC00AC468D1D05353B64402D84D`

SHA-256 for `PromptBrain.exe`:

`12CEB9A03EFE7FFAF66C08DE65ADA01B67D5D88FF9BEC3FE4D017DF6851615A9`
