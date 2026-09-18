# Tasks: Contextual Status Bar

## 1. Backend commands (Rust)

- [x] 1.1 Extend `list_dir` with `show_hidden: Option<bool>` (default `false`); when false, skip entries whose name starts with `.`.
- [x] 1.2 Add `disk_space(path) -> { total_bytes, free_bytes, used_bytes, volume_name }` parsing `df -kP` output for the volume containing `path`.
- [x] 1.3 Add `open_terminal(path)` running `open -a Terminal "<path>"`, returning `Err` on failure.
- [x] 1.4 Add `empty_trash()` invoking Finder to empty the Trash (osascript), returning `Err` on failure.
- [x] 1.5 Register the new commands in `main.rs` and ensure `cargo check` / `cargo clippy` are clean.

## 2. Frontend API bindings

- [x] 2.1 Add `diskSpace`, `openTerminal`, `emptyTrash` bindings in `src/api.ts`.
- [x] 2.2 Update `listDir` binding to accept `showHidden`.

## 3. App state & plumbing

- [x] 3.1 Add `hiddenVisible` state backed by `localStorage` key `fm.hidden` (default `false`), with a setter.
- [x] 3.2 Thread `hiddenVisible` into `refresh()` and the 2s auto-refresh poller.
- [x] 3.3 Extract a shared action builder so the status-bar contextual widget and the right-click context menu use one source of truth.
- [x] 3.4 Implement the keyboard focus rule: list navigation keys (arrows/Space/Enter/Delete) act only when focus is on the list/body, not on status-bar controls; Escape closes popovers and blurs controls.
- [x] 3.5 Remove the old footer and mount `StatusBar`.

## 4. StatusBar shell & registry

- [x] 4.1 Create `StatusBar.tsx` with left/center/right zones and a `WidgetCtx` prop bundle (state + actions).
- [x] 4.2 Create `statusWidgets.tsx` registry: `{ id, placement, order, Component, visible? }`, grouped and sorted for render.
- [x] 4.3 Implement the responsive overflow: below a width threshold, right-zone widgets collapse into a `⋯` menu; search collapses to an icon.
- [x] 4.4 Add a reusable popover primitive (daisy `dropdown`) that closes on outside-click / Escape / scroll (ignoring scroll originating inside the popover).

## 5. Widgets

- [x] 5.1 `context-actions` (left): quick actions for 0/1/N selection + current folder; overflow into `⋯` that opens the shared context menu.
- [x] 5.2 `search-box` (center): filter current entries by name (case-insensitive), with clear control; survives the 2s refresh.
- [x] 5.3 `clipboard-chip` (center): visible when clipboard non-empty or paste in progress; click clears.
- [x] 5.4 `clock` (right): ticking in isolation (own state), popover with full date; no re-render of the file list.
- [x] 5.5 `calendar-date` (right): month grid popover with today highlighted; no events.
- [x] 5.6 `disk` (right): popover with used/total bar and free space for the current volume.
- [x] 5.7 `trash` (right): popover with count + preview (cached ~30s) from `list_dir(~/.Trash, showHidden=true)`; "Open" action and "Empty Trash" behind a confirmation modal.
- [x] 5.8 `quick-launcher` (right, far end): dropdown with "Open Terminal here" and "Toggle hidden files"; no theme entry.

## 6. Verification

- [x] 6.1 `npm run build` (tsc) and `npm run lint` clean.
- [x] 6.2 `cargo check` and `cargo clippy` clean.
- [x] 6.3 `openspec validate 2026-09-06-contextual-status-bar --strict` passes.
- [ ] 6.4 (richiede verifica manuale GUI) Manual: clock ticks, popover open/close, hidden toggle updates listing + count, search filters, trash preview and empty-with-confirm.
