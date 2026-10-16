# Repository Guidelines

## Project Structure

The repository root is the Clive Tauri application: Rust/Tauri code is under `src-tauri/`, and the React/TypeScript UI is under `frontend/`. Wise is pinned as a Git submodule at `vendor/wise` and consumed from that local path. Frontend tests sit beside their source files as `*.test.ts` or `*.test.tsx`. App icons and packaging assets are in `icons/` and `branding/`. Keep behavior aligned with `openspec/specs/`; proposal history is in `openspec/changes/archive/`.

## Build, Test, and Development

Run commands from the repository root:

- `make setup` initializes Wise and installs/builds both JavaScript packages.
- `make dev` starts the desktop app for development.
- `make build` creates a release bundle under `target/release/bundle/`.
- `make frontend-test` runs Vitest; `make frontend-check` runs Oxlint and Vite's type-check/build.
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

- Added a global AI switch in Settings that disables AI behavior and hides its buttons and context-menu actions throughout the interface. See `openspec/specs/ai-feature-toggle/spec.md`.
- Added an expanded preview mode: both file panes reduce to their path rails and the preview fills the remaining workspace; restoring the layout preserves each pane's prior collapsed state.
- Centralized the Apple Silicon DMG pipeline through `gitea-ci` v1.0.4; Clive retains its Wise submodule and `make setup`/`make build` commands while shared steps install the toolchain, verify the DMG, and upload the artifact.
- Flattened the Tauri app to the repository root, moved the Vite app to `frontend/`, and pinned `@gi4nks/wise` as a local `file:` dependency backed by the `vendor/wise` Git submodule. `make setup` initializes and builds the submodule before installing the frontend.
- Added read-only Get Info for one file or folder from the main toolbar and file context menu. Folder details report recursive file size and direct child count; symbolic links are not followed. ZIP members and multi-selections do not offer this action. See `openspec/specs/context-menu/spec.md` and `openspec/specs/fs-commands/spec.md`.
- Added Finder-compatible colored tags backed by macOS file metadata, bulk Edit Tags from the context menu and the always-visible sidebar, current-folder tag filtering, and an empty state. The sidebar prevents horizontal scrolling. Tag writes pass through Rust and honor mounted-volume and system-location guards. See `openspec/specs/file-tags/spec.md`.
- Suppressed the WebView's native context menu across the app so right-clicking blank areas no longer exposes Reload; Clive's supported context menus remain active. See `openspec/specs/context-menu/spec.md`.
