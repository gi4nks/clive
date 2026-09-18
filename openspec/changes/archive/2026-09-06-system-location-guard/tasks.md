# Tasks: system-location-guard

## 1. Pure predicate (mirror TS + Rust)
- [x] 1.1 `src/systemGuard.ts`: `PROTECTED_ROOTS`, `normalizeForGuard`, `isProtectedPath`, `blockDestructive`
- [x] 1.2 Rust `filesystem.rs`: `lexical_lower`, `is_protected`, `protected_err`, `guard_move_sources`

## 2. Authoritative backend enforcement
- [x] 2.1 `rename` / `delete_to_trash` / `move_file`: `allow_system` param + protected → `Err` before FS
- [x] 2.2 `transfer_items` (move): `guard_move_sources` pre-check over whole batch (atomic)
- [x] 2.3 `paste_paths` (clipboard move): `guard_move_sources` before any op

## 3. Frontend wiring
- [x] 3.1 `api.ts`: pass `allowSystem = !guardSystemLocations` on the 5 commands
- [x] 3.2 `appConfig`: `guardSystemLocations` default true + safe coercion (import/merge)
- [x] 3.3 `App.tsx`: context menu disables Rename/Move-to/Trash when `blockDestructive`, "system" hint

## 4. Settings + i18n
- [x] 4.1 SettingsModal: toggle + off-confirm
- [x] 4.2 `settings.guardSystem` / `guardSystemOffConfirm` / `menu.systemTag` in en+it

## 5. Tests
- [x] 5.1 `systemGuard.test.ts` (24): roots, `/System` recursion, children editable, case, `..` anti-bypass, `blockDestructive`
- [x] 5.2 Rust `#[cfg(test)]` (6): predicate + deny-before-touching-FS
- [x] 5.3 build + lint + `test` + `cargo test` + `clippy` + `openspec validate --strict`
- [ ] 5.4 Manual: right-click `/Applications` shows gated (disabled) Rename/Trash; toggle off → allowed; trash on `/System` refused
