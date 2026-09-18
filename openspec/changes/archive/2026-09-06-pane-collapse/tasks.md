# Tasks: pane-collapse

## 1. State + helpers
- [x] 1.1 `AppConfig.paneCollapsed { left,right }` default both false, coerced in `normalizeConfig`
- [x] 1.2 `resize.ts`: pure `collapsePane(prev,target)` (never both collapsed; expand always) + `railLabel(path,home)`
- [x] 1.3 `resize.test.ts`: collapsePane (3) + railLabel (4)

## 2. UI
- [x] 2.1 `PaneRail.tsx`: `w-9` rail, chevron ▸/◂, vertical basename, active highlight, click/Enter expands (theme-adaptive colors)
- [x] 2.2 `PaneRail.test.tsx` (basename + "Home", expand-on-click)
- [x] 2.3 `FilePane`: optional `onCollapse(id)` → header chevron button (`pane.collapse`)
- [x] 2.4 `App`: render rail vs pane, center resize handle only when both expanded

## 3. Behavior
- [x] 3.1 `activatePane(id)` expands-if-collapsed (used by `⌘1`/`⌘2`, Tab, rail click, FilePane activate)
- [x] 3.2 `toggleCollapse(id)` moves active away when collapsing the active pane
- [x] 3.3 `⌘\` = focus (collapse/expand inactive pane)
- [x] 3.4 `sendToOtherPane` expands the target first
- [x] 3.5 startup guard: never begin with the active pane collapsed

## 4. i18n + verify
- [x] 4.1 `pane.collapse/expand/focus` in en+it (merged into existing `pane` block)
- [x] 4.2 build + lint + `test` (121) + `cargo tauri dev` + `openspec validate --strict`
- [ ] 4.3 Manual: collapse/expand via chevron, `⌘\` focus, Tab reopens, persistence across restart
