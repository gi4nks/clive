# Changelog

All notable changes to Clive are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows SemVer, with the version defined once in `tauri.conf.json` (build.rs enforces Cargo/package parity). Releases are tagged `vX.Y.Z` (annotated).

## [Unreleased]

## [1.3.0] - 2026-11-01
### Added
- Provider-specific model selection in **Settings → AI**, refreshing model catalogs directly from the gateway with load-state and capability metadata
- Concurrent bounded gateway probes (`/healthz` and `/v1/models`), 12 MB vision request limits, LAN/private-IP local provider classification, and server-side cloud opt-in enforcement (`x-clive-cloud-allowed`)
- Multimodal base64 image attachments (`ImagePart`) in AI Chat and Summarize when the selected model supports vision
- Per-card **Undo** on applied Chat actions, synchronized with the global undo journal, plus AI Activity Center logging for Quick Actions
- Tactile macOS file/folder artwork in `FileIcon` with card-mode format/language pill badges (`TS`, `RS`, `PY`, `JSON`, `PDF`, `MD`, `ZIP`, `DMG`, etc.) and a unified `16×16` inline stroke icon set (`UiIcons`) across the Navigator, pane rails, preview, and AI drawers
- Refreshed macOS Dock application icon (`branding/clive-icon.svg` and bundled icon sizes)
- Separate 85% line-coverage quality gates (`make quality`) for both the Rust and frontend test suites, typed Tauri IPC contract verification, and public `LICENSE` (MIT), `CONTRIBUTING.md`, and `docs/RELEASING.md`

### Changed
- Grid view file cards now float directly on a clean selection surface without an inner solid grey tile frame
- Bounded AI chat context and output budgets to the active model's resolved context window, prioritizing complete directory listings for compact local models

### Fixed
- Resolved 1,024-token context and output starvation when OpenAI-compatible `/v1/models` endpoints omit `context_length`
- Stripped `<think>...</think>` reasoning blocks and localized Quick Action prompts via resilient streaming-first extraction
- Exposed `x-clive-*` diagnostic headers across CORS for WebKit and fixed the **Use as default** button state in **Settings → AI**
- Hardened recursive copy, symlink cycle safety, and mounted network-volume disconnect checks

## [1.2.1] - 2026-10-16
### Fixed
- Ad-hoc sign the GitHub macOS app bundle and verify its signature and DMG during CI

## [1.2.0] - 2026-10-16
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
