## Purpose

Defines the shared safety rules every AI-driven mutation must satisfy: proposal validation, collision handling, confirmation before applying, and batch undo. It backs rename, generate, and organize.

## ADDED Requirements

### Requirement: Proposed operations are validated
The system SHALL validate every AI-proposed name or destination against the same rules the filesystem command enforces — non-empty, no path separator, not `.` or `..` — and reject invalid proposals before applying.

#### Scenario: Reject an invalid name
- **WHEN** a proposed new name contains a slash or is empty
- **THEN** that operation is marked invalid and excluded from the applied batch

### Requirement: Collisions are handled
The system SHALL detect collisions within a proposed batch and against existing on-disk names, and resolve them deterministically (unique suffix) or flag them.

#### Scenario: In-batch duplicate names
- **WHEN** two proposals target the same new name
- **THEN** they are de-duplicated (one renamed with a unique suffix) or surfaced as conflicts

### Requirement: Target existence is re-checked on apply
The system SHALL re-validate, at apply time, that each target path still exists and matches expectation before mutating it.

#### Scenario: Stale target
- **WHEN** a selected path disappeared between proposal and apply
- **THEN** that operation is skipped and reported

### Requirement: Confirmation before any mutation
The system SHALL require an explicit confirmation, showing the concrete diff, before any rename, move, or create is executed.

#### Scenario: Cancel the confirmation
- **WHEN** the user dismisses the confirmation
- **THEN** no filesystem change is made

### Requirement: Batch operations are undoable
The system SHALL record the inverse operations of an applied batch and provide a single action that reverts it, reporting any partial failures.

#### Scenario: Undo a batch
- **WHEN** the user triggers undo after a batch applies
- **THEN** the inverse operations are executed and items return to their prior state
