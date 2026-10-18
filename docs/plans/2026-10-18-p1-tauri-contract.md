# P1: Check the Tauri command contract

## Decision

Keep a readable TypeScript command map in `frontend/src/api.ts`, while checking it against the authoritative Rust registration and signatures. This avoids introducing a code generation dependency and ensures every UI wrapper takes its result type from the map.

## Contract checks

`scripts/check-tauri-contract.mjs` verifies:

- every command in `tauri::generate_handler!` has exactly one TypeScript map entry and a Rust `#[tauri::command]` implementation;
- the Rust wire argument names and supported input types (including Tauri camelCase conversion) match TypeScript argument keys and types;
- the Rust return type maps to the declared TypeScript result type;
- DTO fields required by the frontend exist in the serialized Rust DTOs, including nested DTOs.

Injected Tauri runtime parameters (`AppHandle` and `State`) are excluded from wire arguments. Additive Rust DTO fields are allowed so internal journal metadata can remain serialized without forcing unused frontend properties.

## Error shape

Tauri command rejections are normalized at the frontend boundary to `TauriCommandError`, with `code`, `command`, and `message`. The original Rust string remains the message, and `String(error)` returns that message to preserve existing UI error text.

## DTO corrections

`ai_get_config` now returns the serializable `AiProviderInfo` struct. This fixes the missing `device` property the TypeScript interface already required. `build_info` now returns the serializable `BuildInfo` struct instead of arbitrary JSON. Result DTO fields that Rust always emits are required in TypeScript where appropriate; `FileEntry.tags` remains optional because the UI also synthesizes entries for archive and plan previews.

## Automation and verification

`npm run build` and `npm test` both run `npm run check:tauri-contract`. Tauri packaging invokes the frontend build, so the contract check also runs before a release bundle is produced.
