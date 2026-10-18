# Repository Guidelines

## Project Structure

The repository root is the Clive Tauri application: Rust/Tauri code is under `src-tauri/`, and the React/TypeScript UI is under `frontend/`. Wise is pinned as a Git submodule at `vendor/wise` and consumed from that local path. Frontend tests sit beside their source files as `*.test.ts` or `*.test.tsx`. App icons and packaging assets are in `icons/` and `branding/`. Keep behavior aligned with `openspec/specs/`; proposal history is in `openspec/changes/archive/`.

## Build, Test, and Development

Run commands from the repository root:

- `make setup` initializes Wise and installs/builds both JavaScript packages.
- `make dev` starts the desktop app for development.
- `make build` creates a release bundle under `target/release/bundle/`.
- `make frontend-test` runs Vitest; `make frontend-check` runs Oxlint and Vite's type-check/build.
- `make frontend-coverage` and `make rust-coverage` run the respective suites with coverage; `make coverage` runs both. Frontend HTML is written to `frontend/coverage/`; Rust uses `xcrun llvm-cov` and stores reports under `target/coverage/rust/`.
- `cargo test` runs Rust tests; `cargo fmt --check` checks Rust formatting and `cargo clippy --all-targets` runs Clippy.

## Coding Style and Naming

Follow existing conventions: Rust modules and functions use `snake_case`; React components and TypeScript types use `PascalCase`; hooks and ordinary functions use `camelCase`. Name tests after the behavior or module they cover and colocate them with frontend source. Format Rust with `cargo fmt`; keep TypeScript consistent with nearby code and ensure Oxlint passes. Prefer focused changes that keep filesystem operations in the Rust/Tauri layer and UI state in the frontend.

## Testing Guidelines

Add or update focused tests for changed behavior. Frontend tests use Vitest, Testing Library, and jsdom; Rust tests use Cargo's test harness. Run the relevant suite plus frontend lint/build or Rust formatting/checks for the code changed. No repository-wide coverage threshold is configured.

## Commits and Pull Requests

Recent commits use concise Conventional Commit-style subjects such as `feat:`, `fix(trash):`, `chore(deps):`, and `docs:`; keep subjects specific and imperative. Pull requests should explain user-visible behavior and rationale, link related issues or OpenSpec changes, list validation commands and results, and include screenshots for UI changes. Call out macOS permissions or configuration changes explicitly.

## Security and Configuration

Never commit provider keys, personal paths, or machine-specific identifiers. Use the `CLIVE_` environment variable names documented in `README.md` and sanitized examples in `.env.example`. Keep file mutations behind explicit user confirmation and the existing undoable operation flow.

## Recent Changes

- Added a Conventional Commit-based SemVer release command (`make release-check`, `make release`) that updates all manifest versions, changelog, README badge, and annotated tag. Gitea remains canonical; publish a filtered snapshot and matching version tag to GitHub without `.gitea`.
- Renamed the visible sidebar label to Navigator (Navigatore in Italian), including pinning, sizing, and keyboard shortcut labels.
- Added a global AI switch in Settings that disables AI behavior and hides its buttons and context-menu actions throughout the interface. See `openspec/specs/ai-feature-toggle/spec.md`.
- Added an expanded preview mode: both file panes reduce to their path rails and the preview fills the remaining workspace; restoring the layout preserves each pane's prior collapsed state.
- Centralized the Apple Silicon DMG pipeline through `gitea-ci` v1.0.4; Clive retains its Wise submodule and `make setup`/`make build` commands while shared steps install the toolchain, verify the DMG, and upload the artifact.
- Flattened the Tauri app to the repository root, moved the Vite app to `frontend/`, and pinned `@gi4nks/wise` as a local `file:` dependency backed by the `vendor/wise` Git submodule. `make setup` initializes and builds the submodule before installing the frontend.
- Added read-only Get Info for one file or folder from the main toolbar and file context menu. Folder details report recursive file size and direct child count; symbolic links are not followed. ZIP members and multi-selections do not offer this action. See `openspec/specs/context-menu/spec.md` and `openspec/specs/fs-commands/spec.md`.
- Added Finder-compatible colored tags backed by macOS file metadata, bulk Edit Tags from the context menu and the always-visible Navigator, current-folder tag filtering, and an empty state. The Navigator prevents horizontal scrolling. Tag writes pass through Rust and honor mounted-volume and system-location guards. See `openspec/specs/file-tags/spec.md`.
- Suppressed the WebView's native context menu across the app so right-clicking blank areas no longer exposes Reload; Clive's supported context menus remain active. See `openspec/specs/context-menu/spec.md`.
- Routed chat and quick-action AI mutations through the Rust batch journal, added exclusive generated-file creation with content-checked undo, and removed the duplicate frontend executor and direct text-write command.
- Completed the app-shell P1 workflow split: `usePaneNavigation` owns per-pane back/forward history, `useTransferWorkflow` owns clipboard and transfers, and `usePreviewLayout` owns expanded-preview transitions; AI workflows remain in dedicated hooks.
- Split Rust filesystem behavior into capability modules (`path_safety`, `finder_tags`, `listing`, `metadata`, `macos`, `transfers`, `preview`, `desktop`, `tags`, `volumes`); Tauri handlers and internal callers now reference their owning modules directly. See `docs/plans/2026-10-18-p1-filesystem-capabilities.md`.
- Added a checked Tauri invoke contract: typed `TauriCommandMap` wrappers, a Rust registration/signature/DTO checker, and normalized command error objects. Build and frontend tests run the checker. See `docs/plans/2026-10-18-p1-tauri-contract.md`.
- Restored Clive-owned file icons and replaced bright rounded tiles with muted folder silhouettes and layered document artwork; removed the AppKit icon lookup and its Tauri command. See `openspec/specs/react-file-list/spec.md` and `docs/native-icon-loading-analysis.html`.
- Added Vitest V8 and Rust LLVM coverage collection, local HTML reports, and a measured baseline; no percentage gate is set yet. See `docs/test-coverage.md`.
- Enlarged card-mode icons to 76×76 px and replaced the repeated paper silhouette with distinct category artwork; filename-derived extension fallback now selects the correct artwork when Rust omits the extension (as seen with JPG/HTML/PDF entries); added regression coverage.
- Hardened M3 filesystem boundaries: recursive copy preserves symlinks without following cycles, rejects writes through disconnected mounts, and only disconnects listed mounted network volumes; added isolated Unicode, mount, symlink, and read-only tests.
- Completed M4 frontend workflow coverage: verified persisted pane preferences and app-level listing errors; per-pane request sequencing now ignores stale async directory responses and clears stale entries after a failed refresh.
- Added the M5 quality gate (`make quality`) to the Gitea pull request workflow, including strict Rust Clippy and both test suites; DMG packaging now runs a checksum, executable and ad-hoc signature verification before artifact upload. Local macOS smoke confirmed app launch and a real directory-list IPC call. See `docs/plans/2026-10-18-m5-tauri-smoke-quality-gates.md`.
- Completed M6 coverage gates: frontend and Rust now enforce separate 85% line floors, with no coverage exclusions. Added native-store/legacy-settings tests and isolated `df -kP` parsing tests; current lines are 85.53% frontend and 86.44% Rust. See `docs/test-coverage.md` and `docs/plans/2026-10-18-m6-coverage-gates.md`.
