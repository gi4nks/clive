# Proposal: Collapsible pinned sidebar

## Why

The dual-pane change retired the always-on left sidebar into per-pane "Go to…" menus. That freed space but removed the persistent, scannable list of favourite locations Finder users rely on. The user wants the sidebar **back** — but better: **pinnable** (add/remove files *and* folders), and **collapsible** to a thin vertical rail so it costs space only when wanted.

## What Changes

- Re-introduce a **left sidebar** that lists **pinned locations** (folders *and* files), separate from the always-present system Places.
- Make it **collapsible**: expanded shows names; collapsed shows a thin vertical **rail** (not icons) with an affordance to re-expand. Toggle via a button and `⌘S`-free shortcut (`⌘B`); open/closed state persists.
- **Add** a pin (⌄ / "Add to Sidebar…", or drop onto the sidebar) and **remove** (context menu "Unpin", or × on hover). Pinned items are persisted; system Places stay non-removable.
- **Reorder** pinned items (drag within sidebar).
- Clicking a sidebar entry navigates the **active pane**; a pinned item doubles as a **drop target** (transfer selection into it), reusing `transferBatch`.
- Per-pane "Go to…" stays and now lists the same pinned set (single source of truth).

## Capabilities

### New Capabilities

- `pinned-sidebar`: a collapsible/pinnable left sidebar of favourite locations (files + folders), its add/remove/reorder/persistence, active-pane navigation, drop-target behaviour, and rail-when-collapsed presentation.

### Modified Capabilities

- `ui-i18n`: adds localized strings for the sidebar (title, rail toggle, add/remove, unpin). 
- `dual-pane-navigation`: the fixed sidebar returns, but as a **collapsible, editable, rail-collapse** panel driving the active pane (supersedes the earlier "sidebar removed" note); per-pane "Go to…" reuses the same pinned set.

## Impact

- **Frontend**: new `Sidebar.tsx` (list + rail mode + add/remove/reorder); `App.tsx` renders it left of the panes, tracks `sidebarOpen` (persisted `fm.sidebar.open`) and pinned items; `FilePane` "Go to…" reads the same pinned list; context menu + a "＋ Add to Sidebar…" affordance; `appConfig` gains `sidebar: { open, items: string[] }`.
- **Reuses**: `transferBatch`/drop handlers, `Places` presets, i18n layer, `useAppConfig` for persistence.
- **Non-breaking**: panes and drag behaviour unchanged; sidebar is additive chrome.
- **No Rust change** (pinned list + collapse are UI config in `settings.json`).
