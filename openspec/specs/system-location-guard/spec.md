# system-location-guard Specification

## Purpose
Prevent accidental destructive operations (rename, move-to-trash, move-away) on
macOS system locations by default, enforced authoritatively at the backend and
surfaced in the UI, with a Settings toggle for users who need to opt out.

## Requirements

### Requirement: System locations are protected by default
The system SHALL treat macOS top-level system directories (and everything under
`/System`) as protected, and SHALL block rename, move-to-trash and move operations
whose target is protected while protection is enabled.

#### Scenario: Trash refused on a protected folder
- **WHEN** protection is on and the user moves `/Applications` to the Trash
- **THEN** the operation is refused with a message naming it a protected system location
- **AND** the filesystem is unchanged

#### Scenario: Child of a protected root is still editable
- **WHEN** protection is on and the user deletes `/Applications/SafariCopy.app`
- **THEN** the delete is allowed (subject to the destructive confirmation) because only the top-level entry is protected

#### Scenario: /System is protected recursively
- **WHEN** the user tries to rename a path under `/System`
- **THEN** the operation is refused, since the whole `/System` subtree is protected

### Requirement: Protection is normalized against traversal
The system SHALL compare paths lexically-normalized and case-insensitively so a
protected location cannot be reached through `..`, `.`, duplicate slashes, case
differences or a trailing slash.

#### Scenario: Case-insensitive match
- **WHEN** the user renames `/applications`
- **THEN** it is refused as protected

### Requirement: Batch moves are all-or-nothing
When a batch move includes any protected source while protection is on, the system
SHALL reject the entire batch before performing any filesystem change.

#### Scenario: One protected source aborts the batch
- **WHEN** the user moves a selection containing `/usr` together with a normal folder
- **THEN** no item is moved and the operation is refused

### Requirement: Users may opt out in Settings
The system SHALL expose a default-on "Protect macOS system locations" preference;
when disabled, the blocked operations become permitted, and disabling it SHALL ask
for confirmation.

#### Scenario: Turning protection off warns
- **WHEN** the user unchecks the protection toggle in Settings
- **THEN** a confirmation is shown before the change is applied
- **AND** once off, renaming/deleting a system location is allowed
