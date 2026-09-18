# Tasks: File Manager — Tauri + Rust backend (accurate status)

Status legend: `[x]` delivered and verified in code; `[ ]` NOT delivered (deferred).

## 1. Project Scaffold

- [x] 1.1 Initialize Tauri + Rust project structure (`Cargo.toml`, `tauri.conf.json`, `src-tauri/src/main.rs`, command modules)
- [x] 1.2 Configure `tauri.conf.json` window + build commands
- [x] 1.3 Set up `Cargo.toml` dependencies (`tauri`, `serde`, `serde_json`, `trash`; `tokio` declared)

## 2. Frontend Foundation

- [x] 2.1 Create React + TypeScript + Vite project
- [x] 2.2 Implement FileList component with multi-selection (Cmd/Shift-click)
- [x] 2.3 Implement inline RenameInput

## 3. Core File Operations (Rust)

- [x] 3.1 `copy_file` — synchronous `std::fs` copy, recursive for directories, creates parent dirs (NOTE: not async, no progress)
- [x] 3.2 `move_file` — `std::fs::rename` with copy+delete cross-device fallback
- [x] 3.3 `rename` — validated rename within parent, rejects empty/`.`/`..`/slash and collisions
- [x] 3.4 `delete_to_trash` — moves to Trash via `trash` crate
- [x] 3.5 `create_folder`, `list_dir`, `home_dir`, `read_text_file`, `write_text_file`, `reveal_in_finder`

## 4. Internal Clipboard

- [x] 4.1 `ClipboardState` with `Mutex<HashSet<PathBuf>>` + pending operation (`copy`/`move`)
- [x] 4.2 `copy_paths`, `cut_paths`, `paste_paths`, `clipboard_info`, `clear_clipboard` commands
- [x] 4.3 Paste uses unique-destination naming on collision; move clears clipboard, copy retains
- [ ] 4.4 System clipboard synchronization — NOT delivered (internal only)

## 5. Frontend Data Freshness

- [x] 5.1 Poll the active directory every 2 seconds to refresh the listing

## 6. Deferred / Not delivered (originally proposed)

- [ ] 6.1 FSEvents `notify` watcher with debounce — replaced by polling
- [ ] 6.2 `tokio::fs` async copy with progress reporting — replaced by synchronous copy
- [ ] 6.3 `mpsc` batch-operation queue with concurrency limit — not implemented
- [ ] 6.4 Type-ahead / jump-to-file — not implemented

## 7. MVP Polish

- [x] 7.1 `cargo check` passes; core operations exercised
- [x] 7.2 Listing refreshes after operations (via polling)
- [x] 7.3 Multi-selection + clipboard copy/cut/paste verified
