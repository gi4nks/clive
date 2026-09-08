## Why

Building a custom file manager for macOS to replace Finder with a local-first, efficient tool using Tauri + Rust. The goal is full control over filesystem operations, elimination of Finder friction, and a personalized tool without cloud dependencies.

## What Changes

This change delivers the backend command surface and core file operations for a Tauri + Rust file manager on macOS. It reflects what was **actually implemented**, and explicitly marks the originally-envisioned features that were **not delivered in the MVP**.

## Capabilities

### New Capabilities (delivered)

- **file-manager-tauri**: synchronous Tauri command surface for filesystem operations (list, home, copy, move, rename, create folder, read/write text, reveal in Finder).
- **internal-clipboard**: in-app clipboard state (set of paths + pending copy/move operation) driving paste with unique-destination handling.
- **trash-management**: safe deletion moving items to the macOS Trash via the `trash` crate.

### Not delivered in the MVP (originally proposed, deferred)

- **fs-async-operations**: operations are synchronous `std::fs`; there is no `tokio::fs` chunked copy with progress. (`tokio` remains a declared dependency but is not used by the commands.)
- **fsevents-watcher**: no `notify`/FSEvents watcher and no Rust-side debounce. The frontend refreshes the current directory by polling instead.
- **batch-operation-queue**: no `mpsc` queue and no concurrency limit; each command handles one operation.
- **system-clipboard sync**: the clipboard is internal-only; it is not synchronized with the macOS system clipboard.

## Impact

- **Codebase**: Tauri project at `clive/fm` with `src-tauri/src/commands/{filesystem.rs,clipboard.rs}`, `main.rs`, `Cargo.toml`, `tauri.conf.json`; React + Vite frontend under `src/frontend/vite-project/`.
- **Dependencies (actual)**: `tauri` 2.11, `serde`/`serde_json`, `trash` 5; `tokio` is declared but effectively unused by the command layer.
- **Frontend data freshness**: achieved via a 2-second poll of the active directory, not via a filesystem watcher.
- **Platform**: macOS-focused (`open`/`reveal in Finder`, `trash`); no Windows/Linux support.

## Non-Goals (MVP, as delivered)

- Async/progress-reporting operations.
- Live filesystem watching (polling is used).
- Batch/concurrent operation queue.
- System clipboard synchronization.
- Cross-platform support and App Store sandbox compliance.
