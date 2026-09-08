# Design: Dual-pane navigation

## Layout

The content area becomes two equal panes with a draggable vertical splitter between them:

```
[ toolbar (acts on active pane) ]
[ Pane A  | splitter | Pane B ]
[ status bar (reflects active pane) ]
```

- Each `FilePane` owns: its `path`, `selection`, `view` (list/grid), `sort`, and `searchQuery`. (search can be per-pane; global search later.)
- A single **active pane** (left|right) receives keyboard nav and toolbar/AI actions; shown with a focus ring on its breadcrumb. Clicking any pane sets it active; `Tab` toggles, `⌘1`/`⌘2` select, `⌥⌘←` swaps the two panes' paths.
- **Default on first open**: left = last current folder, right = parent. Persisted per session in `fm.panes`.

## Per-pane "Go to…" (replaces the fixed sidebar)

Each pane's breadcrumb has a ⌄ menu (daisy `dropdown`):
- **Places**: Home, Desktop, Documents, Downloads, Pictures, Music (same presets `Places` used).
- **Recents**: global recent list (shared between panes), so a folder can be recalled in either side.
- **Parent** / **swap to other pane's path** shortcuts.
The always-on `aside` sidebar is removed; the Places/Recents UX now lives here, per-pane, so no pane is "wasted".

## Drag to transfer (in-app only, v1)

Using HTML5 drag-and-drop inside the webview (no native Tauri dnd plugin):
- Drag a non-empty selection from a pane → `draggable` rows carry the selected `paths` (dataTransfer JSON).
- Dragging over the *other* pane's list/folder cells shows a drop highlight; other cells of the *same* pane are **not** valid drop targets.
- On drop into the other pane's current directory:
  - default = **Move** the sources there,
  - **⌥ held during drop = Copy** instead.
- Apply with the existing batch path: `move_file`/`copy_file` (or a batch command), **unique-dest** on collision (the `paste_paths` `make_unique_dst` behaviour), then refresh both panes. Failures are collected and reported via a status toast; a `undo` is a **non-goal for v1** (moves are destructive, kept simple).
- Same-pane drop is ignored (reorder is out of scope).

## Commands without dragging

- **Copy to… / Move to…** in the context menu (and in the status-bar context-actions): shows a folder picker — a compact modal that lists the *other* pane's current dir + Places + Recents + a path field — then applies copy/move of the selection to the chosen dir.
- **⌘⇧O** = send the active pane's selection to the other pane's current dir (Move; with ⌥ = Copy). The most common "I'm looking at both already" case, no drag needed.
- Drop on a **breadcrumb** or a **"Go to…" item** targets exactly that folder.

## Reuse & invariants

- `validateNewName`/`uniqueName` (from `ai/safety.ts`) reused for destination de-duping so transfers never clobber.
- Every transfer is applied after a **re-check** that sources still exist (poller safety), mirroring `applyPlan`'s re-validation.
- AI + status + context actions now resolve against `panes[activePane].selection`, not a single global selection.

## State & migration

```ts
interface PaneState { path: string; selection: string[]; view: View; sort: Sort; query: string }
type Active = 'left' | 'right'
panes: { left: PaneState; right: PaneState }
active: Active
splitRatio: number   // persisted fm.split.ratio
```
On first load with only a legacy `currentPath`, seed left=currentPath, right=parent, active=left.

## i18n & a11y

- All new labels go through `t()` (copy/move to, go to, parent, swap, drop hints), en+it.
- Panes expose `aria-label`/role; active pane announced; drag targets announce drop validity; drop keyboard equivalent is the ⌘⇧O / "Copy to…" commands (drag has no keyboard-only path, matching macOS conventions).

## Out of scope (v1)

- Native Finder↔app drag, folder-tree view, cross-pane multi-select box, undo of transfers, column/Miller view, tab groups.

## Testing

- Unit: `getTransferOp(alt, move)` copy/move decision, destination de-dup via `uniqueName`, path swap, drop-target validation (other-pane only).
- Component: two panes render independently; ⌘1/⌘2 change active; "Copy to…" picker writes correct paths.
- Drag: simulate drop → assert `move_file`/`copy_file` invoked with unique dest and both panes refresh; same-pane drop ignored.
- Manual: drag A→B move; ⌥ copy; `⌘⇧O` to other pane; go-to.
