## Purpose

Defines a single application settings surface: a tabbed Settings modal and one persisted config object that is the source of truth for language, theme, file-appearance defaults, AI defaults, and import/export.

## ADDED Requirements

### Requirement: A tabbed settings modal
The system SHALL provide a modal Settings dialog, openable from the toolbar and the quick launcher, organized into General, File, AI and Advanced sections.

#### Scenario: Open settings
- **WHEN** the user activates the settings control
- **THEN** the modal opens with the sections selectable as tabs
- **AND** each section shows the current configured values

### Requirement: A single persisted config is the source of truth
The system SHALL keep all user preferences in one config object persisted via the Tauri store plugin, and components SHALL read and write it rather than keeping their own copies.

#### Scenario: A change persists and applies
- **WHEN** the user changes any setting
- **THEN** the value is persisted and the affected UI updates immediately
- **AND** after relaunch the value is still applied

#### Scenario: Store unavailable falls back
- **WHEN** the native store is not available
- **THEN** the same config persists via local storage without breaking the UI

#### Scenario: Upgrade from legacy keys
- **WHEN** the app first starts with existing legacy per-key preferences but no unified config
- **THEN** those values are migrated into the unified config

### Requirement: General settings (language and theme)
The system SHALL let the user choose the interface language and the theme, with "follow system" as a theme option.

#### Scenario: Choose language
- **WHEN** the user selects Italian
- **THEN** the interface switches to Italian and the choice persists

#### Scenario: Follow system theme
- **WHEN** the theme is set to follow system
- **THEN** the app uses the operating system light/dark preference

### Requirement: File and appearance defaults
The system SHALL let the user set defaults for view mode, sort, hidden-file visibility, and whether destructive operations require confirmation.

#### Scenario: Default view applies
- **WHEN** the default view is set to grid
- **THEN** newly opened folders show the grid layout

#### Scenario: Disable destructive confirmation
- **WHEN** confirm-destructive is turned off
- **THEN** trash/move actions apply without the confirmation step

### Requirement: AI settings live here
The system SHALL manage the default AI provider, default model, gateway health, and a cloud-enable toggle within the AI section.

#### Scenario: Pick default model
- **WHEN** the user chooses a provider and a model
- **THEN** AI actions use that provider/model by default everywhere in the app

#### Scenario: Show gateway health
- **WHEN** the AI settings tab is opened
- **THEN** the gateway/provider reachability status is displayed

### Requirement: Export, import and reset
The system SHALL allow exporting the whole config as a JSON file, importing it back, and resetting to defaults.

#### Scenario: Round trip
- **WHEN** the user exports the config and later imports the same file
- **THEN** all settings are restored to the exported values

#### Scenario: Reject malformed import
- **WHEN** the user imports invalid or non-JSON content
- **THEN** the import is rejected with a message and current settings are left unchanged
