# Proposal: Mouse/Trackpad Gestures, Keyboard Navigation, Theming & Context Menus

## Why

The initial build had broken input handling and a rough interface: scrolling with a mouse or trackpad moved the whole window (including the fixed header and sidebar), several keyboard interactions were broken by stale-closure bugs, there was no right-click menu, and the styling stack (a broken Tailwind v3/v4 mix) plus hard-coded colors and emoji toolbar glyphs made the look & feel poor. This change delivers the usability and polish work completed on the application and documents the capabilities it now provides.

## What Changes

- Fixed the styling toolchain to Tailwind CSS v4 + daisyUI 5 (CSS-first config), removing the broken `@import`/postcss-import setup and hard-coded neutral colors in favor of theme tokens.
- Made the app shell a fixed-height, non-page-scrolling layout where only the internal panels (sidebar, file list) scroll, with scroll-chaining containment so mouse/trackpad gestures affect only the intended panel.
- Added a persisted theme switcher with a daisyUI theme registry and automatic system dark mode.
- Added a transient operation-feedback toast (success/error/info) replacing bare status strings.
- Fixed and expanded keyboard navigation: list selection via arrows/Home/End, Quick Look via Space, select-all, and the standard command shortcuts, with a guard for text inputs.
- Added a right-click context menu for file-list items and for sidebar places/recents, with generic and type-specific actions.
- Added two backend commands powering those actions: `open_path` (open with default application) and `quick_look` (macOS Quick Look preview).

## Capabilities

### New Capabilities

- `app-shell-scroll`: fixed chrome with independent internal scrolling and gesture/scroll-chaining containment.
- `keyboard-navigation`: selection, activation, Quick Look, and command shortcuts with text-input guard.
- `context-menu`: right-click menus for files and sidebar items with generic and type-aware actions.
- `theming`: Tailwind v4 + daisyUI toolchain, theme registry, system dark mode, and a persisted theme switcher.
- `status-feedback`: transient operation toasts.
- `fs-open-actions`: backend `open_path` and `quick_look` commands.

### Modified Capabilities

- None at the deployed baseline (`openspec/specs/` is not yet populated); previously-envisioned Quick Look (a non-goal in `file-manager-tauri-rust`) is now delivered under `fs-open-actions`.

## Impact

- **Frontend**: `src/index.css` (Tailwind v4 `@import` + `@plugin "daisyui"`, scroll containment utilities), `src/App.tsx` (shell layout, theme state, toast, keyboard handlers, context menu wiring), `src/ContextMenu.tsx`, `src/Places.tsx`, `src/FileList.tsx`, `src/api.ts`.
- **Backend**: `src-tauri/src/commands/filesystem.rs` (`open_path`, `quick_look`) and `src-tauri/src/main.rs` (registration).
- **Tooling**: `package.json` moved to `tailwindcss@4` + `daisyui@5`, `@tailwindcss/postcss`; `tailwind.config.js` and `autoprefixer` removed.
- **Storage**: new `localStorage` key `fm.theme`.
- **Platform**: `open`, `qlmanage` are macOS-only, consistent with the app.
