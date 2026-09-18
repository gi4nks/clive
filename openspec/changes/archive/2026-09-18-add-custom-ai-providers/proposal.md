# Proposal: add-custom-ai-providers

## Why

Clive currently hard-codes the developer's personal AI setup: three providers baked into the Rust gateway (`const PROVIDERS` in `gateway.rs`), a duplicated provider list in the frontend (`ai/settings.ts`), env vars with a private `GLB_` prefix, a personal hostname in a UI label ("Ollama (lab server)") and personal defaults (`opencode-go` / `kimi-k3`). Anyone who does not run opencode/ollama exactly this way — i.e. every other user — cannot configure a working AI provider at all.

## What Changes

- The AI gateway provider registry becomes data-driven: built-in defaults (opencode-go, opencode-zen, ollama) keep working, and **any OpenAI-compatible provider can be added at runtime** (OpenRouter, DeepSeek, Groq, Mistral, LM Studio, vLLM, …) via `~/.clive/ai.env` (`CLIVE_PROVIDER_<ID>_BASE_URL` / `CLIVE_PROVIDER_<ID>_API_KEY`), plus new Tauri commands `ai_add_provider` / `ai_remove_provider`.
- **BREAKING**: `GLB_*` env vars are renamed to `CLIVE_PROVIDER_*`; no fallback is kept.
- `cloud` flag is derived from the base URL (localhost/127.x ⇒ local, otherwise cloud) instead of a hard-coded table; the existing `ai.cloudOptIn` privacy gate keeps applying.
- Settings → AI gains full provider management UI (list with availability, add, edit base URL/key, remove).
- The front-end hard-coded `PROVIDERS` list and the label "Ollama (lab server)" are removed; provider list is fetched from the gateway.
- Default `ai.provider` / `ai.model` become empty and auto-select the first online provider (and its first model) — no personal defaults shipped.
- `@gi4nks/wise` is **not** changed: its factories already accept a custom `baseUrl`, and clive keeps routing everything through the gateway's single OpenAI-compatible `/v1`.

## Capabilities

### New Capabilities
- `ai-provider-management`: dynamic, user-editable provider registry in the gateway (env/dotfile derivation, cloud detection, add/remove commands, validation).

### Modified Capabilities
- `ai-gateway`: provider table no longer static; health/models endpoints expose custom providers; config commands generalized.
- `ai-provider-config`: Settings UI manages providers; provider list no longer hard-coded in the frontend; empty/auto default selection.
- `settings-ai-integration`: cloud gate reads the derived per-provider `cloud` flag instead of a front-end table.

## Impact

- `clive/src-tauri/src/gateway.rs` (registry, commands, env naming), `main.rs` (handler registration), Rust unit tests.
- Frontend: `src/ai/settings.ts`, `src/settings/appConfig.ts`, `src/settings/SettingsModal.tsx`, `src/ai/*` consumers of `PROVIDERS`/`isCloudProvider`, vitest tests, i18n keys.
- `~/.clive/ai.env` format (new keys). Existing users with GLB_* vars must re-save (only affects the author's machine).
- No dependency changes.
