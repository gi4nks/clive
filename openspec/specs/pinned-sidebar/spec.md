# pinned-sidebar Specification

## Purpose
Defines a collapsible, user-editable left sidebar of favourite locations (pinned files and folders, alongside fixed system places), which navigates the active file pane and acts as a drop target, and can be collapsed to a thin vertical rail to save space.

## Requirements

### Requirement: A left sidebar with places and pinned items
The system SHALL show a sidebar that lists fixed system places and a user-editable list of pinned locations, which may be folders or files.

#### Scenario: Sidebar lists both groups
- **WHEN** the app opens with a sidebar expanded
- **THEN** a "Places" group (e.g. Home, Desktop, Documents) is shown
- **AND** a separate group shows the user's pinned items in order

### Requirement: Pinning and unpinning locations
The system SHALL let the user add a location (folder or file) to the sidebar from a picker, the selection's context menu, or by dropping onto the sidebar, and SHALL let the user remove a pinned item; fixed places cannot be removed.

#### Scenario: Add a folder by dropping it on the sidebar
- **WHEN** the user drops a folder onto the sidebar's pinned area
- **THEN** that folder appears as a new pinned item

#### Scenario: Reject duplicate pin
- **WHEN** the user pins a location that is already pinned
- **THEN** no duplicate entry is added

#### Scenario: Unpin a location
- **WHEN** the user invokes "Unpin" on a pinned item
- **THEN** the item is removed from the sidebar and the choice persists across restarts

### Requirement: Reordering pinned items
The system SHALL let the user reorder the pinned items and persist that order.

#### Scenario: Drag to reorder
- **WHEN** the user drags one pinned item to a new position
- **THEN** the sidebar shows the items in the new order after restart

### Requirement: Sidebar navigates the active pane
The system SHALL, when a sidebar entry is activated, drive the currently active pane: folders navigate the pane to that folder, files are opened or revealed.

#### Scenario: Click a place navigates the active pane
- **WHEN** the user clicks a sidebar place or pinned folder
- **THEN** the active pane shows that folder
- **AND** the other pane is unchanged

### Requirement: Sidebar as a transfer target
The system SHALL let the user transfer a selection by dropping it onto a pinned or place entry; a folder row transfers into that folder, and a file row transfers into the file's parent folder.

#### Scenario: Drop a selection onto a pinned folder
- **WHEN** the user drops selected files onto a pinned folder row
- **THEN** the files are moved into that folder (Option held copies) using unique destination names

### Requirement: Collapse to a rail
The system SHALL let the user collapse the sidebar to a thin vertical rail that has no per-item icons, and re-expand it via a control or keyboard shortcut, persisting the collapsed/expanded choice.

#### Scenario: Collapse then it is a thin rail
- **WHEN** the user collapses the sidebar
- **THEN** only a narrow rail with an expand affordment is shown, reclaiming horizontal space for the panes

#### Scenario: Expanded state persists
- **WHEN** the user restarts the app after collapsing the sidebar
- **THEN** the sidebar is still collapsed

### Requirement: Sidebar strings are localized
The system SHALL expose all sidebar labels (add, unpin, expand, collapse, section titles and confirmations) through the translation layer, defaulting to English.

#### Scenario: English labels by default
- **WHEN** the UI language is English
- **THEN** the sidebar labels are shown in English
