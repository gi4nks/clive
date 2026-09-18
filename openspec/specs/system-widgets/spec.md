# system-widgets Specification

## Purpose
Defines the persistent system widgets shown on the right of the status bar: an independent clock, a date-only calendar, current-volume disk usage, and a Trash widget that can be opened and emptied behind a confirmation.

## Requirements

### Requirement: Clock widget ticks in isolation
The system SHALL display the current time in the clock widget and update it on an interval without re-rendering the file list.

#### Scenario: Time updates over time
- **WHEN** the status bar is visible
- **THEN** the clock shows the current local time
- **AND** it updates periodically
- **AND** the file list is not re-rendered as a consequence of the tick

#### Scenario: Clock popover shows the full date
- **WHEN** the user clicks the clock widget
- **THEN** a popover appears showing the full current date (weekday, day, month, year)

### Requirement: Date-only calendar widget
The system SHALL provide a calendar widget that shows today's date and, on click, a month grid with the current day highlighted, without any event data.

#### Scenario: Calendar popover shows the current month
- **WHEN** the user clicks the calendar widget
- **THEN** a popover displays a month grid for the current month
- **AND** today's date is visually highlighted

#### Scenario: No events are shown or fetched
- **WHEN** the calendar popover is open
- **THEN** no calendar events are displayed or requested

### Requirement: Disk usage widget
The system SHALL show, for the volume containing the current folder, the used and total space, revealed in a popover.

#### Scenario: Disk popover reflects current volume
- **WHEN** the user clicks the disk widget
- **THEN** a popover shows a used/total proportion and the free space for the volume of the current path
- **AND** the values are obtained from the `disk_space` command

#### Scenario: Disk data fetched on demand
- **WHEN** the current folder changes
- **THEN** the disk information is refreshed for the new volume
- **AND** it is not polled on a tight loop

### Requirement: Trash widget shows contents
The system SHALL provide a Trash widget indicating the number of items in the macOS Trash and previewing its contents in a popover.

#### Scenario: Trash popover previews contents
- **WHEN** the user clicks the Trash widget
- **THEN** a popover lists a preview of the items in the Trash
- **AND** the contents are read by listing the Trash folder with hidden files included

#### Scenario: Trash count is cached
- **WHEN** the Trash widget is repeatedly rendered over a short period
- **THEN** the underlying Trash listing is cached (approximately every 30 seconds) rather than read on every render

### Requirement: Trash widget can open the Trash
The system SHALL offer an action that opens the macOS Trash in Finder.

#### Scenario: Open Trash
- **WHEN** the user selects "Open" from the Trash popover
- **THEN** the Trash folder is opened using the native open action

### Requirement: Trash widget can be emptied behind a confirmation
The system SHALL offer an "Empty Trash" action that only proceeds after an explicit confirmation, because the operation is irreversible.

#### Scenario: Empty requires confirmation
- **WHEN** the user selects "Empty Trash"
- **THEN** a confirmation dialog is shown warning that the action is irreversible
- **AND** the Trash is emptied only after the user confirms

#### Scenario: Cancel aborts emptying
- **WHEN** the user cancels the confirmation
- **THEN** no items are deleted from the Trash

#### Scenario: Empty refreshes the count
- **WHEN** the user confirms and the Trash is emptied
- **THEN** the Trash widget count updates to reflect the emptied Trash
