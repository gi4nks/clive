# Proposal: English-first i18n (language switcher, EN default)

## Why

The clive file manager's entire user interface is hard-coded in Italian (window chrome, toolbar tooltips, context/status-bar labels, AI panel messages, validation reasons, plurals like "elementi/selezionati"). This makes the app unusable for non-Italian readers and blocks any shareable/demo build. The app should be **English by default** while remaining localizable, so the primary experience is English and other languages (keeping the existing Italian) are supported through a proper i18n system rather than one-off edits.

## What Changes

- Introduce an i18n layer (`i18next` + `react-i18next`) with **English as the default/fallback language** and a **language switcher**; the user's choice persists and applies app-wide.
- Externalize **every user-facing string** in the React UI to translation keys: toolbar/button titles, tooltips, status-bar and context-menu labels, sidebar sections, placeholders, modal text, status toasts, and the `validateNewName` reasons.
- Replace ad-hoc Italian plural/gender logic (`element{i}`, `selezionat{i|o}`, `usati/disponibili`) with i18next **pluralization + interpolation** (`{{count}}`, `one/other`).
- Make **date/size formatting follow the active language** (locale-aware `toLocaleString`).
- The **AI layer is fully English**: model prompts are English constants, the assistant is instructed to answer in English, and AI status/error copy is surfaced through the same i18n keys (English default).
- Enforce coverage so no user-facing literals remain: an ESLint rule (`i18next/no-literal-string`) or an equivalent guard keeps components keyed.
- Ship an English locale that is complete; keep an Italian locale (existing copy) that is allowed to lag.

## Capabilities

### New Capabilities

- `ui-i18n`: the localization framework, English default, persisted language switcher, key coverage across the whole UI, plural/interpolation and locale-aware formatting.
- `ai-localization`: AI prompts/responses in English and AI-facing user strings localized through the same system.

### Modified Capabilities

- None against the deployed `openspec/specs/` baseline (it is not yet populated); this change only adds a cross-cutting localization layer. It has no effect on the behavior specified by the existing `status-bar`, `context-menu`, `theming`, or `clive-ai-integration` capabilities beyond replacing their visible strings with translatable ones.

## Impact

- **New deps** (frontend): `i18next`, `react-i18next` (+ `i18next-browser-languagedetector` for persistence).
- **New files**: `src/i18n/index.ts` (init), `src/i18n/locales/en.json`, `src/i18n/locales/it.json`.
- **Wired into** `src/main.tsx` (i18n init before render) and every user-facing component: `App.tsx`, `FileList.tsx`, `Places.tsx`, `widgets.tsx`, `StatusBar.tsx`, `ContextMenu.tsx`, and `ai/{AiWidget,useAi,actions,safety,capabilities,budget,settings}.tsx/ts`.
- **Behavior**: none of the file/AI functionality changes; only strings and formatting locale. Default language becomes English (was Italian), so an Italian-only user must switch once (choice persists).
- **Language switcher** surfaces in the status-bar quick launcher (and/or toolbar); persists to `localStorage` (`fm.lang`).
- **Rust**: command error strings are already English and technical; out of scope except that they are surfaced verbatim (a follow-up may map them to keys).
