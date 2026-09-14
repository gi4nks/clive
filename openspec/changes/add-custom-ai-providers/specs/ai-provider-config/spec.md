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

### Requirement: Cloud actions require an opt-in
The cloud classification used for the opt-in gate SHALL come from the gateway's
per-provider `cloud` flag (derived from the base URL), not from a front-end
table.

#### Scenario: Offline mode hides cloud custom providers
- **WHEN** cloud opt-in is off and a custom provider points to `https://api.deepseek.com/v1`
- **THEN** that provider is hidden from selection

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
