# ai-feature-toggle Specification

## Purpose

Defines the persisted master switch that controls whether Clive's AI features can run and where they appear in the interface.

## Requirements

### Requirement: Persist a master AI setting

The system SHALL store one boolean AI-enabled setting in the application configuration. Existing configurations without this value SHALL default to enabled, preserving their current behavior. The setting SHALL participate in configuration import and export.

#### Scenario: Upgrade an existing configuration

- **WHEN** Clive loads a configuration created before this setting existed
- **THEN** AI features remain enabled

### Requirement: Hide AI entry points while disabled

When AI is disabled, the system SHALL hide the AI status-bar widget and chat button, AI actions in file context menus, and AI chat, plan, activity, and debug surfaces. Non-AI file operations and provider settings SHALL remain available.

#### Scenario: Disable AI from Settings

- **WHEN** the user disables AI in Settings
- **THEN** AI controls disappear immediately while Settings remains usable to re-enable AI

### Requirement: Block requests and cancel active generation

When AI is disabled, the system SHALL reject new chat messages, AI actions, chat-proposed applies, and plan generation. Disabling AI while a generation is active SHALL abort that generation and close open AI surfaces.

#### Scenario: Disable during generation

- **WHEN** the user disables AI while a chat, quick action, or plan is generating
- **THEN** the active generation is cancelled and no later AI request can start until the setting is enabled again

#### Scenario: Invoke a stale AI control

- **WHEN** an AI action callback was retained before the setting was disabled
- **THEN** it does not start an AI request or apply a chat-proposed operation
