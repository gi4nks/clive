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

### Requirement: file_info returns metadata for a filesystem path
The system SHALL expose a read-only `file_info(path)` command that reports the name, path, item kind, file byte size or recursive directory size, direct directory child count, modification and creation timestamps when available, and permissions. Directory size SHALL sum regular files without following symbolic links.

#### Scenario: Inspect a file
- **WHEN** `file_info` is invoked for an existing file
- **THEN** it returns the file's byte size and available timestamps and permissions

#### Scenario: Inspect a directory
- **WHEN** `file_info` is invoked for an existing directory
- **THEN** it returns the recursive regular-file size, direct child count, and available timestamps and permissions

#### Scenario: Inspect a path on an unavailable mount
- **WHEN** `file_info` is invoked for a path under a disconnected mounted volume
- **THEN** it returns an error without recreating or mutating the mount path

### Requirement: disk_space reports volume usage for a path
The system SHALL expose a `disk_space(path)` command returning total, free, and used bytes and the volume name for the filesystem containing `path`.

#### Scenario: Space is reported for the containing volume
- **WHEN** `disk_space` is called with a path on a mounted volume
- **THEN** the returned values describe that volume's total, free, and used bytes
- **AND** the volume name is included

#### Scenario: Robust parsing for spaces and long names
- **WHEN** the path or device name contains spaces or is unusually long
- **THEN** the command still resolves a single, correct usage entry

### Requirement: Filesystem writes reject disconnected volume paths
Filesystem mutations and metadata operations under `/Volumes/<name>` SHALL verify that the mount is present before touching the path. A missing mount path SHALL NOT be recreated on the boot volume.

#### Scenario: A volume is disconnected
- **WHEN** an operation targets a path under an unmounted `/Volumes/<name>`
- **THEN** the command returns a not-connected error
- **AND** it does not create or modify the mount directory on the boot volume

### Requirement: Disconnect only mounted network volumes
The `disconnect_volume(path)` command SHALL accept only a visible, currently mounted network volume whose mount point is a direct child of `/Volumes`.

#### Scenario: Disconnect an SMB volume
- **WHEN** the path identifies a listed mounted network volume directly under `/Volumes`
- **THEN** Clive requests that macOS unmount that volume

#### Scenario: Reject local, hidden, nested, or unmounted paths
- **WHEN** the path does not identify a listed mounted network volume directly under `/Volumes`
- **THEN** the command returns an error without invoking `diskutil`

### Requirement: Validate volume paths before eject or disconnect
Volume paths SHALL reject traversal, nested mount paths, hidden names, and control characters before invoking macOS volume tools.

#### Scenario: Invalid volume path
- **WHEN** a path contains traversal, a nested component, a hidden name, or a control character
- **THEN** the command returns an error without invoking `diskutil`

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
