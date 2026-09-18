# pane-collapse Specification

## Purpose
Let each dual-pane collapse into a thin vertical rail (mirroring the sidebar)
so only the panes in use take space, while keeping at least one pane visible
and the active one always usable.

## Requirements

### Requirement: Panes can collapse to a rail
The system SHALL let the user collapse either pane into a slim rail that shows a
chevron and the pane's folder name vertically, and SHALL let the user restore it.

#### Scenario: Collapse a pane from its header
- **WHEN** the user clicks the collapse chevron in a pane's header
- **THEN** that pane becomes a thin rail showing its folder name vertically

#### Scenario: Restore by clicking the rail
- **WHEN** the user clicks a collapsed pane's rail
- **THEN** the pane expands again and becomes active

### Requirement: At least one pane stays expanded
The system SHALL prevent collapsing a pane when the other pane is already
collapsed, and SHALL never leave the active pane collapsed.

#### Scenario: Cannot collapse when the other is a rail
- **WHEN** the right pane is collapsed and the user tries to collapse the left
- **THEN** the action is ignored and the left pane stays expanded

#### Scenario: Collapsing the active pane moves focus
- **WHEN** the active pane is collapsed while the other is expanded
- **THEN** focus moves to the other pane

### Requirement: Activating a collapsed pane expands it
The system SHALL re-expand a pane when it is activated via keyboard (`⌘1`/`⌘2`,
`Tab`) or by clicking its rail.

#### Scenario: Tab reopens a collapsed pane
- **WHEN** a pane is collapsed and the user presses `Tab` to switch to it
- **THEN** the pane expands and becomes active

### Requirement: Collapse state persists
The system SHALL remember which panes are collapsed across restarts, defaulting
to both expanded, and SHALL never start with the active pane collapsed.

#### Scenario: Focus shortcut toggles the inactive pane
- **WHEN** the user presses `⌘\`
- **THEN** the inactive pane collapses to a rail (or re-expands if it was collapsed)
