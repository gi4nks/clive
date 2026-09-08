# Tasks: ai-provider-config

## 1. Endpoint routing
- [x] 1.1 `runtime.ts`: `getModel` + `listAvailableModels` use provider `opencode` (Chat Completions), not `openai` (Responses)

## 2. Gateway
- [x] 2.1 send `x-opencode-session` for `opencode-*` chat completions
- [x] 2.2 providers built on-demand from shell env (priority) + `~/.clive/ai.env` + defaults
- [x] 2.3 `ai_get_config` (masked keys) + `ai_set_provider` (atomic 0600 write) commands

## 3. Frontend
- [x] 3.1 `api.ts`: `aiGetConfig` / `aiSetProvider`
- [x] 3.2 Settings → AI: per-provider base URL + API key editor, Save (no restart)
- [x] 3.3 `useAi` error state + `AiOverlay` persistent error banner; empty summarize = error

## 4. i18n + verify
- [x] 4.1 `settings.aiProviders/aiKeysHint/aiNoKey/aiKeyReplace/aiSave/aiSaved`, `ai.emptyResult` in en+it
- [x] 4.2 Rust unit tests (parse_env/providers/mask) + `cargo test` 9/9, clippy clean, TS 124/124
- [x] 4.3 end-to-end: live gateway `/healthz` ok + `/v1/chat/completions` 200 `opencode-go/kimi-k3`
- [ ] 4.4 Manual: Settings→AI save a key, confirm AI panel online + Summarize works from Dock launch
