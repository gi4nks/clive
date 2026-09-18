# fs-commands Specification

## Purpose
Defines the backend Tauri command surface required by the status bar: an extended directory listing with hidden-file control, disk usage reporting, terminal launching, and Trash emptying.

## Requirements

### Requirement: list_dir supports an optional hidden-files flag
The `list_dir` command SHALL accept an optional `showHidden` argument defaulting to false, preserving existing behavior when omitted.

#### Scenario: Omitted flag excludes hidden files
- **WHEN** `list_dir` is invoked without `showHidden`
- **THEN** entries whose names begin with `.` are excluded

#### Scenario: Explicit flag includes hidden files
- **WHEN** `list_dir` is invoked with `showHidden` true
- **THEN** hidden entries are included in the result

### Requirement: disk_space reports volume usage for a path
The system SHALL expose a `disk_space(path)` command returning total, free, and used bytes and the volume name for the filesystem containing `path`.

#### Scenario: Space is reported for the containing volume
- **WHEN** `disk_space` is called with a path on a mounted volume
- **THEN** the returned values describe that volume's total, free, and used bytes
- **AND** the volume name is included

#### Scenario: Robust parsing for spaces and long names
- **WHEN** the path or device name contains spaces or is unusually long
- **THEN** the command still resolves a single, correct usage entry

### Requirement: open_terminal launches Terminal at a path
The system SHALL expose an `open_terminal(path)` command that opens Terminal.app at the given directory and reports failure as an error.

#### Scenario: Terminal opens at the directory
- **WHEN** `open_terminal` is called with a valid directory
- **THEN** Terminal is opened at that directory

#### Scenario: Failure is reported
- **WHEN** the terminal cannot be opened
- **THEN** the command returns an error

### Requirement: empty_trash empties the macOS Trash
The system SHALL expose an `empty_trash()` command that empties the Trash via the native mechanism and reports success or failure.

#### Scenario: Trash is emptied
- **WHEN** `empty_trash` succeeds
- **THEN** the Trash is emptied and success is returned

#### Scenario: Failure is reported
- **WHEN** emptying the Trash fails
- **THEN** the command returns an error

### Requirement: New commands are registered and build cleanly
The new commands SHALL be registered with the Tauri application and the project SHALL pass `cargo check` and `cargo clippy` without errors.

#### Scenario: Commands are invocable from the frontend
- **WHEN** the frontend invokes a new command by name
- **THEN** the command is registered and resolves
