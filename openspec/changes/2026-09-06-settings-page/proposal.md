# Proposal: Application Settings page

## Why

App configuration is currently scattered and inconsistent: theme lives in a toolbar dropdown, AI provider/model in the status-bar AI popover, view/sort/hidden-files/preferences spread across ad-hoc `localStorage` keys, and there is no language switcher yet (only specified in `english-ui`). A single Settings surface makes the app configurable in one place, becomes the source of truth for preferences, persists them natively, and gives a natural home for the (not-yet-built) language switcher, a default AI model, and export/import.

## What Changes

- Add a tabbed **Settings modal** (General · File · AI · Advanced), opened from a toolbar gear and the quick-launcher menu.
- Introduce one persisted **`appConfig`** store backed by `@tauri-apps/plugin-store` (single `settings.json`), with a **localStorage fallback** when the native store is unavailable (tests/browser). All preferences move into it.
- **Centralize existing controls** into Settings: theme moves here (toolbar keeps only an optional quick cycle that still writes `appConfig`); AI provider/model selection moves here (the AI popover shows the current values and a link to Settings, no duplicate selects).
- Settings content: **General** (language EN/IT, theme), **File** (default view, default sort, show hidden files, confirm-destructive toggle), **AI** (gateway status, default provider, default model, cloud opt-in), **Advanced** (sidebar width, export/import config as JSON, reset).
- **Export/Import**: download the whole config as a JSON file and restore from a chosen JSON file (pure web `Blob` + `<input type=file>`, no extra native deps).
- The AI runtime and the widgets read/write `appConfig` instead of local `useState`/`localStorage`.

## Capabilities

### New Capabilities

- `app-settings`: the Settings modal, the `appConfig` persistence layer (plugin-store + fallback), every setting group (language, theme, view/sort/hidden, confirm-destructive, AI provider/model/cloud, sidebar width), and export/import/reset.
- `settings-ai-integration`: the AI layer consumes its provider/model/cloud-opt-in configuration from `appConfig` (default model + cloud gate live in Settings, not the popover).

### Modified Capabilities

- None at the deployed `openspec/specs/` baseline. In change-space this supersedes parts of: `2026-09-06-english-ui` (its language switcher now targets `appConfig`, and a language toggle belongs to Settings) and `2026-09-06-clive-ai-integration` task 1.10/5.2 (provider/model selection and cloud opt-in relocate to Settings).

## Impact

- **Frontend**: new `src/settings/` (store `appConfig.ts`, `SettingsModal.tsx`, tabs); `main.tsx` bootstrap loads settings; `App.tsx` mounts the modal + gear; `ai/{settings,runtime,useAi,AiWidget}`, `widgets.tsx`, `Places.tsx`, `StatusBar.tsx` migrate to read/write `appConfig`. Deprecates `ai/settings.ts` and the ad-hoc `fm.*` localStorage keys.
- **Deps**: `@tauri-apps/plugin-store` (frontend + Rust plugin registration and capability permission).
- **Persistence migration**: on first load, seed `appConfig` from existing `fm.*` keys so current users keep their settings.
- **Tests**: vitest setup gains a `plugin-store` mock; config round-trip and fallback-to-localStorage unit tests.
