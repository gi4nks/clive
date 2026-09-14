## Context

Tauri v2 + WKWebView, dual-pane shell (`App.tsx` flex row: Sidebar | panes | StatusBar). Quick Look already exists as `quick_look(path)` (`qlmanage -p`). `react-markdown` is a dependency (chat). No asset protocol today (deliberate — see proposal).

## Goals / Non-Goals

**Goals:** fast, side-effect-free preview of the active selection; minimal security surface; graceful for everything we can't render.
**Non-Goals:** streaming/seeking large media, editing in-panel, thumbnails in the list, preview for remote/SMB beyond the same byte path, syntax highlighting libraries (plain <pre> v1).

## Decisions

1. **Bytes via command, not asset protocol.** `read_file_bytes(path) -> String (base64)` in `commands/filesystem.rs`, reusing `normalize()`; errors: `is-dir`, `too-large` (> 32 MiB, checked via metadata before reading). Alternative rejected: `asset:protocol` (capability scope + CSP + `/Volumes/*` breadth) and custom localhost HTTP file route (another listening port, origin spoofing considerations).
2. **Frontend pipeline** `preview.ts`: given selection → `previewKind(name)` from extension map {image, video, audio, pdf, text, markdown, fallback}; load bytes (text reuses `read_text_file` for line-cap at 5000 lines) or `read_file_bytes` → `Blob` → `URL.createObjectURL` kept in a single-slot cache keyed by path; revoke on replace/unmount. Debounce 180 ms; ignore stale results via token counter.
3. **Layout**: `PreviewPanel` as flex child of the pane row with `w-[22rem] shrink-0 border-l`, only when `cfg.previewPanel && !paneCollapsed.right?`— independent of panes, rightmost before nothing (status bar is below). Pane wrappers keep existing flex so they just reclaim width.
4. **State source**: App passes `panes[active]` selection + entries to the panel (single prop object), so no global store; multi-select shows summary card with the "last-clicked" (`anchorPath` or last item of selection) previewed below.
5. **Toggle**: `previewPanel: boolean` in appConfig (normalizeConfig compat, default false); Settings → File Row toggle; toolbar icon (👁/eye svg) `title` tooltip; ⌘⇧P key handler next to existing ⌘-family.
6. **Folder preview**: name, path, size-free metadata (entry count via existing `childCount` command), Quick Look button.

## Risks / Trade-offs

- 32 MB base64 through IPC is heavy (~10 ms+ MBs): acceptable for photos/docs; big media gets fallback card instead — documented.
- HEIC decodable by WKWebView only when the OS codec allows; otherwise fallback card.
- Blob URL leak risk: single-slot cache + revoke in effect cleanup; unit test asserts revoke on change.
