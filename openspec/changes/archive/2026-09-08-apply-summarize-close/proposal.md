# Proposal: Apply button on Summarize result closes the popup

## Why

When the AI **Summarize** action completes, the overlay (`AiOverlay`) shows the summary with an **Apply** button. Previously this button did nothing (the `apply()` function in `useAi` only handles *rename*, *organize*, and *generate* modes; *summarize* had no implementation). Users expected the popup to close after viewing the summary, or at least have a clear action.

## What Changes

- In `src/frontend/vite-project/src/ai/AiOverlay.tsx`, the Apply button's `onClick` now checks the current busy mode:
  - If `busy === 'summarize'` → calls `ai.cancel()` to close the popup.
  - Otherwise → calls the original `ai.apply()` for rename/organize/generate modes (unchanged behaviour).
- The button remains visually disabled while any AI action is in flight (`busy !== null`).
- No other files are affected; the logic lives entirely in the overlay component.

## Impact

- Behavioural: Summarize overlay now closes when the user clicks **Apply**, matching user expectations.
- No code outside `AiOverlay.tsx` is modified.
- No new specs or i18n strings are required.

## Affected code

- `src/frontend/vite-project/src/ai/AiOverlay.tsx` — Apply button `onClick` handler.