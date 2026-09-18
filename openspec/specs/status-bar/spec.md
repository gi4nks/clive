# status-bar Specification

## Purpose
Defines the contextual bottom status bar: a three-zone dock composed from an extensible widget registry, including contextual quick actions, inline search, clipboard progress, element count, keyboard focus model, responsive overflow, and accessibility.

## Requirements

### Requirement: StatusBar replaces the footer with three zones
The system SHALL render a bottom status bar (height `h-8`) composed of a left zone, a center zone, and a right zone, replacing the previous plain footer.

#### Scenario: StatusBar renders on startup
- **WHEN** the application window loads
- **THEN** a status bar is visible at the bottom of the window
- **AND** it contains a left cluster, a flexible center cluster, and a right cluster
- **AND** the previous footer text is no longer shown

### Requirement: Elements are rendered from a widget registry
The system SHALL compose the status bar from a registry where each widget declares an `id`, a `placement` (`left` | `center` | `right`), an `order`, a `Component`, and an optional `visible` predicate.

#### Scenario: Widget ordering within a zone
- **WHEN** the status bar renders a zone
- **THEN** widgets assigned to that zone appear sorted by ascending `order`
- **AND** widgets whose `visible(ctx)` returns false are omitted

#### Scenario: Adding a widget without changing the shell
- **WHEN** a new widget is added to the registry with a placement and order
- **THEN** it renders in the correct zone without any change to the status bar shell code

### Requirement: Left zone shows element and selection count
The system SHALL display the number of visible elements and, when non-zero, the number of selected elements in the left cluster.

#### Scenario: Count reflects visible files
- **WHEN** the current folder contains N visible elements
- **THEN** the left cluster shows "N element" (singular) or "N elementi" (plural) in Italian
- **AND** when zero elements are selected the selection count is not shown
- **AND** when M elements are selected the count "M selezionati" is shown

### Requirement: Contextual quick actions reflect selection and folder
The status bar SHALL expose a contextual quick-actions widget whose buttons are derived from the same action set used by the right-click context menu, based on the current selection and the current folder.

#### Scenario: Actions for a single selected file
- **WHEN** exactly one file is selected
- **THEN** the widget offers a compact set including Open, Show in Finder, Copy, Cut, Rename, and Move to Trash

#### Scenario: Actions for multiple selected files
- **WHEN** more than one file is selected
- **THEN** Rename is not offered
- **AND** Copy, Cut, and Move to Trash are offered for the whole selection

#### Scenario: Actions when nothing is selected
- **WHEN** no file is selected
- **THEN** folder-level actions such as New Folder are offered
- **AND** file-specific actions are disabled or hidden

#### Scenario: Overflow reuses the context menu
- **WHEN** the available actions exceed the inline capacity
- **THEN** an overflow control reveals the full context menu anchored to the status bar
- **AND** the actions shown are identical to those of the right-click context menu

### Requirement: Inline search filters the current listing
The center zone SHALL contain a search box that filters the current directory listing by file name.

#### Scenario: Typing filters entries
- **WHEN** the user types text into the search box
- **THEN** the file list shows only entries whose name contains the text (case-insensitive)
- **AND** the hidden-file setting and current sort remain in effect

#### Scenario: Clearing the search
- **WHEN** the user clears the search box (via a clear control or Escape)
- **THEN** the full listing is shown again

#### Scenario: Filter survives background refresh
- **WHEN** the periodic directory refresh replaces the entries while a search query is present
- **THEN** the filter is applied to the refreshed entries without losing the query

### Requirement: Clipboard progress chip
The center zone SHALL show a clipboard chip when the internal clipboard holds files or a paste operation is running.

#### Scenario: Chip shows pending clipboard
- **WHEN** files have been copied or cut
- **THEN** a chip indicates the count and the pending operation
- **AND** clicking the chip clears the internal clipboard

#### Scenario: Chip hidden when idle
- **WHEN** the clipboard is empty and no paste is running
- **THEN** the clipboard chip is not shown

### Requirement: Right-zone widget order
The right cluster SHALL present widgets in a stable order from left to right: Trash, Disk, Calendar, Clock, Quick Launcher.

#### Scenario: Ordering is fixed
- **WHEN** the status bar renders the right cluster
- **THEN** the widgets appear in the order Trash, Disk, Calendar, Clock, Quick Launcher

### Requirement: Keyboard focus model separates list navigation from bar controls
The system SHALL route list-scoped navigation keys (Arrow Up/Down, Space, Enter, Delete/Backspace) only when focus is on the body or the file list, and SHALL NOT trigger them when a status-bar control has focus.

#### Scenario: Space on a focused bar button
- **WHEN** a status-bar control has keyboard focus and the user presses Space
- **THEN** the focused control is activated
- **AND** Quick Look is not triggered

#### Scenario: Escape closes overlays and blurs
- **WHEN** the user presses Escape while a status-bar popover or menu is open
- **THEN** the overlay closes and focus returns to the invoking control

### Requirement: Responsive overflow for narrow windows
The status bar SHALL collapse right-zone widgets into an overflow control when the available width is insufficient.

#### Scenario: Narrow window collapses widgets
- **WHEN** the window width is below the configured threshold
- **THEN** lower-priority right-zone widgets collapse into an overflow control
- **AND** the search box collapses to an expandable icon

### Requirement: Status bar controls are accessible
Every interactive status-bar control SHALL expose an accessible name and, for toggles that open overlays, an expanded state.

#### Scenario: Buttons have accessible names
- **WHEN** a screen reader inspects a status-bar control
- **THEN** it reports a localized (Italian) accessible name
- **AND** controls that open a popover expose `aria-expanded` reflecting their state
