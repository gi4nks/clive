# Tasks: English-first i18n

## 1. Framework

- [ ] 1.1 Add `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- [ ] 1.2 `src/i18n/index.ts`: init `fallbackLng:'en'`, `supportedLngs ['en','it']`, detector (localStorage `fm.lang` → navigator), static resources
- [ ] 1.3 Import `./i18n` in `src/main.tsx` before render
- [ ] 1.4 Create `locales/en.json` (complete) and `locales/it.json` (existing copy), parallel keys

## 2. Externalize UI strings

- [ ] 2.1 `App.tsx`: toolbar tooltips, status toasts, context-menu labels (`buildContextItems`/`actionsFor`/`buildSidebarItems`), modals (New folder, Trash), loading, resize title, sidebar empty
- [ ] 2.2 `Places.tsx`: section labels, recent labels, clear
- [ ] 2.3 `FileList.tsx`: folder kind label, header, placeholder text
- [ ] 2.4 `widgets.tsx`: count (`elements`/`selected` plurals), search placeholder, clipboard chip, disk (`usati/disponibili/loading`), trash popover, launcher
- [ ] 2.5 `StatusBar.tsx`/`ContextMenu.tsx` labels & hints
- [ ] 2.6 `ai/safety.ts` validation reasons (`Nome vuoto`, etc.) → keys
- [ ] 2.7 Replace `element{i}` / `selezionat{i|o}` / gender hacks with `t(..., {count})` plurals

## 3. Locale-aware formatting

- [ ] 3.1 `formatDate`/`formatSize` accept active language (`i18n.language`)

## 4. Language switcher

- [~] 4.1 Language switcher added (English/Italian select) in the Settings modal General tab (relocated from launcher per `settings-page`)
- [~] 4.2 `appConfig.language` is persisted; actual `i18n.changeLanguage` + UI string externalization (tasks 1.x–2.x) still pending, so the switch stores the value but does not yet retranslate the UI

## 5. AI layer (English)

- [ ] 5.1 Ensure model prompts/system instruct English output (rename/summarize/generate/organize)
- [ ] 5.2 Route AI user-facing copy (`useAi`/`AiWidget` toasts, cloud/vision notes) through `t()`
- [ ] 5.3 Update existing AI vitest assertions to the English strings

## 6. Coverage guard & verification

- [ ] 6.1 Add `eslint-plugin-i18next` `no-literal-string` (with allow-list) to `npm run lint`
- [ ] 6.2 i18n unit test: `en` default, plural `count`, `it` switch
- [ ] 6.3 `npm run build` + `npm run lint` clean; app launches defaulting to English
