## Purpose

Defines how `@gi4nks/wise` runs in the webview through the gateway: model construction, structured and streaming calls, cancellation, and input budgeting before anything is sent to a model.

## ADDED Requirements

### Requirement: Build models through the gateway
The system SHALL construct AI models via `wise`'s `createAIModel`, pointing the provider's endpoint at the loopback gateway so all traffic is uniform.

#### Scenario: OpenAI-compatible path
- **WHEN** an action needs a model
- **THEN** it obtains a model whose base endpoint is the gateway and whose credential is a placeholder

### Requirement: Structured and streaming calls
The system SHALL support a structured call that returns a schema-validated object and a streaming call that can drive tools.

#### Scenario: Structured result
- **WHEN** an action requests structured output against a schema
- **THEN** the result is validated against that schema before use

#### Scenario: Tool-driven streaming
- **WHEN** an assistant request provides filesystem tools
- **THEN** the model may call those tools during a streamed response

### Requirement: Calls are cancellable
Every AI call SHALL accept a cancellation signal that aborts the in-flight request and its streaming.

#### Scenario: Abort closes work
- **WHEN** the user closes an action's panel while its call is running
- **THEN** the call is aborted and no result is applied

### Requirement: Input is budgeted before prompting
The system SHALL bound the amount of file content sent to a model, truncating oversized text with an explicit marker and representing binary or oversized files by metadata only (unless a vision-capable model handles images).

#### Scenario: Large file truncated
- **WHEN** a selected file exceeds the byte budget
- **THEN** only a truncated excerpt plus a truncation marker is included

#### Scenario: Binary file summarized by metadata
- **WHEN** a non-text file is included and no vision model is active
- **THEN** only its name and metadata are described to the model
