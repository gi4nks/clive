## MODIFIED Requirements

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
