## Context

`gateway.rs` keeps a static table `const PROVIDERS: &[(id, base-env, key-env, default-base)]` with `GLB_*` env names; the frontend mirrors it in `ai/settings.ts` (`PROVIDERS`, `isCloudProvider`). Keys live in `~/.clive/ai.env` written by `ai_set_provider` via `write_env`; `providers_now()` is already recomputed per request, and `/healthz` + `/v1/models` already iterate the whole registry, so custom providers surface for free. Chat routing splits `<provider>/<model>` and injects `Bearer` key; only the `x-opencode-session` header is provider-specific today.

## Goals / Non-Goals

**Goals:** runtime-addable OpenAI-compatible providers; single source of truth (gateway) for the provider list; zero personal identifiers; safe key handling unchanged (dotfile + masked reads).

**Non-Goals:** non-OpenAI wire protocols (native Anthropic/Gemini translation) — their OpenAI-compatible endpoints suffice; keychain storage; provider catalog presets; changes to `@gi4nks/wise`; multi-profile configs.

## Decisions

1. **Env naming convention instead of a table.** For any id `X`: `CLIVE_PROVIDER_<X>_BASE_URL` / `CLIVE_PROVIDER_<X>_API_KEY` (id uppercased; `<X>` = `[A-Z0-9_]+`). Built-ins are just three seeded defaults (`(id, default_base)` const kept). Custom ids are discovered by scanning env + `ai.env` for `CLIVE_PROVIDER_*_BASE_URL`. *Alternative:* JSON array in the dotfile — rejected: breaks the existing `KEY=VALUE` parse/write primitives and hand-editability.
2. **`ai.env` stores one file-scoped line per value** (`CLIVE_PROVIDER_openrouter_BASE_URL=https://…` lowercase as written by the app; matching is case-insensitive on the `CLIVE_PROVIDER_` prefix). This keeps `write_env`/`parse_env` untouched. *Alternative:* separate JSON sidecar — rejected for duplication of state.
3. **Cloud detection in the gateway**: `cloud = !(base_url starts with http(s)://localhost | http(s)://127. | http(s)://[::1])`. Exposed through `ai_get_config` and `/healthz`; frontend drops `PROVIDERS` and reads these.
4. **Commands**: keep `ai_set_provider` (override base/key of existing provider, auto-creating a custom entry if unknown), add `ai_add_provider(id, base_url, api_key)` (validates slug `[a-z0-9][a-z0-9-]{1,31}`, unique id, `http(s)://` URL) and `ai_remove_provider(id)` (refuses the 3 built-ins, deletes its env keys from the dotfile).
5. **Frontend selection flow**: `useAppConfig().ai.provider/model` default `''`; App resolves at startup and whenever `/healthz` changes: first online provider (built-in order: opencode-go, opencode-zen, ollama, then customs alphabetically) + first model from `/v1/models`. `visibleProviders()` becomes async-sourced (healthz + ai_get_config) with the cloud gate applied to the derived flags.
6. **Breaking rename without fallback**: `GLB_*` is dropped entirely (it references a private env manager). The author's own `~/.clive/ai.env` / shell vars get migrated manually as part of the change (not in-app code).
7. **`x-opencode-session` stays id-prefix-based** for built-ins; a custom id cannot start with `opencode` (validation), so no new config surface is needed.

## Risks / Trade-offs

- Keys stay plaintext in `~/.clive/ai.env` (existing behavior, 0600 enforced on write) — accepted for V1; documented in Settings.
- A custom provider with non-OpenAI-compat endpoints appears online but 404s on chat — surfaced by the existing visible-error path; no protocol sniffing (YAGNI).
- Model lists can be large across many providers; picker is already per-provider filtered — fine.
