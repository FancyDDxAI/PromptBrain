# PromptBrain Phase 10 Release

Date: 2026-07-22

## Result

Phase 10 integrates the accepted offline engine into the complete desktop UI,
repairs the regressions found during the Claude handoff audit, verifies durable
memory behavior, and produces a clean self-contained Windows release.

Workspace generation is engine-only. A missing catalog stops generation with a
visible error; it cannot silently substitute the old tag builder. Ollama remains
an optional scene-direction helper. Its failure returns to the authoritative
deterministic engine.

## Shipping Catalog

- Effective concepts: 26,200
- Effective named entities: 330
- Effective art recipes: 1,446
- Installed LoRA concepts: 34
- Embedded generated shards: 113
- Effective fingerprint:
  `e85c3f848ba8e074aca8604f1d6da3fd63d4dea04c15ffa816098c5b7631c801`

The 23,250 generated concepts are compiled from protected authored semantic
packs. They are engine vocabulary, not filler. The generated JSON is derived
output and must only be rebuilt through `tools/build-phase8-catalog.js`.

## Audit Repairs

- Adult character selection now comes from reviewed engine entity metadata. The
  UI no longer advertises identities that the engine correctly rejects.
- The dead hand-written LoRA table was removed. The UI uses only catalog records
  produced from installed safetensors metadata.
- Neutral portraits, candid scenes, and quiet interiors no longer receive a
  forced mood or expression. Explicit actions such as reading can still infer a
  compatible expression.
- The compact Workspace composer no longer inherits the page-entry transform;
  it remains fixed and visible at 800 px and 1024 px widths.
- Reference images are externalized through the native asset API instead of
  bloating or exhausting browser storage.
- Session drafts, themes, training rules, references, and chat deletion were
  verified across revisioned saves and multiple reloads.
- The first legacy-to-V2 rewrite now preserves the original JSON once in
  `promptbrain-state.legacy-backup.json`; later V2 saves cannot overwrite that
  migration snapshot.
- The packaged-resource test now keeps real loopback coverage on normal Windows
  hosts and uses the same private resource dispatcher in restricted test hosts
  where `HttpListener` handles are unavailable.
- The unused WebView2 WPF assembly is removed from this WinForms-only build,
  eliminating the previous `WindowsBase` warning and unnecessary payload.

## Verification

- JavaScript suite: 45 passed, 0 failed.
- Phase 8 scale: 26,200 concepts, 330 entities, 1,446 recipes; 99.9 quality.
- Phase 9 campaign: 23/23 gates; 10,200 deterministic and 11,005 total engine
  calls; digest
  `6ecc41131744a5ee6ac2e541bef19d09b387f76718767e7713eaf96a8868bfe3`.
- Prompt stress: 600 generations passed.
- State V2: serialized saves, revision conflict retry, durable image journal,
  permanent legacy migration snapshot, and rolling backup behavior passed.
- The live legacy E-drive state migrates in memory to schema 2 while preserving
  its chat, active-chat selection, and gallery records.
- Browser/WebView smoke: 26,200 concepts and 1,446 recipes loaded; exact WAI
  quality head; generic dragon girl isolation; prompt-only style tokens; live
  LoRA slider commands; real counters; responsive views; theme, draft, training,
  image reference, and deletion persistence; no browser errors.
- Native build: 0 warnings, 0 errors.
- Packaged resources: 7 engine modules, 113 shards, 34,222,410 catalog bytes,
  current fingerprint, and route-whitelist probes passed.
- Guarded deployment smoke: backup creation, four-file allowlist, executable hash
  match, protected-directory preservation, and unchanged state hash passed.

The native HTTP API smoke also passed in the normal desktop session. It verified
desktop-client authorization, origin checks, the single-writer lock, legacy
bootstrap, revisioned writes and conflict rejection, oversized-payload
rejection, durable image assets, and recovery from the known-good backup.

## Release Artifact

Path:

`dist\win-x64\PromptBrain.exe`

- Size: 73,466,712 bytes
- SHA-256:
  `787DEEFE52428CD890CA069738BE0A35D07D6F987604F3205389EFFE27EB7211`

## Installation Boundary

Pre-deploy live executable (now backed up):

- Path: `E:\PromptBrain\PromptBrain.exe`
- Size: 68,484,504 bytes
- SHA-256:
  `C1121F9BDB1753BD70BC6E3BF8AD6E4E8F73DD564C20CFADB793459EBEB53C39`

Protected installation paths:

- `E:\PromptBrain\data`
- `E:\PromptBrain\models`
- `E:\PromptBrain\runtime` when present
- `E:\PromptBrain\runtimes`

Deployment completed successfully on 2026-07-22. The guarded deployer copied
only the approved root application files and created this backup:

`E:\PromptBrain\backups\PromptBrain-20260722-122649.exe`

After the migration-backup repair, the guarded final deployment also backed up
the interim build here:

`E:\PromptBrain\backups\PromptBrain-20260722-124321.exe`

The installed executable matches the verified release SHA-256:

`60F5A14301108E8105BE7E43846D24BA17E481EE646702ED9BD6C8328622C265`

The state file remained unchanged during deployment with SHA-256:

`8694C70C8E7154DDF42BEB69E788B0AC9CAB029FE64D8FEACE61610E4D3B5044`

After launch, the State V2 store completed its next normal save at revision 2,
preserved the existing chat and active-chat selection, and produced a valid
revision-1 `promptbrain-state.backup.json`. The post-save state SHA-256 is:

`198C5B7434C000F6062B36862CEB11EC1AF6E0DE1684E45232B24DAE4F4994A0`

The protected `data`, `models`, and `runtimes` directories remained present.
The installed application launched from `E:\PromptBrain\PromptBrain.exe`,
opened the `PromptBrain` window, and remained responsive.
