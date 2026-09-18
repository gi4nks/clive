## Purpose

Make the AI actions usable: route them through the gateway's Chat Completions
endpoint, and let the user configure provider base URL + API key from within the
app (persisted to a dotfile), so the feature works even when launched without
shell environment variables.

## ADDED Requirements

### Requirement: AI calls use the gateway's Chat Completions endpoint
The system SHALL call the gateway's `/v1/chat/completions` endpoint for AI
actions (not the Responses API), so model requests succeed against the
OpenCode-compatible providers.

#### Scenario: Summarize returns text
- **WHEN** the user runs "Summarize with AI" on a file with a working provider
- **THEN** the model reply is shown in the AI overlay instead of an instant failure

### Requirement: Provider credentials can be set in-app
The system SHALL let the user enter each provider's base URL and API key in
Settings → AI, persist them to `~/.clive/ai.env`, and apply them without a
restart, while still giving shell environment variables priority.

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
