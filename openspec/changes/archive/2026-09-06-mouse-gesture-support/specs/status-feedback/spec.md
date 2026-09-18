## Purpose

Defines transient, non-blocking feedback for the result of user operations, shown as an auto-dismissing toast.

## ADDED Requirements

### Requirement: Operation results are shown as a toast
The system SHALL display a brief, auto-dismissing toast communicating the outcome of operations such as copy, cut, paste, new folder, move to Trash, and clipboard clear.

#### Scenario: Success feedback
- **WHEN** an operation completes successfully
- **THEN** a toast appears with a success style
- **AND** it disappears automatically after a few seconds without user action

#### Scenario: Error feedback
- **WHEN** an operation fails
- **THEN** a toast appears with an error style containing the message

### Requirement: Background refresh stays silent
The periodic directory refresh SHALL NOT emit a toast on each cycle.

#### Scenario: Poll does not spam toasts
- **WHEN** the directory auto-refresh runs every couple of seconds
- **THEN** no toast is shown for a successful refresh

### Requirement: Toasts do not block interaction
The toast SHALL be non-modal and positioned so it does not intercept clicks on the content beneath it.

#### Scenario: Interaction continues
- **WHEN** a toast is visible
- **THEN** the user can still click and scroll the file list
