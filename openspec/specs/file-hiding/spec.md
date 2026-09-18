# file-hiding Specification

## Purpose
Defines the global, persisted visibility of hidden files and how it affects directory listing, element count, and the periodic auto-refresh.

## Requirements

### Requirement: Hidden-files visibility is a global persisted setting
The system SHALL maintain a single global boolean state for showing hidden files, defaulting to false, and persist it to `localStorage`.

#### Scenario: Default is hidden off
- **WHEN** the application starts and no stored preference exists
- **THEN** hidden files are not shown

#### Scenario: Setting persists across restarts
- **WHEN** the user enables hidden files and later reloads the application
- **THEN** hidden files remain enabled

### Requirement: Listing honors the hidden-files state
The directory listing SHALL include dot-prefixed files only when the hidden-files state is enabled.

#### Scenario: Hidden files excluded by default
- **WHEN** the hidden-files state is false and a folder is listed
- **THEN** entries whose names begin with `.` are omitted

#### Scenario: Hidden files included when enabled
- **WHEN** the hidden-files state is true and a folder is listed
- **THEN** entries whose names begin with `.` are included

### Requirement: Element count reflects the visible listing
The element count shown in the status bar SHALL match the number of elements after the hidden-files filter is applied.

#### Scenario: Count changes with the toggle
- **WHEN** the hidden-files state is toggled
- **THEN** the reported element count updates to match the newly filtered listing

### Requirement: Auto-refresh uses the current hidden-files state
The periodic directory refresh SHALL apply the current hidden-files state each time it runs.

#### Scenario: Background poll keeps the setting
- **WHEN** the periodic refresh runs while hidden files are enabled
- **THEN** the refreshed listing continues to include hidden files
