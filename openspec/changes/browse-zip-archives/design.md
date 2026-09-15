## Context

Panes today resolve paths through `listDir`/transfer/rename against the real FS. The UI (FileList, FilePane breadcrumbs, Sidebar pins, StatusBar widgets, PreviewPanel, ContextMenu) is uniformly real-path. Quick Look/open already delegate to macOS (`quick_look`, `open_path`). See proposal.md - Why.

## Goals / Non-Goals

**Goals:** browse/preview/extract `.zip` read-only with zero surprises; small, isolated surface (one new Rust module, one pseudo-path codec); UI consistently localized.
**Non-Goals:** writing to archives, formats beyond `.zip`, password support, virtual FS below the pane layer (transfers/rename/undo keep operating on real paths only).

## Decisions

1. **Pseudo-path codec in one place** — `src/archivePath.ts`: `isArchivePath(p)`, `split(p) -> {archive, inner}`, `join(archive, inner)`, `parent(p)`, `basename(p)`. Separator `!/` is invalid on real macOS paths, so no ambiguity. All pane logic branches on `isArchivePath`.
2. **Rust `commands/archives.rs` with crate `zip` (read-only)** — `zip_list`, `zip_read(max 16 MiB)`, `zip_extract(dest, entries?)`. Security: canonicalize dest; each member name must be relative, no `..`, no absolute, resolve under dest; symlink-flagged entries skipped and reported. Errors are stable strings (`encrypted`, `corrupt`, `zip-slip:<name>`) mapped to i18n by the frontend.
3. **Pane data layer** — `usePaneSession` fetch branch: archive path ⇒ `zip_list` → synthesize `FileEntry` items (`path = join(archive, name)`, `isDir`, size, modified). Everything downstream (sort, search, selection, FileList) unchanged because entries look normal.
4. **Guarding mutations** — central `assertWritable(path)` helper used by toolbar buttons/keyboard/menu handlers: inside archives, actions no-op with a localized status message (single choke point rather than scattered conditionals). `openPaneFile`: inner file ⇒ `zip_extract` to temp dir + `openPath`; preview loader: inner ⇒ `zip_read`.
5. **Breadcrumb & badge** — FilePane splits at `!/`: crumbs before are real (clickable), archive crumb + `›` + inner crumbs; pane header shows `archive.badge` when inside. Sidebar `onOpenItem` refuses pinning archive paths (status msg). Transfers/drops check `isArchivePath(target/zip row)` and refuse.
6. **i18n** — everything under a new `archive.*` namespace (en/it in the same commit, coverage test enforces).
7. **Dependency** — `zip = { version = "2", default-features = false, features = ["deflate"] }` keeps the binary lean; no `unzip`/`ditto` shell-outs (error handling in shell is untyped; we already learned that with `df`).

## Risks / Trade-offs

- Large archives listing slowly → cap at 10k entries with a "truncated, extract to browse" notice.
- Temp extraction for open/QL duplicates bytes on disk → use `std::env::temp_dir()/clive-zip/`, best-effort cleanup on pane unload.
- Pseudo-paths leaking into a real-path API (transfer/rename) → codec is the only constructor; runtime guard in `assertWritable` + transfer refusal; tests cover round-trips.
