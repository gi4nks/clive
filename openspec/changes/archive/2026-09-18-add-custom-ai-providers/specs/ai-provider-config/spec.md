## MODIFIED Requirements

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

## ADDED Requirements

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
