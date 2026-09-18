# quick-launcher Specification

## Purpose
Defines the quick-launcher menu at the far right of the status bar, providing access to "Open Terminal here" and the hidden-files toggle. The theme control is intentionally not duplicated here.

## Requirements

### Requirement: Launcher menu present at far right
The system SHALL place a quick-launcher control at the far right end of the status bar that opens a menu of shortcuts.

#### Scenario: Launcher opens its menu
- **WHEN** the user clicks the launcher control
- **THEN** a menu appears with the available shortcuts

### Requirement: Open Terminal here
The launcher menu SHALL contain an action that opens the macOS Terminal at the current folder.

#### Scenario: Opening a terminal in the current folder
- **WHEN** the user selects "Open Terminal here"
- **THEN** Terminal is opened for the current directory path via the `open_terminal` command
- **AND** a failure is reported through the status message

### Requirement: Toggle hidden files
The launcher menu SHALL contain an action that toggles visibility of hidden files.

#### Scenario: Toggling hidden files
- **WHEN** the user selects "Toggle hidden files"
- **THEN** the hidden-files visibility state is flipped
- **AND** the current listing is refreshed to reflect the new state

### Requirement: Theme control is not in the launcher
The launcher menu SHALL NOT include a theme selector, because theme control remains solely in the top toolbar.

#### Scenario: No theme entry in launcher
- **WHEN** the launcher menu is opened
- **THEN** no theme option is present in the menu
