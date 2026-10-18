# P1: Split filesystem commands by capability

## Decision

Split the oversized `src-tauri/src/commands/filesystem.rs` implementation into Rust modules organized around stable filesystem capabilities. Keep `filesystem.rs` as the namespace and home for the cross-capability safety tests. Tauri registers command functions from their owning modules; internal Rust callers import helpers from the capability module that owns them.

## Delivered modules

- `path_safety`: normalized paths, protected-location rules, mounted-path checks, and mount identity.
- `finder_tags` and `tags`: macOS xattr serialization and tag commands.
- `listing` and `metadata`: directory entries, file information, and recursive size.
- `macos`: native Finder icons and home directory lookup.
- `transfers`: copy, move, batch transfer, rename, and folder creation.
- `preview`: text and byte previews plus base64 encoding.
- `desktop`: Finder reveal, open path, Quick Look, and terminal launch.
- `volumes`: SMB connect/disconnect, volume listing, disk space, and eject.

## Tradeoffs

This adds module files and makes capability dependencies explicit. It avoids an extra service abstraction: Tauri command functions remain the adapters and Rust remains the filesystem authority. Shared path and mount safety stay centralized because multiple capabilities depend on the same rules. Existing callers in trash, plans, clipboard, and archives now import the owning capability directly.

## Verification

`cargo fmt`, `cargo check`, and `cargo test` pass. The Rust suite reports 51 passed, 0 failed. Behavior and wire command names are preserved; `generate_handler!` registers each command using its implementation module path.
