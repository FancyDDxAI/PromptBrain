# PromptBrain v1.1.1

PromptBrain v1.1.1 is a corrective interface release that replaces the legacy workspace layout with the approved v1.1 design.

## Interface

- Rebuilt Workspace around a compact context bar, searchable control library, scene board, and semantic live-prompt inspector.
- Added Subject, Look, and Scene library tabs plus Recommended, Learned, and Recent filters.
- Added real scene summaries inferred from the current request and generated prompt.
- Moved style tokens and compatible LoRAs into a compact context popover.
- Rebuilt Models as a checkpoint list, live rule detail, and compatible LoRA inspector.
- Rebuilt Prompt Training as a focused correction editor and local learning view.
- Restyled Result Lab, Insights, Settings, and secondary surfaces to use the same restrained visual system.
- Improved responsive behavior for desktop, resized windows, and compact screens.

## Customization

- Fixed Appearance Studio tokens so palette, semantic colors, radius, density, sidebar width, and motion affect the new interface.
- Preserved Graphite, Porcelain, and Midnight Plum presets plus theme import and export.

## Reliability

- Preserves the existing local prompt engine, catalog, sessions, image memory, feedback, and saved settings.
- Keeps all analytics tied to real local usage.
- Includes the new stylesheet in the desktop executable host.
- Passed 55 engine and persistence tests, 600 generation stress cases, responsive UI smoke tests, packaging checks, and desktop build validation.
