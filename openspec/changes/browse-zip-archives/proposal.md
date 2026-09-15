# Proposal: browse-zip-archives

## Why

`.zip` files are the only archive format Clive should care about, and today they are a lie in the UI: the context menu says "Extract" but the action just delegates to the default macOS app. Users (esp. with the new preview/volumes features) expect to open a zip like a folder, look inside, preview and extract — Finder-like — without leaving the app.

## What Changes

- `.zip` files become **read-only virtual folders**: entering one lists its entries in the pane using an `archive.zip!/inner/path` pseudo-path scheme.
- New Rust commands (crate `zip`, read-only): `zip_list(path)`, `zip_read(path, inner, cap)` (preview bytes, size-capped), `zip_extract(path, destDir, entries?)` with zip-slip protection (resolved targets always under `destDir`; symlinked entries skipped).
- Double-click inside an archive = extract-to-temp + open with default app; Quick Look uses the same temp pipeline. PreviewPanel reads inner files via `zip_read`.
- **Read-only UI integration** (all strings i18n en/it, parity-tested): archive icon + "Archivio" badge, breadcrumb with clickable `file.zip` segment and `›` separator, rail label, archive context for pane header; inside archives disable Rename/Trash/Copy/Cut/Paste/NewFolder/OpenTerminal + their shortcuts (status message explains why); Reveal in Finder targets the `.zip`; no drag out and no drop on `.zip` (v1); pins of inner paths rejected; DiskWidget/status uses the real parent volume.
- On the `.zip` itself: Enter, "Extract all…", "Extract to…" (folder picker via existing Places-style path input), native Quick Look. Multiple selected inner files → "Extract selected…".
- Corrupted/encrypted zips: list fails with a visible error, the file stays openable by Finder.
- Out of scope v1 (declared): creating/adding to zips, password-protected extraction, other formats (tar/gz/7z), clipboard copy-out.

## Capabilities

### New Capabilities
- `zip-archives`: read-only browsing, preview and safe extraction of `.zip` archives integrated in panes/preview/menus.

### Modified Capabilities
<!-- none — preview-panel/pane behaviors extend additively under the new capability -->

## Impact

- Rust: `Cargo.toml` (+ `zip` crate), new `commands/archives.rs` (+ main.rs registration).
- Frontend: pane path handling (pseudo-path codec `!/`), `FileList`/`FilePane`/`Sidebar` (pin guard), `ContextMenu`/`actionsFor`, `PreviewPanel`/`preview.ts` loader routing, transfers drop guard, `api.ts` commands, i18n `archive.*` en/it.
- No change to `@gi4nks/wise`; no DB/migrations. Version: target of the `1.2.0` minor bump on release.
