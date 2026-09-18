# Proposal: add-preview-panel

## Why

Clive has no in-app preview: a click only selects, and everything visual depends on macOS Quick Look (`space`) or launching external apps. Users browsing photos/documents must leave the app to see what a file contains. Finder-like instant preview inside the window makes the dual-pane workflow actually usable for media.

## What Changes

- New **preview panel**: a right-hand column of the app shell that live-previews the selection of the active pane (single file → content; multiple → summary; folder → metadata).
- New Rust command `read_file_bytes(path)` (base64, 32 MB cap, path validated) — deliberately chosen over the Tauri asset protocol to avoid new scopes/CSP surface; the webview builds blob: URLs.
- Renderers v1: images (incl. HEIC), video, audio, PDF, text/code (line-capped), markdown (existing `react-markdown`), and a **fallback card** with "Open with Quick Look" (existing `quick_look`) for everything else.
- Toggle: Settings → File "Anteprima" + toolbar button + ⌘⇧P; state persisted in appConfig (`previewPanel: boolean`, default off).
- No changes to click semantics: click = select (drives the panel), double-click = open, space = Quick Look as today.

## Capabilities

### New Capabilities
- `preview-panel`: in-app preview of the current selection with content-type routing, Quick Look fallback, and privacy/cap limits.

### Modified Capabilities
<!-- none: no existing spec-level requirement changes -->

## Impact

- `src-tauri/src/commands/filesystem.rs` (+ main.rs registration): new `read_file_bytes` command.
- Frontend: new `PreviewPanel.tsx` + `preview.ts` (kind detection/cache), `App.tsx` shell column, `SettingsModal` toggle, `appConfig` field, toolbar button, keyboard shortcut, i18n `preview.*` (en+it).
- Memory: blob URL lifecycle (revoke on selection change) — bounded by the 32 MB cap.
