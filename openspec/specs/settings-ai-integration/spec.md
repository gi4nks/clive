# settings-ai-integration Specification

## Purpose
Defines how the AI feature consumes its configuration from the shared app config, so provider/model selection and the cloud gate live in Settings rather than being duplicated in the AI panel.

## Requirements

### Requirement: AI reads provider and model from app config
The system SHALL resolve the AI provider and model from the shared application config, so the same defaults apply to every AI action and surface.

#### Scenario: Default model used by actions
- **WHEN** an AI action runs without per-call overrides
- **THEN** it uses the provider and model currently stored in the app config

### Requirement: AI panel links to settings instead of duplicating selection
The AI panel SHALL display the current provider and model and offer a control that opens the Settings modal, rather than providing its own independent provider/model selectors.

#### Scenario: Change model from the AI panel
- **WHEN** the user wants a different model from the AI panel
- **THEN** they are taken to the Settings AI section, and the panel reflects the new value afterward

### Requirement: Cloud actions require an opt-in
The system SHALL allow cloud AI providers only when the user has enabled cloud in Settings; while disabled, cloud providers are not selectable and cloud requests are refused with an explanation. The cloud classification used for the gate SHALL come from the gateway's per-provider `cloud` flag (derived from the base URL), not from a front-end table.

#### Scenario: Cloud disabled hides provider
- **WHEN** the cloud toggle is off
- **THEN** cloud providers are absent from the selectable list and local providers remain

#### Scenario: Cloud request blocked while disabled
- **WHEN** a request would go to a cloud provider while cloud is disabled
- **THEN** the action is refused and the user is told how to enable it

#### Scenario: Offline mode hides cloud custom providers
- **WHEN** cloud opt-in is off and a custom provider points to `https://api.deepseek.com/v1`
- **THEN** that provider is hidden from selection
