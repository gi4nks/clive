## Purpose

Give Clive a self-managed recycle bin whose popover offers a per-item context
menu to restore (undo) a single item to its original location or permanently
delete it, with reliable original-path tracking.

## ADDED Requirements

### Requirement: Per-item context menu in the Trash
The system SHALL provide a context menu on each item in the Trash popover with
Restore, Open, Reveal in Finder, Copy original path, and Delete immediately.

#### Scenario: Restore a single item
- **WHEN** the user right-clicks a trashed file and chooses Restore
- **THEN** the item is returned to its original location and removed from the list

#### Scenario: Delete a single item immediately
- **WHEN** the user chooses Delete immediately on a trashed item
- **THEN** that item is permanently removed and the rest of the trash is untouched

### Requirement: Deletions are recorded with their original location
The system SHALL move items deleted through Clive into Clive's own trash and
record each item's original path so it can be restored there.

#### Scenario: Restore to where it came from
- **WHEN** a file deleted from `/a/b/x.txt` is restored
- **THEN** it reappears at `/a/b/x.txt` (recreating `/a/b` if it was removed)

#### Scenario: Never clobber an existing path
- **WHEN** the original location is already occupied at restore time
- **THEN** the item is restored under a `name (restored N)` variant instead of overwriting

### Requirement: Empty clears Clive's trash
The system SHALL empty Clive's trash (permanently deleting every item and
clearing the journal) when the user confirms "Empty Trash".

#### Scenario: Empty after confirmation
- **WHEN** the user empties the Trash and confirms
- **THEN** all items are permanently removed and the list becomes empty
