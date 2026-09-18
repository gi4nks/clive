## Purpose

Defines backend commands that power open and preview actions from the context menu and keyboard: opening an item with its default application and showing a macOS Quick Look preview.

## ADDED Requirements

### Requirement: Open a path with the default application
The system SHALL expose an `open_path(path)` command that opens the given file or folder with its default application.

#### Scenario: Open a file
- **WHEN** `open_path` is invoked with a file
- **THEN** the file is opened with its default application via the native open facility

#### Scenario: Failure is reported
- **WHEN** the open operation cannot be completed
- **THEN** the command returns an error

### Requirement: Show a Quick Look preview
The system SHALL expose a `quick_look(path)` command that shows a macOS Quick Look preview for the given file.

#### Scenario: Preview a file
- **WHEN** `quick_look` is invoked with a file path
- **THEN** a Quick Look preview is shown
- **AND** the command suppresses the helper's stdout/stderr noise

#### Scenario: Preview failure
- **WHEN** the preview cannot be shown
- **THEN** the command returns an error

### Requirement: Commands are registered
Both commands SHALL be registered with the Tauri application so the frontend can invoke them by name.

#### Scenario: Invocation resolves
- **WHEN** the frontend invokes `open_path` or `quick_look`
- **THEN** the registered handler runs
