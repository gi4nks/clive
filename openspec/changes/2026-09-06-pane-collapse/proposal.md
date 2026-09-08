# Proposal: Collapsible dual panes (rail mode)

## Why

The two file panes always occupy space even when you only need one, which is
wasteful on narrow windows. The sidebar already supports collapsing to a thin
rail; the user wants the same affordance for the dual panes so a pane can be
tucked away into a slim vertical rail and brought back on demand.

## What Changes

- Each pane (left/right) can **collapse into a thin rail** (`PaneRail`) that
  shows a chevron and the pane's folder name written vertically, and highlights
  when it's the active pane.
- Collapse state persists (`AppConfig.paneCollapsed: { left, right }`), default
  both expanded.
- **Invariant:** at least one pane stays expanded, and the **active pane is
  never collapsed**. Collapsing the active pane moves focus to the other;
  activating a collapsed pane (Tab / `⌘1` / `⌘2` / clicking its rail) re-expands
  it.
- The pane↔pane resize handle is shown only while **both** panes are expanded.
- Toggles: a chevron in each pane header, and `⌘\` for **single-pane focus**
  (collapse the inactive pane / expand it again). Mirrors `⌘B` for the sidebar.

## Impact

- New capability: `pane-collapse`.
- Affected code: `src/PaneRail.tsx` (new), `src/resize.ts` (`collapsePane`,
  `railLabel`), `src/settings/appConfig.ts`, `src/FilePane.tsx` (`onCollapse`),
  `src/App.tsx` (activate/collapse + layout), i18n `pane.collapse/expand/focus`.
