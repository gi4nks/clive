# Changelog

All notable changes to Clive are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows SemVer, with the version defined once in `tauri.conf.json` (build.rs enforces Cargo/package parity). Releases are tagged `vX.Y.Z` (annotated).

## [Unreleased]
### Added
- Semantic release command derives major, minor, or patch versions from Conventional Commits and updates all manifests together
### Changed
- Renamed the visible sidebar label and related actions to Navigator (Navigatore in Italian)

## [1.1.2] - 2026-10-16
### Added
- AI master switch in Settings to hide and disable AI actions across Clive
- Finder-compatible colored tags, bulk editing, and sidebar filtering
### Changed
- Suppressed the WebView native context menu while preserving Clive's supported menus

## [1.1.1] - 2026-10-11
### Added
- Expandable preview mode that preserves the saved collapsed state of each file pane when restoring the layout

## [1.1.0] - 2026-09-14
### Added
- Portable AI providers: dynamic gateway registry (`CLIVE_PROVIDER_<ID>_*`), add/edit/remove in Settings (master-detail), auto-selected defaults
- Mounted volumes: `list_volumes` (Finder-like internal disk usage), safe `eject_volume`, sidebar section + status-bar list
- In-app preview panel (images/video/audio/PDF/markdown/text/folder + Quick Look fallback; `read_file_bytes`, ⌘⇧P)
- Rename with pattern (`{n}`, `{name}`, `{date…}`, regex find/replace) with review table and journal undo
- Native-macos look: vibrant transparent window, overlay titlebar with drag, Finder-style rows/selection, sheet modals
- Sidebar context menus for volumes/remotes; in-app confirm dialogs (window.confirm never fires in WKWebView)
- Settings "About": version, build time, git commit/branch; CHANGELOG + build-time version-consistency gate
### Fixed
- Dual-pane rows/columns not reflowing on split (fit + nowrap + 320px pane guard)
- Capabilities never loaded (wrong dir) — ACLs like `start-dragging` silently denied

## [1.0.0]
- Initial release: dual-pane file manager, AI actions (rename/organize/summarize/chat/plan), trash, transfers, pinned sidebar, i18n (en/it)
