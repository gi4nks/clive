# ai-gateway Specification

## Purpose
Defines the loopback AI Gateway in the Rust backend that is the single entry point for all model traffic: it fronts local and cloud providers, injects API keys, satisfies webview CORS, exposes health, and enforces the cloud/privacy gate.

## Requirements

### Requirement: Gateway runs loopback-only inside the app
The system SHALL start an HTTP server bound to the loopback interface (127.0.0.1) when the Tauri application starts, SHALL listen only on that interface, and SHALL stop it on exit.

#### Scenario: Gateway available to the webview
- **WHEN** the application is running
- **THEN** the frontend can reach the gateway at a 127.0.0.1 address and port
- **AND** the chosen port is communicated to the frontend at startup

#### Scenario: Not reachable off-host
- **WHEN** a client other than the local loopback tries to reach the gateway
- **THEN** the request is refused because the server binds only to 127.0.0.1

### Requirement: Gateway serves a health endpoint
The system SHALL expose a health endpoint reporting the gateway status and the reachability of each configured provider.

#### Scenario: Provider unreachable
- **WHEN** a configured upstream provider is not reachable
- **THEN** the health response marks that provider as unavailable
- **AND** the frontend uses this to disable AI affordances

### Requirement: Gateway lists models
The system SHALL expose an OpenAI-compatible models endpoint aggregating models from reachable upstream providers.

#### Scenario: Aggregate models
- **WHEN** the frontend requests the model list
- **THEN** the gateway returns models from each reachable upstream in OpenAI-style form

### Requirement: Gateway proxies completions and streams
The system SHALL accept OpenAI-compatible chat-completion requests, route them to the selected upstream provider, and return the response as a stream.

#### Scenario: Local model completion
- **WHEN** the frontend sends a chat completion for an Ollama model
- **THEN** the gateway forwards it to the local Ollama endpoint and streams the response back

### Requirement: Gateway injects keys and is the CORS origin
The system SHALL inject provider API keys server-side so the webview never sends or stores cloud keys, SHALL return CORS headers that allow the application's webview origin and expose `x-clive-*` diagnostic headers, and SHALL accept request bodies up to 12 MB to accommodate base64 vision attachments.

#### Scenario: Keys held by the gateway
- **WHEN** a completion targets a provider requiring an API key
- **THEN** the gateway adds the key to the upstream request
- **AND** the webview request itself carries only a placeholder credential

### Requirement: Cloud and privacy gate
The system SHALL classify loopback, RFC1918 private IPs, link-local addresses, mDNS domains, and single-label LAN hostnames as local (`cloud = false`), SHALL default to local providers, and SHALL only forward to a cloud provider when the user has explicitly enabled cloud (`x-clive-cloud-allowed: true`), warning before any request whose contents would leave the machine.

#### Scenario: Cloud disabled
- **WHEN** a model maps to a cloud provider and cloud is disabled
- **THEN** the gateway refuses the request (`403 Forbidden`) and signals that cloud is not enabled

#### Scenario: LAN inference server treated as local
- **WHEN** a custom provider points at a private LAN IP or single-label hostname (e.g. `http://parmenide:8000/v1`)
- **THEN** the gateway classifies it as local and permits requests without cloud opt-in

#### Scenario: Cloud enabled warns
- **WHEN** a request is routed to a cloud provider after the user enabled cloud
- **THEN** the frontend has shown a warning that file contents will leave the machine

### Requirement: Health and model endpoints reflect the live registry
`/healthz` SHALL probe every registered provider (built-in and custom) concurrently with bounded per-provider timeouts; `/v1/models` SHALL concurrently aggregate models from reachable providers with `<provider>/` prefixes while preserving optional context and modality metadata and ignoring non-2xx responses.

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
