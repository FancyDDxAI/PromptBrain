# PromptBrain

[![Release](https://img.shields.io/github/v/release/FancyDDxAI/PromptBrain?style=flat-square)](https://github.com/FancyDDxAI/PromptBrain/releases/latest)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?style=flat-square)
![.NET](https://img.shields.io/badge/.NET-8.0-512BD4?style=flat-square)
![Engine](https://img.shields.io/badge/engine-local--first-22C55E?style=flat-square)

PromptBrain is a local-first Windows prompt studio for ComfyUI. It turns a short idea into a structured, checkpoint-aware image-generation prompt while keeping sessions, preferences, ratings, and learned prompt choices on the user's own computer.

## What it does

- Builds structured prompts for WAI/Illustrious, SDXL, Pony, SD 1.5, FLUX, and other checkpoint families.
- Uses an embedded deterministic prompt engine with 26,200 effective concepts, 330 named entities, and 1,446 art-direction recipes.
- Compiles requests into semantic intent and a scene graph, resolves conflicting directions, creates coherent seeded variations, and critiques each prompt before delivery.
- Provides checkpoint rules, compatible LoRA controls, style tokens, character selection, pose and action controls, camera direction, lighting, environments, and weighted tags.
- Includes prompt training, local preference learning, result comparison, image memory, sessions, history, and real usage insights.
- Supports SFW and adult workflows while excluding underage and illegal content.
- Works without a cloud API or bundled language model. An external local AI backend is optional.

## Version 1.1.2

- Added brief-intent reasoning so short subject prompts stay focused.
- Preserves complete generic subjects such as `cute elf girl` and `dark elf woman`.
- Prevents unrequested actions, professions, outfits, settings, camera directions, and art recipes.
- Keeps explicit scene direction and authored recipe triggers fully available.

- Rebuilt Workspace around a compact context bar, searchable control library, scene board, and semantic prompt inspector.
- Added Subject, Look, and Scene tabs with Recommended, Learned, and Recent filters.
- Rebuilt Models as a checkpoint list, live rule detail, and compatible LoRA inspector.
- Rebuilt Prompt Training as a focused correction editor and local learning view.
- Restyled Result Lab, Insights, Settings, and secondary surfaces around one restrained interface system.
- Added fully customizable semantic colors, density, corner radius, sidebar width, and motion.
- Preserved Graphite, Porcelain, and Midnight Plum presets with JSON theme import and export.
- Added responsive desktop, resized-window, and compact-screen layouts.

## Technology

| Area | Technology | Purpose |
| --- | --- | --- |
| Desktop host | C# 12, .NET 8, Windows Forms | Native Windows executable, window lifecycle, local file access, and application APIs |
| Desktop rendering | Microsoft Edge WebView2 | Hosts the responsive application interface inside the native shell |
| Prompt engine | JavaScript | Semantic intent compilation, scene-graph planning, checkpoint-aware assembly, critique, repair, and contextual learning |
| Interface | HTML5 and CSS3 | Workspace, models, insights, training, result lab, image memory, and appearance customization |
| Knowledge system | Structured JSON catalogs | 26,200 concepts, 330 entities, 1,446 recipes, checkpoint rules, and LoRA metadata |
| Testing and tooling | Node.js and PowerShell | Deterministic campaigns, stress tests, catalog validation, builds, and deployment checks |

## Download

- [Download the latest packaged Windows release](https://github.com/FancyDDxAI/PromptBrain/releases/latest)
- [Download PromptBrain.exe directly](https://github.com/FancyDDxAI/PromptBrain/raw/refs/heads/main/PromptBrain.exe)

## Requirements

- Windows 10 or Windows 11, 64-bit
- Microsoft Edge WebView2 Runtime, normally included with current Windows installations
- A writable folder for local settings and memory

## Privacy

PromptBrain's core engine runs locally. Chats, ratings, learned preferences, references, and sessions are stored locally and are not included in the public download.

## Optional AI model

No AI model is bundled. PromptBrain's deterministic engine works without one. Users may configure a compatible local backend separately for AI-assisted scene direction.

## Version

Current release: **v1.1.2**
