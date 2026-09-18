# Proposal: Contextual Status Bar (bottom dock)

## Why

The current bottom bar only shows the element/selection count and a transient status string. As the application matures, users need persistent, glanceable system context (time, date, disk usage, Trash state) and quick access to common actions without hunting through the top toolbar or right-click menus. Turning the footer into a contextual dock gives a single, extensible surface for both: contextual file actions on the left, search and clipboard progress in the center, and system widgets on the right. Building it on a widget registry (rather than hardcoded markup) lets new widgets be added without touching the shell.

## What Changes

- Replace the existing footer with a `StatusBar` composed from an extensible widget registry with left/center/right zones.
- Add a **contextual quick-actions** widget derived from the same action set as the file/sidebar context menu (single source of truth, no divergence).
- Add an **inline search box** that filters the current directory listing by file name.
- Add a **clipboard / paste progress chip** shown when the internal clipboard holds files or a paste is running.
- Add **system widgets**: clock, date-only calendar, disk usage, and Trash (open + empty-with-confirmation).
- Add a **quick-launcher** menu: "Open Terminal here" and "Toggle hidden files".
- Add a global, persisted **"show hidden files"** state and plumb it through directory listing and the 2s auto-refresh poller.
- Add backend Tauri commands `disk_space`, `open_terminal`, `empty_trash`, and extend `list_dir` with an optional `showHidden` argument.
- Introduce a keyboard **focus model** so list navigation keys do not conflict with controls inside the status bar.

## Capabilities

### New Capabilities

- `status-bar`: the dock shell, zone layout, widget registry contract, contextual quick-actions, search, clipboard chip, element count, keyboard focus model, responsive overflow, and accessibility.
- `system-widgets`: clock, date-only calendar, disk usage, and Trash widgets (open + empty-with-confirmation).
- `quick-launcher`: launcher dropdown with "Open Terminal here" and "Toggle hidden files" (theme control intentionally excluded).
- `file-hiding`: global persisted hidden-file visibility affecting listing, element count, and the auto-refresh poller.
- `fs-commands`: backend contract for `list_dir(showHidden)`, `disk_space`, `open_terminal`, and `empty_trash`.

### Modified Capabilities

- None against the deployed baseline (`openspec/specs/` is not yet populated). Behavior changes to the file list (search filtering, hidden-file visibility, focus model) are expressed as **ADDED** requirements within `status-bar` and `file-hiding`.

## Impact

- **Frontend**: new `src/StatusBar.tsx`, `src/statusWidgets.tsx`, and per-widget modules under `src/widgets/`; changes to `src/App.tsx` (remove old footer, mount `StatusBar`, add `showHidden` state, extend the refresh/poll plumbing, apply the keyboard focus rule, expose an action builder shared with the context menu) and `src/api.ts` (new command bindings).
- **Backend**: `src-tauri/src/commands/filesystem.rs` (extend `list_dir`; add `disk_space`, `open_terminal`, `empty_trash`); `src-tauri/src/main.rs` (register new commands).
- **Configuration**: new `localStorage` key `fm.hidden`; no breaking changes to existing commands (`showHidden` is an optional, default-false addition).
- **Platform**: macOS-only (Terminal/Trash/`df`/Finder integration), consistent with the existing app.
