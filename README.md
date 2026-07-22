# PromptBrain

PromptBrain is a local-first Windows prompt studio for ComfyUI. It turns a short idea into a structured, checkpoint-aware image-generation prompt while keeping sessions, preferences, ratings, and learned prompt choices on the user's own computer.

## What it does

- Builds structured prompts for WAI/Illustrious, SDXL, Pony, SD 1.5, FLUX, and other checkpoint families.
- Uses an embedded deterministic prompt engine with 26,200 effective concepts, 330 named entities, and 1,446 art-direction recipes.
- Provides checkpoint rules, compatible LoRA controls, style tokens, character selection, pose and action controls, camera direction, lighting, environments, and weighted tags.
- Includes prompt training, local preference learning, result comparison, image memory, sessions, history, and real usage insights.
- Supports SFW and adult workflows while excluding underage and illegal content.
- Works without a cloud API or bundled language model. An external local AI backend is optional.

## Download

Download `PromptBrain-v1.0.0-win-x64.zip` from the latest GitHub release, extract it, and run `PromptBrain.exe`.

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

