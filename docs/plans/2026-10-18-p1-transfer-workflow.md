# P1: workflow ownership in the app shell

## Decision

Move pane navigation/history, clipboard and transfer orchestration, and expanded-preview layout transitions out of `App.tsx` into focused workflow hooks. Keep the app shell responsible for composition and for supplying filesystem, status, authorization, and UI callbacks.

## Why this slice

The P1 architecture review identified `App.tsx` as a shell that owns unrelated workflows. Pane navigation, transfers, and expanded preview each have stable state transitions and multiple UI entry points, so they can be tested through focused hook interfaces. AI orchestration already lives in `useAi`, `useChat`, and `useAiPlanCoordinator`.

## Tradeoffs

- Keeping the logic in `App.tsx` avoids an adapter but retains cross-workflow coupling and makes transfer behavior harder to test alone.
- Extracting `useTransferWorkflow` adds a hook interface, but callers depend on transfer state and actions rather than implementation details. It also allows focused tests without rendering the whole app.
- Extracting `usePaneNavigation` adds explicit refresh, recents, and UI cleanup callbacks. It scopes back/forward history to each pane, preventing navigation in one pane from consuming the other pane's history.
- Extracting `usePreviewLayout` keeps expanded-preview transitions with their layout state and makes pane restoration testable without mounting `App`.
- Clipboard persistence remains owned by the existing native command. The hook only hydrates and mirrors it in React state; no new storage format or cache invalidation is introduced.

## Ownership

`usePaneNavigation` owns per-pane back/forward history, path transitions, recents, and refresh orchestration. `useTransferWorkflow` owns clipboard hydration/state, copy/cut/paste, copy/move request confirmation, batch transfers, pane refresh after transfer, pane swapping, and transfer drag/drop callbacks. `usePreviewLayout` owns expanded-preview mode and transitions when a pane is activated. `App.tsx` supplies filesystem listing, read-only authorization, status, and UI callbacks, and composes the pane, transfer, preview, and AI hooks. Terminal launch remains in the shell because it is a separate action, not part of transfer state.

## Validation

- Focused hook tests cover successful transfer refresh of both panes and archive destination rejection.
- Preview layout tests cover pane restoration when expanded mode closes and feature disable behavior.
- Pane navigation tests cover independent per-pane histories, forward-history invalidation after a new navigation, and refresh dispatch.
- Final verification: 55 frontend test files / 389 tests pass; production frontend build succeeds; Oxlint exits 0 with existing repository warnings; `git diff --check` is clean.

## Remaining P1 work

The P1 proposal is delivered: pane navigation/history, transfers, and preview layout now have workflow-owned hooks; AI orchestration was already delegated to dedicated hooks. `App.tsx` remains a large composition module with dialogs, context-menu construction, keyboard dispatch, and feature wiring. Further splitting those UI registries is separate work and should follow a distinct cohesion boundary rather than being bundled into this P1.
