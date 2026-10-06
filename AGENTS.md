# Repository Guidelines

## Project Structure

The repository root contains product documentation and the canonical OpenSpec specifications. The application lives in `clive/`: Rust/Tauri code is under `clive/src-tauri/`, and the React/TypeScript UI is under `clive/src/frontend/vite-project/`. Frontend tests sit beside their source files as `*.test.ts` or `*.test.tsx`. App icons and packaging assets are in `clive/icons/` and `clive/branding/`. Keep behavior aligned with `openspec/specs/`; proposal history is in `openspec/changes/archive/`.

## Build, Test, and Development

Run commands from the repository root unless noted:

- `cd clive && cargo tauri dev` starts the desktop app for development.
- `cd clive && cargo tauri build` creates a release bundle under `clive/target/release/bundle/`.
- `cd clive/src/frontend/vite-project && npm ci` installs pinned frontend dependencies.
- `cd clive/src/frontend/vite-project && npm test` runs Vitest once; `npm run lint` runs Oxlint; `npm run build` type-checks and builds with Vite.
- `cd clive && cargo test` runs Rust tests; `cargo fmt --check` checks Rust formatting and `cargo clippy --all-targets` runs Clippy.

## Coding Style and Naming

Follow existing conventions: Rust modules and functions use `snake_case`; React components and TypeScript types use `PascalCase`; hooks and ordinary functions use `camelCase`. Name tests after the behavior or module they cover and colocate them with frontend source. Format Rust with `cargo fmt`; keep TypeScript consistent with nearby code and ensure Oxlint passes. Prefer focused changes that keep filesystem operations in the Rust/Tauri layer and UI state in the frontend.

## Testing Guidelines

Add or update focused tests for changed behavior. Frontend tests use Vitest, Testing Library, and jsdom; Rust tests use Cargo's test harness. Run the relevant suite plus frontend lint/build or Rust formatting/checks for the code changed. No repository-wide coverage threshold is configured.

## Commits and Pull Requests

Recent commits use concise Conventional Commit-style subjects such as `feat:`, `fix(trash):`, `chore(deps):`, and `docs:`; keep subjects specific and imperative. Pull requests should explain user-visible behavior and rationale, link related issues or OpenSpec changes, list validation commands and results, and include screenshots for UI changes. Call out macOS permissions or configuration changes explicitly.

## Security and Configuration

Never commit provider keys, personal paths, or machine-specific identifiers. Use the `CLIVE_` environment variable names documented in `README.md` and sanitized examples in `.env.example`. Keep file mutations behind explicit user confirmation and the existing undoable operation flow.

## Recent Changes

- Added read-only Get Info for one file or folder from the main toolbar and file context menu. Folder details report recursive file size and direct child count; symbolic links are not followed. ZIP members and multi-selections do not offer this action. See `openspec/specs/context-menu/spec.md` and `openspec/specs/fs-commands/spec.md`.
