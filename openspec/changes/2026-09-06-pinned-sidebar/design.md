# Design: Collapsible pinned sidebar

## Placement & layout

A vertical **Sidebar** to the left of the two panes, spanning under the toolbar down to the status bar:

```
toolbar
[ Sidebar | Panes(left|split|right) ]
status bar
```

Two visual states, persisted in `appConfig.sidebar.open`:
- **Expanded** (default): a column ~180–200 px showing a "Favourites/Preferiti" group (pinned items) + the fixed "Places" group (Home/Desktop/…). Row = label only (no icons — the user found icons unnecessary), hover shows an × to unpin.
- **Collapsed**: a thin **rail** (~28–34 px): just a re-expand button (▸) and, optionally, a small vertical count/label; NOT per-item icons. The rail is click-to-open and the toggle persists.

Toggle button (⌄/▸ or ☰) lives at the top of the sidebar (and in the toolbar); shortcut `⌘B`.

## Data model (appConfig)

```ts
appConfig.sidebar: { open: boolean; items: string[] }   // items = pinned absolute paths (files or folders), order = display order
```
- **Places** (Home, Desktop, Documents, …) stay a fixed group above the pinned list and are **not removable** (they're the existing preset menu). The **pinned list** is user-editable, files *and* folders.
- Add: sidebar "＋" → destination-style picker (reuse the `TransferPicker`'s browsing UI in a "pick a location" mode) → append path. Also **drop a file onto the sidebar** to pin it, and context-menu "Add to Sidebar…" for the active selection.
- Remove: × on hover or context-menu "Unpin"; dedupe on add; drop non-existent paths with a toast.
- Reorder: HTML5 drag within the pinned list (reuse the existing dnd pattern); persisted order.
- Cap items at a sane max (e.g. 30); overflow just scrolls.

## Interactions

- **Click a row** (pinned or Place) → navigate the **active pane** to it (folders) or **reveal/open** it (files) — same rules as the per-pane "Go to". Sets the sidebar as the source, so it stays in sync with `FilePane`'s Go-to menu (which now lists `appConfig.sidebar.items` + Places from a shared helper).
- **Drop a selection onto a row** → `transferBatch(paths, itemPath-if-folder, copy?)`; dropping onto a **file** pin targets its parent folder. Collapsed rail also accepts a drop to open + navigate.
- Right-click a pinned row → context menu: **Unpin**, **Show in Finder**, **Reveal**.

## Shared helper

`sidebarItems()` returns `{ places: [{label,path}], pinned: string[] }`. Both `Sidebar.tsx` and `FilePane`'s Go-to consume it → one source of truth, so the sidebar and per-pane menu can never drift.

## Responsive

Sidebar width fixed; when window is narrow the rail collapse is preferred. `splitPct` (pane split) still measured against the space *after* the sidebar.

## i18n & a18y

- Strings via `t()`: `sidebar.title`, `sidebar.favourites`, `sidebar.places`, `sidebar.add`, `sidebar.unpin`, `sidebar.expand`, `sidebar.collapse`, `sidebar.added`, `sidebar.dropped`… (en+it).
- Sidebar = `role="navigation"` with `aria-label`; toggle button `aria-expanded`; rows announce "pinned"/"place"; the collapsed rail is still focusable/toggleable by keyboard.

## Out of scope

- macOS Finder "Favorites" *serving* semantics, iCloud/drive mount special-casing, per-pane independent sidebars (there is exactly one shared sidebar), icon glyphs in the rail (explicitly declined).

## Testing

- Unit: `sidebarItems()` merge (Places + pinned, dedupe, order), add/remove/reorder on the persisted array, file-drop→parent resolution.
- Component (`Sidebar.test.tsx`): toggle persists; clicking a Place navigates active pane; drop onto row calls transfer; unpin removes.
- Guard: i18n coverage (new keys in en.json).
