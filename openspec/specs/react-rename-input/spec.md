# react-rename-input Specification

## Purpose
Allows users to rename files inline with proper extension handling and keyboard support.

## Requirements

### Requirement: Rename input accepts user input
The system SHALL provide an input field for users to enter a new file name.

#### Scenario: Rename input opens with initial file name
- **WHEN** user clicks the rename button on a file
- **THEN** the rename input opens with the current file name pre-populated

### Requirement: Escape cancels rename without saving
The system SHALL close the rename input without saving when the user presses Escape.

#### Scenario: Escape cancels rename
- **WHEN** user presses Escape key while rename input is open
- **THEN** the rename input closes without saving changes
- **AND** the file name remains unchanged

### Requirement: Enter confirms rename
The system SHALL save the new file name when the user presses Enter.

#### Scenario: Enter confirms rename
- **WHEN** user presses Enter key while rename input has text
- **THEN** the new file name is applied to the file
- **AND** the rename input closes

### Requirement: Extension behavior on rename
The system SHALL preserve the original file extension when the user includes an extension in the new name, and remove the original extension when the user does not include one.

#### Scenario: Extension preserved when user includes extension
- **WHEN** user renames "image.png" to "photo.png"
- **THEN** the file is renamed to "photo.png" (extension included as entered)

#### Scenario: Extension removed when user omits extension
- **WHEN** user renames "image.png" to "photo"
- **THEN** the file is renamed to "photo" (original extension .png removed)
