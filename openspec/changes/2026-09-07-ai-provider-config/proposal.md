# Proposal: AI provider config in Settings + Chat-Completions routing

## Why

Two defects made the AI actions unusable:
1. `AI_APICallError: Not Found` — wise built the gateway model with the `openai`
   provider, which in AI SDK v7 calls the **Responses** API (`/v1/responses`);
   our gateway only exposes **Chat Completions** (`/v1/chat/completions`) and
   the OpenCode providers don't support Responses → 404, and the failure showed
   only as a fleeting toast (the overlay flashed and vanished).
2. Providers were configured **only** from `GLB_*` shell env vars, so launching
   the app from the Dock/Finder (or without an exported env) left the gateway
   with zero providers and every AI action failed with "Provider unreachable".

## What Changes

- **Routing fix**: clive's AI runtime now builds the gateway model with the
  `opencode` provider (`createOpenAICompatible` → Chat Completions), so calls
  hit `/v1/chat/completions` and work (verified end-to-end).
- **Gateway sends `x-opencode-session`** for `opencode-*` providers on chat
  completions (required by OpenCode Go/Zen).
- **In-app provider config**: Settings → AI now edits each provider's **base
  URL + API key**, persisted to the dotfile **`~/.clive/ai.env`** (0600,
  outside the app bundle, NOT part of the settings export). Shell `GLB_*` env
  vars still take priority; the gateway reads env+file on each request, so a
  saved key takes effect **without restarting**.
- **Visible errors**: AI failures now show as a persistent banner in the
  `AiOverlay` (with the reason), instead of a toast that disappears.
- New Tauri commands `ai_get_config` / `ai_set_provider` (keys masked on read).

## Impact

- Affected capability: extends `clive-ai-integration`.
- Affected code: `src-tauri/src/gateway.rs`, `main.rs`, `src/api.ts`,
  `src/ai/runtime.ts`, `src/ai/useAi.ts`, `src/ai/AiOverlay.tsx`,
  `src/settings/SettingsModal.tsx`, i18n `en/it`.
