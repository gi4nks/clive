# Design: English-first i18n

## Goal

Make English the default UI language without hard-coding it: introduce a real i18n layer, externalize all user-facing strings, and keep the existing Italian as a selectable second language.

## Framework & init

- `i18next` + `react-i18next`. Init in `src/i18n/index.ts`, imported once in `src/main.tsx` before `ReactDOM.createRoot(...).render(...)`.
- Config: `fallbackLng: 'en'`, `supportedLngs: ['en','it']`, resources bundled statically from `locales/en.json` and `locales/it.json`. Detection order `['localStorage','navigator']` with `lookupLocalStorage: 'fm.lang'` so a prior choice wins and English is the fallback for new users.
- Namespaces: a single default namespace is enough; keys are grouped by area (see structure).

## Key structure

Flat-ish, dotted by surface so `t()` reads clearly and both locales stay parallel:

```
toolbar.back / toolbar.forward / toolbar.up / toolbar.home / toolbar.refresh
sidebar.places / sidebar.recents / sidebar.clearRecents / sidebar.none
view.list / view.grid
count.elements (plural) / count.selected (plural) / count.of
menu.open / menu.openFolder / menu.extract / menu.quicklook / menu.finder
menu.copyPath / menu.rename / menu.trash / menu.newFolder / menu.cut / menu.copy / menu.paste
dialog.newFolderTitle / dialog.newFolderPlaceholder / dialog.create / dialog.cancel
dialog.trashTitle / dialog.trashBody (plural) / dialog.trashConfirm
status.*  (toasts: created, movedToTrash, copied, cut, pasted, pathCopied, clipboardCleared, trashEmptied)
fileType.folder / fileType.cartella? -> use folder label
validate.* (emptyName, invalidName, noPath)
ai.* (providerUnavailable, visionBlocked, cloudWarning, renamedCount, organizedCount, fileCreated, noVision, ...)
common.loading / common.apply / common.undo / common.cancel
```

## Plurals & formatting

- Replace `s > 1 ? 'i' : 'o'` and `element{i}` with `t('count.elements', { count })` and `t('count.selected', { count })` using i18next `_one`/`_other` forms.
- `formatDate`/`formatSize` take the active language: use `i18n.language` for `toLocaleString(lang, ...)`. Size units stay unit strings but may be localized (`{size} MB`).
- The dialog body "Spostare N elementi" → `t('dialog.trashBody', { count })`.

## Language switcher

A compact control (a `dropdown` in the status-bar quick launcher, or a globe `btn` in the toolbar) listing `English` / `Italiano`. On select: `i18n.changeLanguage(lng)` (persisted automatically by the detector's `localStorage` write). Default is `en`.

## AI layer (English)

- Model prompt/system strings stay **English constants** (already are). Add an explicit instruction to summarize/describe/generate/organize prompts: respond in English. This guarantees model output language regardless of UI locale.
- All AI *user-facing* copy (status toasts, "provider unavailable", cloud warning, vision note, validation) goes through `t()` like the rest of the UI (English default).

## Coverage enforcement

Add `eslint-plugin-i18next` `no-literal-string` (JSX text + relevant props) configured with reasonable ignores (className, data-*, numbers). Where a literal must stay (e.g. `⌘C` hints, `✕`), allow it via a disable or a regex allow-list. A CI/lint pass is the guard that the localization stays complete.

## Testing

- Unit: i18n initializes with `en`; `t('count.elements', { count: 1 })` → "1 element", `{count:5}` → "5 elements"; switch to `it` yields "5 elementi".
- Component: render a couple of surfaces (count widget, menu, dialog) under both locales with assertions on English strings.
- Static guard: the `no-literal-string` lint is the structural check that no UI literal slipped through.
- Manual: app starts in English; switcher flips to Italian and persists across reload.

## Non-goals

- Translating Rust command error payloads into keys (surfaced verbatim for now).
- Locales beyond en/it.
- RTL, date/timezone beyond `toLocaleString` locale.
