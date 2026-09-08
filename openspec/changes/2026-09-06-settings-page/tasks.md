# Tasks: Application Settings page

## 1. Config store (`appConfig`)

- [x] 1.1 `settings/appConfig.ts`: `AppConfig` shape, `getAppConfig`/`setAppConfig`/`subscribe` + `useAppConfig()`
- [x] 1.2 Persist via `@tauri-apps/plugin-store` (`settings.json`); localStorage fallback (`fm.config`) when the store is unavailable
- [x] 1.3 Register the store plugin in Rust (`tauri_plugin_store`) + capability `store:default`
- [x] 1.4 On first load, seed `appConfig` from legacy `fm.*` keys (theme, view, sort, hidden, ai, sidebar width, home, recents, lang)
- [x] 1.5 `main.tsx` boot order: `initAppConfig()` runs on mount before home/first render settles (hydration is non-blocking with localStorage seed)

## 2. Settings modal + tabs

- [x] 2.1 `SettingsModal.tsx` (daisy `modal` + `tabs`): General · File · AI · Advanced
- [x] 2.2 General: language select (`appConfig.language`), theme select (System + list)
- [~] 2.3 File: default view, default sort, show-hidden toggle, confirm-destructive toggle (defaults applied live; "default view" also drives existing `view`)
- [x] 2.4 AI: gateway health, provider select, model select (filtered), allow-cloud toggle
- [x] 2.5 Advanced: sidebar width, Export/Import/Reset
- [x] 2.6 Open from a toolbar gear (`SettingsModal` mounted in App)

## 3. Consolidate existing controls into `appConfig`

- [x] 3.1 `view`/`sort`/`hiddenVisible`/`sidebarWidth`/`theme`/`recents`/`home` migrated to `useAppConfig` (removed the old `useState`+`localStorage`/`STORAGE`/`readJSON`)
- [x] 3.2 Toolbar `ThemeSwitch` removed → gear opens Settings (theme lives only in Settings now)
- [x] 3.3 `ai/settings.ts` is now a thin view over `appConfig` (localStorage `fm.ai.settings` folded in)

## 4. AI integration

- [x] 4.1 `useAi` reads provider+model from `appConfig` (full id `${provider}/${model}`)
- [x] 4.2 Cloud gate: `ai.cloudOptIn=false` hides cloud providers in `visibleProviders()` and blocks cloud requests with a message
- [x] 4.3 AI popover selects now reflect/persist to `appConfig` (single source with Settings)

## 5. Export / Import

- [x] 5.1 Export `appConfig` as a `clive-settings.json` download (Blob)
- [x] 5.2 Import from a file: parse → validate (`normalizeConfig`) → merge → persist → inline message; rejects malformed/non-object
- [x] 5.3 Reset to defaults (with confirm)

## 6. Tests & verification

- [x] 6.1 `plugin-store` mocked in the config test (`vi.mock`)
- [x] 6.2 Unit: config round-trip, normalize (missing/`ai`/`recents`), import merge/validation/reject, export parseability, fallback+init — 9 new tests
- [x] 6.3 `npm run build` + `lint` + `cargo check`/`clippy` clean; app boots with plugin-store capability (no permission error)
- [ ] 6.4 Component tests for SettingsModal live updates + cloud-gate hiding (vitest+RTL) — to add
- [ ] 6.5 Manual GUI: gear opens Settings; change theme/view/cloud; export→import round-trip persists
