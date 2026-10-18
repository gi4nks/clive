# react-file-list Specification

## Purpose
Allows users to browse and select files in the File Manager interface with multi-selection support.

## Requirements

### Requirement: File list displays files with name, size, and kind
The system SHALL display a list of files with their name, size, and file kind/kype.

### Requirement: File list uses Clive's own file icons
The system SHALL draw file and folder icons with Clive-owned vector artwork.
Icons SHALL use a consistent, subdued visual style and distinct shapes or marks
for common file types and system folders. Card-mode icons SHALL use most of the
available 80px icon area instead of remaining at compact row size. Rendering SHALL be synchronous and
SHALL NOT replace icons with operating-system-provided images after the rows
appear.

#### Scenario: A directory listing renders Clive icons
- **WHEN** the file list contains files or folders
- **THEN** each row immediately displays Clive's vector icon for that item kind
- **AND** the icon does not change after the row appears

#### Scenario: A file type has a dedicated mark
- **WHEN** a file is a PDF, image, code file, document, spreadsheet, archive,
  media file, or other supported type
- **THEN** its Clive icon uses a distinctive mark while retaining the shared
  paper or media silhouette

#### Scenario: Card mode enlarges the item's icon
- **WHEN** the file list is shown in card mode
- **THEN** the Clive icon is rendered at 76×76 px inside its 80×80 px icon area
- **AND** category-specific artwork remains visible at that size

#### Scenario: File list renders correctly
- **WHEN** the file list component mounts with a non-empty file array
- **THEN** each file is displayed with its name, size, and kind visible

#### Scenario: File list handles empty file array
- **WHEN** the file list component mounts with an empty file array
- **THEN** a placeholder message "No files" is displayed

### Requirement: File list supports Cmd+Click multi-selection
The system SHALL allow users to toggle individual file selection using Cmd+Click (or Meta+Click on macOS).

#### Scenario: Cmd+Click toggles selection
- **WHEN** user Cmd+Clicks a file that is already selected
- **THEN** the file is deselected from the selection set
- **WHEN** user Cmd+Clicks a file that is not selected
- **THEN** the file is added to the selection set

### Requirement: File list supports Shift+Click range selection
The system SHALL allow users to select a range of files using Shift+Click.

#### Scenario: Shift+Click selects range from last selected to clicked
- **WHEN** user has at least one file previously selected (via Cmd+Click)
- **AND** user Shift+Clicks another file
- **THEN** all files between the first selected and the clicked file are selected

### Requirement: File list displays selection count
The system SHALL display the number of selected files in the UI.

#### Scenario: Selection count updates when files are selected/deselected
- **WHEN** user selects or deselects files via Cmd+Click or Shift+Click
- **THEN** the selection count in the header updates to reflect the current selection
