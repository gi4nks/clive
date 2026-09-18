# Design: Application Settings page

## The single source of truth: `appConfig`

A small module exposes one reactive config object. Everything that needs a preference reads/writes it; nothing else persists user settings directly.

```ts
interface AppConfig {
  language: 'en' | 'it'          // default 'en'
  theme: string                  // '' = follow system
  view: 'list' | 'grid'
  sort: { key: 'name' | 'size' | 'modified'; dir: 1 | -1 }
  hiddenVisible: boolean
  confirmDestructive: boolean    // gate trash/move behind a confirm (default true)
  ai: {
    provider: string             // 'opencode-go' | 'opencode-zen' | 'ollama'
    model: string                // bare id, e.g. 'kimi-k3'
    cloudOptIn: boolean          // allow cloud providers; else local only
  }
  sidebarWidth: number
}
```

API: `getAppConfig()`, `setAppConfig(partial)`, `subscribe(fn)`, plus a React hook `useAppConfig()` that returns `[config, set]` and re-renders subscribers. On boot: load → if absent, **seed from legacy `fm.*` localStorage** → hold in memory; writes go to the store asynchronously and update memory immediately (optimistic).

## Persistence: plugin-store with fallback

- Primary: `@tauri-apps/plugin-store` — one file `settings.json` via the `Store` API (`load` + `set`/`save`). Registered as a Rust plugin + a capability permission.
- Fallback: if `plugin-store` is unavailable (vitest, plain browser, or error), transparently use `localStorage['fm.config']` with the same shape. The store module is the only place that knows which backend is active → components never care.

## Modal & tabs

daisy `modal` + `modal-box`, a `tabs tabs-boxed` bar, content per tab, each section a group of labeled controls bound to `appConfig`:

- **General**: Language select (English/Italian) → `language`; Theme select (System, light, dark, dracula, …) → `theme`.
- **File**: default View (list/grid), default Sort, Show hidden files toggle, **Confirm destructive operations** toggle.
- **AI**: gateway health pill (reuse `checkHealth`), Provider select (`PROVIDERS`), Model select (from `listAvailableModels` filtered by provider), **Allow cloud** toggle → `ai.cloudOptIn`.
- **Advanced**: sidebar width number/slider; **Export** (download `settings.json` via Blob); **Import** (`<input type=file>` → validate → merge); **Reset to defaults**.

## Entry points & consolidation

- Toolbar **gear** icon and the launcher ⚡ both open the modal (shared `openSettings()`).
- **Theme** no longer needs the top `ThemeSwitch`; a slim optional toolbar "cycle theme" button may remain but writes `appConfig.theme` (kept in sync with Settings). System-dark CSS (`@media`) still applies when `theme` is empty.
- **AI popover** loses its provider/model selects; it shows current provider+model as text with a "Modify in Settings" link. The cloud warning stays (driven by `ai.cloudOptIn` + provider).

## AI runtime integration

`useAi`/runtime read `ai.provider`+`ai.model` from `appConfig` (single id `${provider}/${model}`) instead of the popover's local `sel`. The cloud gate: with `ai.cloudOptIn === false`, cloud providers are hidden from the list and any cloud request is blocked; the AI panel explains why.

## Export / Import

- Export: serialize `AppConfig`, `Blob` + anchor download `clive-settings.json`.
- Import: file → `JSON.parse` → shallow-validate (unknown keys ignored, bad types coerced to defaults) → merge → persist → toast.
- No native dialog dependency (keeps it web-only and testable); can upgrade to native dialogs later.

## Migration & boot order

`main.tsx`: `await loadAppConfig()` (seeds from `fm.*`) → init i18n (reads `appConfig.language`) → apply theme attribute → render. Prevents a flash of default-then-loaded values.

## Testing

- Unit: `appConfig` set/get round-trips through the store mock; localStorage fallback when store absent; legacy `fm.*` seeding; import validates/merges and rejects malformed JSON; export is parseable.
- Component: opening Settings shows current values; toggling "Allow cloud" hides cloud providers in the AI list; changing language/theme updates live.
- `plugin-store` mocked in the vitest setup.

## Non-goals (v1)

- Native file open/save dialogs, per-window state, cloud key *entry* in the UI (keys stay in env/gateway), multi-profile configs.
