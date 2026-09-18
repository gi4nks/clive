# Tasks: Dual-pane navigation

> Stage 1 (transfer engine + Copy/Move-to) and Stage 2 (two-pane, active-pane, per-pane Go-to, in-app drag incl. breadcrumb/Go-to drop, batch Rust command, component+dnd tests) are **implemented**. Open items: 7.5 manual acceptance, 1.2 per-pane view/sort (v1 shares global view/sort), 6.2 full a11y announcements.

## 1. Panes model & state

- [x] 1.1 `PaneState`/`PaneId`, `panes` + `active` + `splitPct`; seed left=home, right=parent (from legacy config on init)
- [~] 1.2 Split persisted to `fm.split`; pane paths persist via existing `fm` recents/home (per-pane view/sort intentionally shared via global `cfg` in v1)
- [x] 1.3 `FilePane.tsx` (own path/selection/query + renders `FileList`); two panes + draggable splitter in `App`
- [x] 1.4 Active-pane model: pointer-down activates; `Tab` / `⌘1` / `⌘2` switch; `⌥⌘←` swaps panes; ring on active

## 2. Per-pane "Go to…" (sidebar retirement)

- [x] 2.1 Breadcrumb ⌄ per pane: Places, global Recents, Parent
- [~] 2.2 Fixed left `aside` removed; Places live in each pane's Go-to (inlined, not the old `Places` component); "swap" is a shortcut, not yet a menu row
- [x] 2.3 Per-pane `onNavigate`; Recents stay global

## 3. Drag to transfer (in-app, v1)

- [x] 3.1 Rows `draggable`; dragstart carries the pane selection (or the single row) as JSON
- [x] 3.2 Other pane is the drop zone; same-pane drop is ignored (all sources already in dst)
- [x] 3.3 Drop = Move, ⌥ = Copy; `planTransfer`+`runTransfer` with `uniqueName` collisions; failures reported
- [x] 3.4 Both panes refreshed after transfer; result via status toast

## 4. Commands without dragging

- [x] 4.1 "Copy to…" / "Move to…" in the file context menu
- [x] 4.2 `TransferPicker` destination modal (current + Places + Recents + custom)
- [x] 4.3 `⌘⇧O` sends active selection to the other pane (⌥ = copy)
- [x] 4.4 Drop onto a breadcrumb segment / Go-to item targets that folder (`FilePane.onDropToDir` → `transferBatch`)

## 5. Backend convenience

- [x] 5.1 Batch Rust `transfer_items(paths, dstDir, mode)` (server-side unique naming) — one round-trip; `transferBatch` falls back to per-op loop when unavailable (tests)
- [x] 5.2 `uniqueName` reused client-side in `transfer.ts` for unique destinations

## 6. i18n & a11y

- [x] 6.1 All new strings via `t()` (`pane.*`, `transfer.*`, `menu.copyTo/moveTo`) in en+it; coverage guard green
- [~] 6.2 Panes are `role=region` with `aria-label` + `aria-current`; drop validity not announced (drag has no keyboard path)
- [x] 6.3 i18n coverage guard scans the new files (passes)

## 7. Verification

- [x] 7.1 Unit: `planTransfer` (dedupe/existing/batch/root) + `runTransfer` (copy/move/failure) — 56/56 tests
- [x] 7.2 Component tests: `FilePane.test.tsx` — activate, per-pane row routing, Go-to navigate, breadcrumb navigate
- [x] 7.3 Drag/drop tests: pane-body drop → `onDropTransfer`, Go-to drop → `onDropToDir`; `transferBatch` batch+fallback unit tests
- [x] 7.4 `npm run build` ✓ · lint (2 advisory React-Compiler ref warnings, non-blocking, oxlint exit 0) · `test` 65/65 ✓ · `cargo check`/`clippy` ✓ · `openspec validate --strict` ✓ · app boots
- [ ] 7.5 Manual acceptance: drag A→B move, ⌥ copy, `⌘⇧O`, Go-to, splitter persists
