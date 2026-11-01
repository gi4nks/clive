# ai-provider-config Specification

## Purpose
Defines how the user selects and configures the AI provider, model, and credentials, reusing the pure-React `wise/react` components, and how those selections and per-model capabilities are persisted and surfaced.

## Requirements

### Requirement: Reuse wise/react for provider configuration
The system SHALL configure provider credentials and models using the reusable `wise/react` components (`WiseProvider`, `ModelSelector`, `ProviderKeyConfig`) rendered in the application UI.

#### Scenario: Configure a provider
- **WHEN** the user opens the AI settings
- **THEN** provider selection and credential entry are rendered by the shared wise components
- **AND** the model list is populated via the gateway

### Requirement: Persist selections and credentials locally
The system SHALL persist the chosen provider/model and any keys to the Tauri store so they survive restarts.

#### Scenario: Remember model across restarts
- **WHEN** the user selects a model and later reopens the app
- **THEN** that model is selected again

### Requirement: Select a model from the selected provider
The AI settings SHALL show models discovered from the selected provider and
allow the user to select one as the default model. Selecting a model SHALL
persist both its provider id and bare model id. The model list SHALL be
refreshable without restarting Clive.

#### Scenario: Choose a provider model
- **WHEN** the user selects a provider that returns models
- **THEN** the settings show those models in a selector
- **AND** each option shows its reported load state, or an unknown state when
  the provider does not report one
- **AND** choosing an option makes it the persisted default provider/model

#### Scenario: Refresh after server model changes
- **WHEN** the user refreshes the model list
- **THEN** Clive queries the current gateway catalog without using a stale
  client-side model-list cache

#### Scenario: Provider returns no models
- **WHEN** model discovery fails or returns an empty catalog
- **THEN** the settings show a localized loading, error, or empty state and
  leave the current selection unchanged

### Requirement: Attach capability metadata to models
The system SHALL preserve provider-reported capability flags and context length
when available. Missing metadata SHALL remain unknown and SHALL NOT be
misrepresented as provider-reported information. Existing conservative
fallbacks may be used for feature gating where metadata is unavailable.

#### Scenario: Vision-gated action
- **WHEN** a vision-dependent action is requested while the active model lacks vision support
- **THEN** that action is unavailable and its unavailability is explained

### Requirement: Reflect provider health in the UI
The system SHALL reflect the gateway health status and disable AI affordances when no usable model is reachable.

#### Scenario: No reachable provider
- **WHEN** the health check reports no reachable provider
- **THEN** AI actions are disabled with a clear reason

### Requirement: AI calls use the gateway's Chat Completions endpoint
The system SHALL call the gateway's `/v1/chat/completions` endpoint for AI
actions (not the Responses API), so model requests succeed against the
OpenCode-compatible providers.

#### Scenario: Summarize returns text
- **WHEN** the user runs "Summarize with AI" on a file with a working provider
- **THEN** the model reply is shown in the AI overlay instead of an instant failure

### Requirement: Provider credentials can be set in-app
The Settings AI section SHALL manage the full provider registry: list every
provider reported by the gateway (built-in and custom) with availability state,
allow adding a new provider (id, base URL, API key), editing base URL/key of
any provider, and removing custom ones. The frontend MUST NOT keep a hard-coded
provider list.

#### Scenario: Add OpenRouter
- **WHEN** the user adds id `openrouter`, URL `https://openrouter.ai/api/v1`, key `sk-or-…` and saves
- **THEN** the provider appears in the list with a health dot and becomes selectable in the model picker

#### Scenario: Built-in cannot be removed
- **WHEN** the user opens ollama
- **THEN** only base URL/key are editable; no remove control is offered

#### Scenario: Saved key takes effect immediately
- **WHEN** the user saves an API key for a provider in Settings → AI
- **THEN** subsequent AI actions use it (health/online reflects the provider) even
  without relaunching the app

#### Scenario: Secrets are not exported with settings
- **WHEN** the user exports settings from the app
- **THEN** the provider API keys stored in `~/.clive/ai.env` are not included

### Requirement: AI failures are surfaced visibly
The system SHALL show the reason for an AI failure persistently in the AI
overlay, rather than only a transient toast that auto-dismisses.

#### Scenario: Error banner on failure
- **WHEN** an AI action fails (provider unreachable, request error, or empty
  result)
- **THEN** the AI overlay stays open with an error message and a way to dismiss it

### Requirement: No shipped personal defaults
`ai.provider` and `ai.model` default to empty. When empty — or when the stored
provider is no longer registered or online — the system SHALL auto-select the
first online provider (and its first listed model) and persist the choice.

#### Scenario: First launch with only Ollama running
- **WHEN** a fresh install starts with no config and ollama online
- **THEN** the AI panel shows ollama with a real model, no user action needed

#### Scenario: Stored provider disappears
- **WHEN** the previously selected custom provider was removed
- **THEN** the selection falls back to another online provider instead of failing
