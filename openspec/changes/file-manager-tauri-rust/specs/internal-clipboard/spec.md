## Purpose

Internal, in-application clipboard state that tracks which files are pending a copy or move, used by paste operations. This is separate from the system clipboard.

## ADDED Requirements

### Requirement: Track pending files and the pending operation
The system SHALL store a set of file paths with a pending operation (`copy` or `move`) that survives across commands for the lifetime of the app state.

#### Scenario: Copy paths sets a copy operation
- **WHEN** `copy_paths` is invoked with a list of paths
- **THEN** those paths are stored as the clipboard contents
- **AND** the pending operation is recorded as `copy`

#### Scenario: Cut paths sets a move operation
- **WHEN** `cut_paths` is invoked with a list of paths
- **THEN** those paths are stored and the pending operation is recorded as `move`

### Requirement: Report clipboard contents
The system SHALL expose the current clipboard paths and the pending operation for inspection by the frontend.

#### Scenario: Clipboard info
- **WHEN** `clipboard_info` is invoked
- **THEN** it returns the stored paths and the current operation, or an empty set and null operation when nothing is pending

### Requirement: Paste into a target directory
The system SHALL copy or move the stored files into a target directory according to the pending operation.

#### Scenario: Paste with a name collision produces a unique name
- **WHEN** pasting and the destination already contains an item with the same name
- **THEN** the pasted item is written under a generated unique name such as `name copy 1.ext`
- **AND** the original destination is not overwritten

#### Scenario: Empty clipboard paste is rejected
- **WHEN** `paste_paths` is invoked while the clipboard is empty
- **THEN** the command returns an error

### Requirement: Move clears the clipboard, copy retains it
The system SHALL clear the clipboard after a move paste and retain it after a copy paste.

#### Scenario: Move clears
- **WHEN** a `move` paste completes
- **THEN** the clipboard is emptied

#### Scenario: Copy retains
- **WHEN** a `copy` paste completes
- **THEN** the clipboard contents remain for repeated pasting

### Requirement: Clipboard can be cleared on demand
The system SHALL allow the clipboard to be explicitly cleared.

#### Scenario: Clear clipboard
- **WHEN** `clear_clipboard` is invoked
- **THEN** the stored paths and operation are reset
