## Purpose

Safe deletion that moves items to the macOS Trash (Cestino) rather than permanently deleting them.

## ADDED Requirements

### Requirement: Deletion moves items to the Trash
The system SHALL move a file or folder to the macOS Trash instead of deleting it permanently.

#### Scenario: Move to Trash
- **WHEN** `delete_to_trash` is invoked with an existing path
- **THEN** the item is moved to the Trash using the `trash` crate
- **AND** it is no longer present at its original location

#### Scenario: Failure is reported
- **WHEN** the item cannot be moved to the Trash
- **THEN** the command returns an error prefixed as a Trash failure and the item is left intact
