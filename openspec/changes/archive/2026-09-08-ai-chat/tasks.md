# Tasks — AI Chat v1

## Implementation (executed via SDD, all completed)

- [x] **Task 1**: chat types + `extractActions` parser (commit `a8803d0`)
- [x] **Task 2**: `validateChatAction` (safety + system guard) (commit `16d0f1e`)
- [x] **Task 3**: `buildChatPrompt` + `trimHistory` + `renderDirListing` (commit `635539a`)
- [x] **Task 4**: `useChat` hook + `streamChat` + `moveToTrash` (commits `2ac1675` → `0821e84` after fix round 1)
- [x] **Task 5**: `ChatDrawer` component with action cards (commit `db923b5`)
- [x] **Task 6**: `App.tsx` integration + `⌘⇧C` shortcut + status-bar button (commit `a27c80a`)
- [x] **Task 7**: i18n keys + `CANCELLED_SENTINEL` shared contract (commit `e4e3bef`)
- [x] **Fix wave** (final review): create-collision + drop-target + retryable cards + truncation chip (commit `11488a4`)

## Verification

- [x] `cargo test` 15/15 (Rust unchanged)
- [x] `cargo clippy` clean
- [x] `npx tsc --noEmit` 0 errors
- [x] `npx vitest run` **173/173** (21 files)
- [x] `npm run build` (Vite production build)
- [x] `make build` → `Clive_1.0.0_aarch64.dmg` produced

## Deferred to v1.1 (documented in `clive/docs/specs/2026-09-08-ai-chat-design.md` §5.2 + §12)

- [ ] Multimodal image content delivery when provider supports vision
      (needs `runtime.ts` to send `image_url` blocks through `streamChat`).
- [ ] `historyTruncated` state also set on stream error path.
- [ ] Skip pathless files on drop instead of `/drop/<name>` fallback.
- [ ] `onDragLeave` child-flicker cosmetic fix.
- [ ] Sweep hardcoded strings: `ChatDrawer.tsx` `'Copiato!'` and pre-existing
      `it.json "ai.copy": "Copiar"` typo.

## Deferred minors from task reviews (follow-up tickets)

- [ ] `extractActions` regex should build from `ACTIONS_OPEN`/`ACTIONS_CLOSE`.
- [ ] `extractActions` leading-whitespace survives strip when block is first line.
- [ ] `isValidAction` accepts extra fields on action objects.
- [ ] Stale "then reverse" comment in `trimHistory`.
- [ ] Test for `budget < anchor` edge case.
- [ ] `deps.streamChat` injection in `UseChatDeps` is dead code — remove.
- [ ] `applyAction` doesn't abort in-flight fs operations on `reset()`.
- [ ] ChatDrawer doesn't surface `ai.busy` (Apply clickable during in-flight).
- [ ] `⌘⇧C` shortcut should also call `ai.abort()` (not just `ai.cancel()`) to
      avoid flicker when overlay is mid-stream.