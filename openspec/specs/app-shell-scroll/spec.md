# app-shell-scroll Specification

## Purpose
Defines the fixed-height application shell in which only internal panels scroll, so that mouse wheel, trackpad, and touch gestures act on the intended panel and never move the whole window.

## Requirements

### Requirement: Page does not scroll; internal panels do
The system SHALL keep the window content fixed to the viewport height, with the header, sidebar, and status bar fixed and only the file-list area and the sidebar able to scroll.

#### Scenario: Wheel over the file list scrolls only the list
- **WHEN** the user scrolls with a mouse wheel or trackpad over the file list
- **THEN** only the file list scrolls
- **AND** the header, sidebar, and status bar remain fixed

#### Scenario: Tall content does not grow the page
- **WHEN** a directory contains more items than fit the viewport
- **THEN** the items scroll inside the list area
- **AND** the overall page height is unchanged

### Requirement: Scroll chaining is contained
The system SHALL prevent scroll gestures from chaining from an inner scroll area to the page once the inner area reaches its boundary.

#### Scenario: Reaching the end does not scroll the window
- **WHEN** the file list is scrolled to its top or bottom edge
- **AND** the user continues scrolling
- **THEN** the surrounding layout does not scroll

### Requirement: Text selection in chrome is disabled but inputs work
The system SHALL prevent accidental text selection of non-editable chrome while keeping text input fields selectable and editable.

#### Scenario: Chrome is not selectable
- **WHEN** the user drags across file rows or the header
- **THEN** no text is selected

#### Scenario: Input fields remain editable
- **WHEN** the user focuses a text field (for example the path editor or rename box)
- **THEN** text can be selected and edited normally
