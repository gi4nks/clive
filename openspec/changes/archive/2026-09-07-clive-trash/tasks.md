# Tasks: clive-trash

## 1. Backend (recycle bin + journal)
- [x] 1.1 `commands/trash.rs`: `delete_to_trash` (guard + move to slot + journal), `trash_list`, `trash_restore`, `trash_delete_forever`, `trash_empty`
- [x] 1.2 atomic 0600 journal (`~/.clive/trash/journal.json`); stale-slot pruning on list
- [x] 1.3 restore never clobbers (`name (restored N)`), recreates parents
- [x] 1.4 `filesystem.rs`: remove old `delete_to_trash`, expose `normalize`/`protected_err`
- [x] 1.5 `main.rs` register; `Cargo.toml` drop `trash` dep

## 2. Frontend
- [x] 2.1 `api.ts`: `TrashItem` + `trashList/Restore/DeleteForever/Empty`
- [x] 2.2 `TrashWidget`: uses `trashList`; inline per-item context menu (right-click / row) → Restore · Open · Reveal · Copy path · Delete immediately; Empty → `trash_empty`
- [x] 2.3 i18n `trash.*` en+it

## 3. Tests
- [x] 3.1 Rust: journal roundtrip, restore collision (file + no-ext dir), unique slot, **delete→list→restore→delete-forever roundtrip** (temp dir)
- [x] 3.2 TS: `widgets.trash.test.tsx` (list by basename, right-click menu, Restore calls API)
- [x] 3.3 build + test + lint + `cargo test`/clippy + `make build` + `openspec validate --strict`
- [ ] 3.4 Manual: delete a file, open Trash popover, right-click → Restore returns it to place; Delete immediately purges
