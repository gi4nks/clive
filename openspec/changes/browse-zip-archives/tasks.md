# Tasks: browse-zip-archives

## 1. Rust backend

- [x] 1.1 Add `zip = { version = "2", default-features = false, features = ["deflate"] }` to Cargo.toml; create `src-tauri/src/commands/archives.rs` with `zip_list` (FileEntry-like JSON, cap 10k entries + `truncated` flag), test-first fixtures (built in-test with the zip writer): normal listing, directory entries, empty zip. Verify: `cargo test archives` green.
- [x] 1.2 `zip_read(path, inner, max 16MiB)` → base64, errors `encrypted`/`corrupt`/`not-found`; test: read known member, missing member, size cap. Verify: `cargo test archives`.
- [x] 1.3 `zip_extract(path, dest, entries?)`: canonical dest check, reject `..`/absolute member names (`zip-slip:<name>`), skip symlink entries (reported), create parents, return `{extracted, skipped[]}`; test: happy path + zip-slip fixture + symlink fixture. Register commands in main.rs. Verify: `cargo test`.

## 2. Pseudo-path layer (frontend)

- [x] 2.1 Test-first `src/archivePath.ts`: `isArchivePath`, `splitArchivePath`, `joinArchivePath`, `archiveParent`, `archiveBasename`; round-trip and edge cases (`!/` first segment, nested dirs). Verify: `archivePath.test.ts` green.
- [x] 2.2 `api.ts`: `zipList`/`zipRead`/`zipExtract` wrappers + `ArchiveEntry` type; `usePaneSession`/fetch path: when `isArchivePath(p)` use `zipList` and synthesize entries with `path = joinArchivePath(...)`. Verify: existing pane tests + new branch test.

## 3. Read-only guards

- [x] 3.1 `assertWritable(path): boolean` + centralized gating in App: toolbar buttons (rename/trash/copy/cut/paste/newFolder/terminal), keyboard (⌘C/X/V, ⌫, F2, ⌘N), `actionsFor` items — disabled/no-op + localized status `archive.readOnly`. Transfer: `dropIntoPane`/`dropToDir` reject when target or payload path is an archive path; Sidebar `onOpenItem` refuses pinning archive paths. Verify: vitest for each gate.
- [x] 3.2 Open/QL/preview: FilePane `onOpen` for inner file ⇒ `zip_extract` to `temp/clive-zip/<rand>/` then `openPath`; PreviewPanel/usePreview: archive path ⇒ bytes via `zipRead` (kind detection on inner name); StatusBar/DiskWidget use the real archive file for disk space. Reveal-in-Finder targets the `.zip` itself. Verify: component tests with mocks.

## 4. UI integration (all strings via `archive.*` i18n en+it)

- [x] 4.1 FilePane breadcrumb split at `!/`: real crumbs, clickable `.zip` crumb, `›` separator, inner crumbs; pane-header `archive.badge`. Sidebar pin guard message. FileIcon: distinct zip/archive icon. Verify: FilePane.breadcrumb test + visual smoke.
- [x] 4.2 Context menus: on `.zip` → Enter / `extractAll` / `extractTo…` (folder input dialog like Remote add) / native QL; inside archive → `extractHere` / `extractTo…` / preview / QL (temp), multi → `extractSelected`. Listing error (`encrypted`/`corrupt`) shows localized error row instead of empty list. Verify: menu tests + parity test for keys.
- [x] 4.3 i18n: full `archive.*` set in `en.json`/`it.json`; run coverage/parity guard test.

## 5. Verify & release

- [x] 5.1 `cargo test` + `npm run test` + `npm run lint` + `npx tsc -b` all green; `git diff --check`.
- [x] 5.2 Manual smoke (`tauri dev` + real zips): enter zip, preview img/md, double-click opens in temp app, extract here/to, zip-slip fixture rejected, encrypted error, language switch inside archive, no drag in/out, ⌘↑ exits. Document results in this file.

### Smoke results (5.2, debug build su macOS reale)
- `zip_list/zip_read/zip_extract` su `clive-smoke.zip` → `notes`, `img.png`; read == "hello from archive"; extract 2/2 su /tmp (poi rimossi)
- Pseudo-path digitato in ⌘L naviga dentro lo zip; badge "Archivio" visibile
- Clic su img.png interno → PreviewPanel mostra <img> via zip_read
- Guard sola-lettura e zip-slip coperti da test unit (Rust) e gating UI
