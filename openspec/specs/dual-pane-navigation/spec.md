# dual-pane-navigation Specification

## Purpose
Defines a dual-pane file browser so a transfer between two folders is one gesture: two equivalent, independently navigable panes, an active-pane model, per-pane "Go to…" navigation, in-app drag-to-transfer, and "Copy to… / Move to…" commands as the no-drag path.

## Requirements

### Requirement: Two independent file panes
The system SHALL present two equivalent file panes (left and right), each with its own path, selection, view mode, sort, and search, so two folders are visible at the same time.

#### Scenario: Each pane navigates on its own
- **WHEN** the user opens a folder in one pane
- **THEN** only that pane changes directory
- **AND** the other pane keeps showing its folder
- **AND** a failed listing does not show entries from the previous path in the navigated pane
- **AND** a late response from an older navigation does not replace the latest listing

#### Scenario: Initial folders
- **WHEN** the app opens in dual-pane mode
- **THEN** the left pane shows the last folder and the right pane shows that folder's parent

### Requirement: A single active pane
The system SHALL track one active pane that receives keyboard navigation, toolbar actions and AI actions, and SHALL let the user switch the active pane.

#### Scenario: Switch active pane
- **WHEN** the user clicks the other pane or presses the pane-switch shortcut
- **THEN** that pane becomes active and is visually indicated
- **AND** subsequent keyboard navigation and actions target it

### Requirement: In-app drag to transfer
The system SHALL allow dragging the selection from one pane and dropping it on the other pane's folder to transfer it, moving by default and copying when the Option modifier is held during the drop.

#### Scenario: Move by drag
- **WHEN** the user drags a selection onto the other pane and releases without Option
- **THEN** the files are moved into the destination folder and both panes refresh

#### Scenario: Copy by drag with Option
- **WHEN** the user drops while holding Option
- **THEN** the files are copied instead of moved, leaving the originals in place

#### Scenario: Same-pane drop is ignored
- **WHEN** the user drops a selection back into the pane it came from
- **THEN** no transfer occurs

### Requirement: Transfers never clobber
The system SHALL, on any transfer, avoid overwriting an existing destination name by producing a unique destination name, and SHALL verify each source still exists before moving or copying it.

#### Scenario: Name collision on drop
- **WHEN** the destination already contains an item with the same name
- **THEN** the transferred item is stored under a generated unique name and the existing file is untouched

### Requirement: No-drag transfer commands
The system SHALL provide "Copy to…" and "Move to…" commands (context menu and status-bar actions) that transfer the selection to a chosen destination folder, and a shortcut that sends the active pane's selection to the other pane's current folder.

#### Scenario: Copy to a chosen folder
- **WHEN** the user chooses "Copy to…" and selects a destination
- **THEN** the selected items are copied into that destination

#### Scenario: Send to other pane
- **WHEN** the user invokes the "send to other pane" shortcut with a selection
- **THEN** the selection is moved (or copied with Option) into the other pane's current folder

### Requirement: Per-pane Go to with places and recents
Each pane SHALL offer a "Go to" control that navigates that pane to a common location (Home, Desktop, Documents, Downloads, Pictures, Music), a recent location, or the parent folder, replacing the always-on sidebar.

#### Scenario: Navigate a pane to a place
- **WHEN** the user picks a place from a pane's "Go to" menu
- **THEN** only that pane navigates to it

### Requirement: Dual-pane strings are localized
The system SHALL expose all dual-pane labels and messages (Copy to, Move to, Go to, swap, drop hints, transfer failures) through the translation layer, defaulting to English.

#### Scenario: English default
- **WHEN** the UI language is English
- **THEN** the pane and transfer labels are shown in English
