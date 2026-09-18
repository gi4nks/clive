# Proposal: AI Chat — right-side drawer with streaming + confirmed actions

## Why

Clive's existing AI surface (`AiWidget` + `AiOverlay`) supports 4 one-shot
actions (rename / organize / summarize / generate) on the current selection.
Users wanted a **conversational** alternative: ask questions about the
selection + folder, request operations in natural language, and see proposals
rendered as **confirmable action cards** inline in the chat thread. This is
the "chat-first" foundation the previous brainstorming session scoped — the
autonomous agent + semantic search + auto-actions are follow-up iterations.

## What Changes

- **New module `src/ai/chat.ts`** — pure layer: types (`ChatAction`, `ChatMessage`,
  `ValidatedAction`), action-marker parser (`extractActions`), validator
  (`validateChatAction` reusing `safety.ts` + `systemGuard.ts`), prompt builder
  (`buildChatPrompt` + `CHAT_SYSTEM_PROMPT`), history trimmer (`trimHistory`,
  FIFO + first-message anchor).
- **New hook `src/ai/useChat.ts`** — state (`messages`, `streaming`,
  `historyTruncated`, `addedFiles`, `error`), methods (`send`, `abort`,
  `applyAction`, `cancelAction`, `reset`, `addFile`, `removeAdded`,
  `validateAction`). Consumes new `streamChat` async generator added to
  `runtime.ts`. Vision-gated context (images dropped with note when model
  lacks `vision`).
- **New component `src/ai/ChatDrawer.tsx`** — right-side fixed drawer (`w-420`)
  with backdrop; header + thread + error banner (reuses copy button pattern);
  action cards with pre-render validation (greyed + hint for guard-blocked
  paths, retryable for transient errors); input row with `⌘↵` submit, drop
  target for extra context files, truncation chip, removed-files chip row.
- **Integration `App.tsx`** — mount `useChat` + `ChatDrawer`; `⌘⇧C` toggles
  it globally; mutual-exclusion effects (chat opens → `AiOverlay` closes;
  overlay opens → chat closes); status-bar 💬 button.
- **`fs.ts` bridge additions** — `moveToTrash` (mirrors `writeFile`).
- **`budget.ts` addition** — `renderDirListing` (compact names-only folder
  context, `... + N more` past `maxEntries`).
- **i18n `chat.*` keys** — 13 user-facing strings + `chat.action.*`
  discriminated-by-type.

**Model → action protocol**: assistant's streamed text may end with
`<<<ACTIONS>>>{json}<<<END>>>`. Parser is tolerant: absent marker or malformed
JSON leaves the message as plain text (no cards, no execution). Every action
is validated before Apply is enabled; Apply never fires without a click.

## Impact

- **Affected specs**: `clive/docs/specs/2026-09-08-ai-chat-design.md` (v1
  design; vision image-content delivery marked deferred to v1.1 §5.2).
- **Affected plan**: `clive/docs/plans/2026-09-08-ai-chat.md` (7 tasks + fix
  wave, executed via subagent-driven-development).
- **Affected code**:
  - New: `src/ai/chat.ts`, `src/ai/useChat.ts`, `src/ai/ChatDrawer.tsx` +
    three test files.
  - Modified: `src/ai/runtime.ts` (+`streamChat`), `src/ai/budget.ts`
    (+`renderDirListing`), `src/ai/fs.ts` (+`moveToTrash`), `src/App.tsx`
    (mount + shortcut + mutual exclusion), `src/StatusBar.tsx` (💬 button
    +props), `src/i18n/locales/{en,it}.json` (`chat.*`).
- **Non-impact**: no changes to `AiOverlay`, `useAi`, `actions.ts`, gateway
  Rust, provider config, safety guard internals. Existing 4-action flow
  untouched.
- **Test state**: 173 TS tests + 15 Rust, `make build` produces
  `Clive_1.0.0_aarch64.dmg`.
- **Deferred to v1.1** (per ledger R9):
  - Multimodal image content in chat context (streamChat is text-only today).
  - `historyTruncated` re-record on stream error mid-flight.
  - `/drop/<name>` fallback yields bogus path when `File.path` absent.
  - `onDragLeave` child-flicker cosmetic.
  - `'Copiato!'` hardcoded in ChatDrawer + `it.json "ai.copy": "Copiar"` typo
    (both pre-existing debt, unrelated to this change).