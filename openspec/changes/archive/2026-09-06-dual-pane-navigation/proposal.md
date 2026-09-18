# Proposal: Dual-pane navigation

## Why

Clive is single-pane, so copying a file from folder A to folder B forces you to leave A to reach B and paste — the whole reason cross-folder transfers feel maddening. The fix is not a Windows-style tree; it is keeping both folders visible at once so a transfer is a single in-app gesture. This adds a **dual-pane** browser (Marta / ForkLift-style, option A): two equivalent folder panes, each independently navigable, with drag-to-transfer between them and no-drag commands as a fallback.

## What Changes

- Replace the single `FileList` view with **two equal file panes** (left/right), each with its own path, breadcrumb, selection, sort/view and a per-pane "Go to…" menu.
- Add an **active-pane** model: keyboard navigation and toolbar actions target the active pane; `Tab` / `⌘1` / `⌘2` switch it; `⌥⌘←` swaps the two panes' paths.
- Add **in-app drag to transfer** between panes: dropping a selection on the other pane's list **moves** by default; holding **⌥ copies**. (Finder-true drag is explicitly out of scope for v1.)
- Add **"Copy to…" / "Move to…"** context-menu items (and a `⌘⇧O` "Send selection to other pane" shortcut) as the non-drag path, plus dropping onto a breadcrumb / "Go to…" destination.
- Retire the always-on left sidebar as a separate region: its **Places + Recents** fold into each pane's per-pane "Go to…" menu (Places are shared presets; Recents tracked globally).
- Default layout: **left = current folder, right = its parent**; window split is draggable and persisted.
- Preserve existing single-pane behaviours per pane: search, context menu, status bar, hidden-toggle, theme, i18n strings.

## Capabilities

### New Capabilities

- `dual-pane-navigation`: the two-pane model, active-pane semantics, per-pane "Go to…" with Places/Recents, in-app drag move/copy, and the "Copy to… / Move to…" commands.

### Modified Capabilities

- None in the deployed `openspec/specs/` baseline. This supersedes parts of `context-menu` (adds Copy/Move-to), `status-bar` (context-actions target the active pane), `ui-i18n` (new strings localized), and the sidebar behaviour introduced in `file-manager-gui`.

## Impact

- **Frontend**: new `PanesView.tsx` + `FilePane.tsx` (refactors `FileList` usage per pane); `App.tsx` gains `panes: {left,right}` + `activePane` state, drag handlers, "go to" menu, split persistence (`fm.split.ratio`), shortcut wiring; `Places` becomes a reusable per-pane menu; `actionsFor`/`buildContextItems` gain Copy/Move-to. Tauri **drag-drop** plugin **not** required (in-app only).
- **Backend**: reuses existing `copy_file`, `move_file`, `paste_paths` (which already auto-unique-names). May add a batch `copy_to`/`move_to` command to avoid N round-trips.
- **Persistence**: `fm.panes` (last paths), `fm.split.ratio`, active pane; migrated from the current single `currentPath`.
- **Non-breaking for AI**: AI actions operate on the active pane's selection.
