# ai-provider-management Specification

## Purpose
Define a dynamic, user-editable registry of AI providers for the local gateway:
any OpenAI-compatible endpoint can be registered and used, without rebuilding
the app and without depending on the original developer's machine.

## Requirements

### Requirement: Provider registry is data-driven
The gateway SHALL build its provider list from built-in defaults (opencode-go,
opencode-zen, ollama) plus any custom provider whose base URL is configured via
`CLIVE_PROVIDER_<ID>_BASE_URL` (environment or `~/.clive/ai.env`), evaluated on
every request so changes apply without restarting the app.

#### Scenario: Custom provider is picked up live
- **WHEN** `CLIVE_PROVIDER_openrouter_BASE_URL` is added to `~/.clive/ai.env` while the app is running
- **THEN** `/healthz` reports `openrouter` and `/v1/models` lists its models on the next call, without a restart

#### Scenario: Built-ins keep working without configuration
- **WHEN** no environment or dotfile entry exists
- **THEN** the three built-in providers are still registered with their default base URLs

### Requirement: Credentials resolve from CLIVE_-prefixed vars
API keys SHALL be resolved from `CLIVE_PROVIDER_<ID>_API_KEY` (shell env wins
over dotfile). The legacy `GLB_*` variables are removed with no fallback.

#### Scenario: Key from dotfile
- **WHEN** `ai.env` contains `CLIVE_PROVIDER_deepseek_API_KEY=sk-…`
- **THEN** requests routed to `deepseek` carry that key

### Requirement: Cloud flag derived from base URL
A provider SHALL be considered cloud unless its base URL starts with
`http(s)://localhost` or `http(s)://` followed by `127.` / `[::1]`. The
existing cloud opt-in gate SHALL apply to custom providers exactly as to
built-ins.

#### Scenario: Local LM Studio is not cloud
- **WHEN** a provider's base URL is `http://127.0.0.1:1234/v1`
- **THEN** it is selectable even when the cloud opt-in is off

### Requirement: Provider management commands
The gateway SHALL expose Tauri commands to list (`ai_get_config`), add
(`ai_add_provider`), update (`ai_set_provider`) and remove
(`ai_remove_provider`) providers. Add/update persist to `~/.clive/ai.env`.
`ai_remove_provider` SHALL refuse built-in ids.

#### Scenario: Add validates input
- **WHEN** `ai_add_provider` is called with id `My Provider!` or base URL `ftp://x`
- **THEN** the call fails with a validation error and the dotfile is untouched

#### Scenario: Remove custom
- **WHEN** a user removes a custom provider
- **THEN** its entries disappear from `ai.env` and it is gone from `/healthz`
