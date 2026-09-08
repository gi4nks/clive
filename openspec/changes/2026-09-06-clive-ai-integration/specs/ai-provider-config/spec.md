## Purpose

Defines how the user selects and configures the AI provider, model, and credentials, reusing the pure-React `wise/react` components, and how those selections and per-model capabilities are persisted and surfaced.

## ADDED Requirements

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

### Requirement: Attach capability metadata to models
The system SHALL associate capability flags with each model, including whether it supports vision and a context budget, and SHALL use them to gate features.

#### Scenario: Vision-gated action
- **WHEN** a vision-dependent action is requested while the active model lacks vision support
- **THEN** that action is unavailable and its unavailability is explained

### Requirement: Reflect provider health in the UI
The system SHALL reflect the gateway health status and disable AI affordances when no usable model is reachable.

#### Scenario: No reachable provider
- **WHEN** the health check reports no reachable provider
- **THEN** AI actions are disabled with a clear reason
