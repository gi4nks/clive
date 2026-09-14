## Purpose

The loopback AI gateway exposes a single OpenAI-compatible surface to the
webview and routes each request to a registered provider. This delta makes the
gateway surface dynamic so custom providers are reachable and observable.

## ADDED Requirements

### Requirement: Health and model endpoints reflect the live registry
`/healthz` SHALL report every registered provider (built-in and custom) with a
per-provider availability probe; `/v1/models` SHALL aggregate models from all
registered providers with `<provider>/` prefixes.

#### Scenario: Custom provider in health
- **WHEN** a custom provider with a reachable base URL is configured
- **THEN** `/healthz` returns `providers.<id>: true` and its `selected` check accepts `<id>/<model>`

### Requirement: Chat routing is provider-agnostic
`/v1/chat/completions` SHALL route `<provider>/<model>` for any registered
provider using its configured base URL and key. Provider-specific quirks (e.g.
session headers for opencode endpoints) SHALL be keyed off the provider's
configuration, not off a fixed list of ids beyond the built-in defaults.

#### Scenario: OpenRouter chat
- **WHEN** the frontend requests model `openrouter/deepseek/deepseek-chat` with a configured `openrouter` provider
- **THEN** the gateway forwards to openrouter's `/chat/completions` and streams the reply back
