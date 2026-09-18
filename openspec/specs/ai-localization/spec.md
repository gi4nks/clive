# ai-localization Specification

## Purpose
Defines how the AI layer interacts with language: model prompts and model responses are English, while AI-facing user copy (status messages, warnings, validation) flows through the same localization system.

## Requirements

### Requirement: Model prompts are English
The system SHALL send English instructions to the model for every AI action (rename, summarize/describe, generate, organize), independent of the UI language.

#### Scenario: Prompt language is fixed
- **WHEN** an AI action runs under any UI language
- **THEN** the prompt and system instruction sent to the model are in English

### Requirement: The assistant responds in English
The system SHALL instruct the model to produce its output (summaries, generated text) in English.

#### Scenario: Summary is English
- **WHEN** the user summarizes a file
- **THEN** the assistant's returned summary is in English

### Requirement: AI user-facing copy is localized
The system SHALL surface AI status, warnings, and validation messages (for example provider-unavailable, cloud "contents leave this machine", vision-blocked, and the AI validation reasons) through the translation system rather than as fixed literals.

#### Scenario: English default for AI messages
- **WHEN** the UI is in English and an AI action reports a result or error
- **THEN** that message is shown in English

#### Scenario: AI messages follow the selected language
- **WHEN** the UI language is Italian
- **THEN** the AI status and warning copy is shown in Italian while the model output stays English
