# Tasks: add-preview-panel

## 1. Rust byte command

- [x] 1.1 Test-first in `commands/filesystem.rs`: `read_file_bytes` rejects directories (`is-dir`), returns base64 of file content, fails `too-large` for > 32 MiB (metadata check, no read), errors propagate for missing/unreadable paths. Verify: `cargo test` red→green.
- [x] 1.2 Implement `read_file_bytes` (reuse `normalize()`), register in `main.rs`. Verify: `cargo test` green, `cargo clippy` clean.

## 2. Preview pipeline (frontend, pure logic)

- [x] 2.1 Test-first `preview.ts`: `previewKind(name)` maps extensions (image/video/audio/pdf/markdown/text incl. code-ish; unknown ⇒ `fallback`); `shouldUseBytes(kind)`; stale-token guard `newLoadToken()`. Verify: vitest green.
- [x] 2.2 Implement `preview.ts` + `usePreviewSelection(sel, entries)` loader: debounce 180 ms, blob cache single-slot with revoke, `read_text_file` line-cap 5000, `read_file_bytes` only for kinds in 2.1. Verify: vitest (mock commands, assert revoke-on-change and no-bytes for fallback).

## 3. PreviewPanel UI

- [x] 3.1 `PreviewPanel.tsx`: header (name, size, kind icon), body per kind (img/video/audio/iframe-pdf/pre-text/react-markdown), multi-select summary card, folder card (name, path, child count via existing command), fallback card with Quick Look (`quickLook`) + Open (`openPath`) buttons; loading skeleton and error state with retry. Verify: component tests with mocked api (image renders `<img src=blob:>`, zip shows fallback, large note path).
- [x] 3.2 Mount in `App.tsx` pane row (rightmost, `w-[22rem]`), fed by `panes[active]`; hidden when `!cfg.previewPanel`. Add ⌘⇧P shortcut handler + toolbar eye button (tooltip via existing pattern). Verify: app-level test toggling visibility.

## 4. Config, i18n, polish

- [x] 4.1 `appConfig`: `previewPanel: boolean` default false + normalizeConfig fallback; Settings → File toggle row; i18n `preview.*` + `settings.previewPanel` en/it parity (coverage test). Verify: appConfig + i18n tests green.
- [x] 4.2 Manual smoke (`tauri dev`): select image (shows), multi-select (summary), .zip (fallback + Quick Look), folder (metadata), 100 MB file (no bytes, note), toggle off/on + ⌘⇧P, restart keeps setting; document results.
- [x] 4.3 Full verify: `cargo test`, `npm run test`, `npm run lint`, `npx tsc -b`, `cargo tauri build`; report bundle path.
