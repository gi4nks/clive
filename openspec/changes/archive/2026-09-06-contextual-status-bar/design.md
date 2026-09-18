# Design: Contextual Status Bar

## Goal

Replace the static footer with a bottom dock built on a small widget registry. The dock has three zones and mixes persistent system widgets with actions that react to the current selection and folder.

## Widget registry (core abstraction)

The shell knows nothing about specific widgets. Each widget declares where and when it appears:

```ts
type Placement = 'left' | 'center' | 'right'

interface Widget {
  id: string
  placement: Placement
  order: number                       // ascending within a zone
  Component: React.FC<{ ctx: WidgetCtx }>
  visible?: (ctx: WidgetCtx) => boolean
}
```

`StatusBar` filters by `visible`, sorts by `order`, groups by `placement`, and renders. Adding a widget = adding one entry to `statusWidgets.tsx`; the shell is untouched.

## WidgetCtx (interface boundary)

A single, small context object is passed down (no provider needed):

```ts
interface WidgetCtx {
  // state
  currentPath: string
  entries: FileEntry[]
  selectedEntries: FileEntry[]
  clip: ClipboardInfo
  pasteInFlight: boolean
  hiddenVisible: boolean
  // actions
  navigate(path: string): void
  refresh(): void
  setHiddenVisible(v: boolean): void
  copyCut(op: 'copy' | 'move'): void
  paste(): void
  clearClipboard(): void
  emptyTrash(): Promise<void>
  openTerminalHere(): void
  setStatus(msg: string, kind: 'success' | 'error' | 'info'): void
  actionsFor(target: FileEntry | FileEntry[]): MenuItem[]   // shared with context menu
}
```

Keeping the surface explicit (state vs. actions) preserves testability: a widget can be mounted in isolation with a stub `ctx`.

## Zones & layout

- **Left:** element/selection count (`N elementi · M selezionati`) followed by `context-actions`.
- **Center:** `search-box`; `clipboard-chip` sits next to it only when relevant.
- **Right (fixed order):** `trash · disk · calendar-date · clock · quick-launcher`.

Zone sizing: left/right are intrinsic; center is `flex-1`. Below a width threshold, right-zone widgets collapse into a `⋯` overflow menu and the search box collapses to an expandable icon.

## Click semantics ("misto per tipo")

- **Direct action** (no panel): search focus, clipboard chip clear, launcher menu items, contextual command buttons.
- **Popover above the bar**: clock, calendar, disk, trash, and the contextual overflow `⋯`.
- The popover is a single reusable primitive; it closes on outside-click, Escape, and scroll — but ignores scroll events that originate inside the popover (so a long Trash list can be scrolled without closing).

## Single source of truth for actions

`context-actions` renders the same items produced by `actionsFor(...)`, which is the function the right-click `ContextMenu` already uses. The bar shows a compact subset inline; if the subset overflows, the `⋯` opens the full `ContextMenu` anchored to the button. There is no second, hand-maintained copy of the action list.

## Keyboard focus model

The global shortcut handler already ignores `INPUT`/`TEXTAREA`. The refinement: list-scoped keys (`ArrowUp/Down`, `Space` → Quick Look, `Enter`, `Delete/Backspace`) fire only when the active element is `document.body` or the file list container, never when a status-bar control has focus. This prevents `Space` from simultaneously activating a focused bar button and triggering Quick Look. `Escape` closes any open popover/menu and blurs the active control.

## Timer isolation

The clock (and any other ticking widget) owns its state locally and re-renders only itself. No tick state is lifted into `App`, so the file list is never re-rendered by a clock second. Disk and Trash data are fetched lazily (on popover open) and/or cached (~30s), never on a tight loop.

## Backend surface

- `list_dir(path, showHidden?)` — additive optional flag; default `false` preserves current behavior.
- `disk_space(path)` — parses `df -kP <path>` (POSIX guarantees one line per mount, so paths with spaces/long device names do not wrap).
- `open_terminal(path)` — `open -a Terminal "<path>"`.
- `empty_trash()` — Finder via `osascript`; the only destructive backend action, therefore gated by a confirmation modal on the UI side.
- Trash count/preview reuses `list_dir(~/.Trash, showHidden=true)` — no dedicated command.

## Non-goals (v1)

- Calendar events (EventKit) — date/time only.
- User-facing widget reordering or show/hide toggles.
- Drag-and-drop into the dock / Trash from the dock.
- Recursive or cross-folder search.
- Cross-platform (Windows/Linux) behavior.

## Testing strategy

- Unit tests for `actionsFor` output given 0/1/N selections and folder-vs-file targets.
- Unit tests for the search predicate (case-insensitive substring) and byte-formatting.
- Component tests per widget mounting with a stub `WidgetCtx`; Tauri invocations mocked at `src/api.ts`.
- Manual verification for ticking, popover open/close/scroll rules, hidden toggle propagation, and Trash empty-with-confirmation.
