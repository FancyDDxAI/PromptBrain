# PromptBrain

[![Release](https://img.shields.io/github/v/release/FancyDDxAI/PromptBrain?style=flat-square)](https://github.com/FancyDDxAI/PromptBrain/releases/latest)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4?style=flat-square)
![.NET](https://img.shields.io/badge/.NET-8.0-512BD4?style=flat-square)
![Engine](https://img.shields.io/badge/engine-local--first-22C55E?style=flat-square)
[![Repository size](https://img.shields.io/github/repo-size/FancyDDxAI/PromptBrain?style=flat-square)](https://github.com/FancyDDxAI/PromptBrain)

PromptBrain is a local-first Windows prompt studio for ComfyUI. It turns a short idea into a structured, checkpoint-aware image-generation prompt while keeping sessions, preferences, ratings, and learned prompt choices on the user's own computer.

## What it does

- Builds structured prompts for WAI/Illustrious, SDXL, Pony, SD 1.5, FLUX, and other checkpoint families.
- Uses an embedded deterministic prompt engine with 26,200 effective concepts, 330 named entities, and 1,446 art-direction recipes.
- Provides checkpoint rules, compatible LoRA controls, style tokens, character selection, pose and action controls, camera direction, lighting, environments, and weighted tags.
- Includes prompt training, local preference learning, result comparison, image memory, sessions, history, and real usage insights.
- Supports SFW and adult workflows while excluding underage and illegal content.
- Works without a cloud API or bundled language model. An external local AI backend is optional.

## Technology

| Area | Technology | Purpose |
| --- | --- | --- |
| Desktop host | C# 12, .NET 8, Windows Forms | Native Windows executable, window lifecycle, local file access, and application APIs |
| Desktop rendering | Microsoft Edge WebView2 | Hosts the responsive application interface inside the native shell |
| Prompt engine | JavaScript | Deterministic intent parsing, checkpoint-aware prompt assembly, art direction, and local learning |
| Interface | HTML5 and CSS3 | Workspace, model library, insights, prompt training, result lab, image memory, and settings |
| Knowledge system | Structured JSON catalogs | 26,200 concepts, 330 entities, 1,446 recipes, checkpoint rules, and LoRA metadata |
| Testing and tooling | Node.js and PowerShell | Deterministic campaigns, stress tests, catalog validation, builds, and deployment checks |

## Repository Statistics

[![Top language](https://img.shields.io/github/languages/top/FancyDDxAI/PromptBrain?style=flat-square)](https://github.com/FancyDDxAI/PromptBrain)
[![Language count](https://img.shields.io/github/languages/count/FancyDDxAI/PromptBrain?style=flat-square)](https://github.com/FancyDDxAI/PromptBrain)
[![Code size](https://img.shields.io/github/languages/code-size/FancyDDxAI/PromptBrain?style=flat-square)](https://github.com/FancyDDxAI/PromptBrain)
[![Last commit](https://img.shields.io/github/last-commit/FancyDDxAI/PromptBrain?style=flat-square)](https://github.com/FancyDDxAI/PromptBrain/commits/main)

GitHub's language bar is calculated from authored source. Generated catalogs, reports, binary releases, and test fixtures are explicitly excluded from language statistics.

## Download

- [Download the packaged Windows release](https://github.com/FancyDDxAI/PromptBrain/releases/latest)
- [Download PromptBrain.exe directly](https://github.com/FancyDDxAI/PromptBrain/raw/refs/heads/main/PromptBrain.exe)

## Requirements

- Windows 10 or Windows 11, 64-bit
- Microsoft Edge WebView2 Runtime, normally included with current Windows installations
- A writable folder for local settings and memory

## Privacy

PromptBrain's core engine runs locally. Chats, ratings, learned preferences, references, and sessions are stored locally and are not included in the public download.

## Optional AI model

No AI model is bundled with this release. PromptBrain's deterministic engine works without one. Users may configure a compatible local backend separately if they want AI-assisted scene direction.

## Version

Current release: **v1.0.0**
