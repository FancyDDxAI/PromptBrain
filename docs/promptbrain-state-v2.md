# PromptBrain State V2

## Disk Layout

Default Windows location:

```text
E:\PromptBrain\data\promptbrain-state.json
E:\PromptBrain\data\promptbrain-state.backup.json
E:\PromptBrain\data\assets\img-<sha256>.<ext>
```

If the E drive cannot be used, the wrapper falls back to `%LOCALAPPDATA%\PromptBrain\data`.

Tests can override the directory with `PROMPTBRAIN_DATA_DIR` and the local API port with `PROMPTBRAIN_PORT`.

## State Metadata

```json
{
  "schemaVersion": 2,
  "meta": {
    "format": "promptbrain-state",
    "revision": 12,
    "createdAt": 1700000000000,
    "updatedAt": 1700000010000,
    "migratedFrom": 1,
    "lastWriter": "desktop-wrapper"
  }
}
```

The server owns the final revision and `updatedAt` value.

## Save Protocol

The browser sends:

```json
{
  "schemaVersion": 2,
  "expectedRevision": 11,
  "state": {}
}
```

The server returns HTTP 409 if the expected revision is stale. Successful writes use a temporary file, flush it to disk, preserve the previous valid state as the backup, and atomically replace the primary file.

Legacy raw-state POST bodies remain supported. This lets older UI code run while the app is migrated in stages.

## Asset Protocol

Embedded `data:image/...;base64,...` values are uploaded to `POST /api/assets`. The server calculates a SHA-256 content ID, deduplicates identical images, and returns a stable `/api/assets/...` URL.

The state store replaces the embedded value with that URL before saving the main JSON. Browser localStorage backups remove any remaining embedded image payloads.

## Recovery

`GET /api/state` validates the primary JSON. If it is malformed, the wrapper validates `promptbrain-state.backup.json`, restores it to the primary path, and returns the recovered state. If neither file is valid, it returns an empty object and the browser creates a clean default state.
