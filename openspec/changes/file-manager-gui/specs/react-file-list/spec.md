## Purpose
Allows users to browse and select files in the File Manager interface with multi-selection support.

## ADDED Requirements

### Requirement: File list displays files with name, size, and kind
The system SHALL display a list of files with their name, size, and file kind/kype.

#### Scenario: File list renders correctly
- **WHEN** the file list component mounts with a non-empty file array
- **THEN** each file is displayed with its name, size, and kind visible

#### Scenario: File list handles empty file array
- **WHEN** the file list component mounts with an empty file array
- **THEN** a placeholder message "No files" is displayed

### Requirement: File list supports Cmd+Click multi-selection
The system SHALL allow users to toggle individual file selection using Cmd+Click (or Meta+Click on macOS).

#### Scenario: Cmd+Click toggles selection
- **WHEN** user Cmd+Clicks a file that is already selected
- **THEN** the file is deselected from the selection set
- **WHEN** user Cmd+Clicks a file that is not selected
- **THEN** the file is added to the selection set

### Requirement: File list supports Shift+Click range selection
The system SHALL allow users to select a range of files using Shift+Click.

#### Scenario: Shift+Click selects range from last selected to clicked
- **WHEN** user has at least one file previously selected (via Cmd+Click)
- **AND** user Shift+Clicks another file
- **THEN** all files between the first selected and the clicked file are selected

### Requirement: File list displays selection count
The system SHALL display the number of selected files in the UI.

#### Scenario: Selection count updates when files are selected/deselected
- **WHEN** user selects or deselects files via Cmd+Click or Shift+Click
- **THEN** the selection count in the header updates to reflect the current selection
