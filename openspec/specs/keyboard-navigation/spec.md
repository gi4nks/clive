# keyboard-navigation Specification

## Purpose
Defines keyboard interaction for browsing, selecting, activating, and invoking commands in the file manager.

## Requirements

### Requirement: Arrow keys move the selection
The system SHALL let Arrow Up and Arrow Down move the single selection through the sorted file list, keeping the selection scrolled into view.

#### Scenario: Arrow Down advances selection
- **WHEN** no modifier is held and the user presses Arrow Down
- **THEN** the selection moves to the next item and it is scrolled into view

#### Scenario: Selection clamps at the ends
- **WHEN** the last item is selected and the user presses Arrow Down
- **THEN** the selection stays on the last item

### Requirement: Home and End jump to the extremes
The system SHALL move the selection to the first item on Home and the last item on End.

#### Scenario: End selects the last item
- **WHEN** the user presses End
- **THEN** the last item in the current listing becomes selected

### Requirement: Space opens Quick Look
The system SHALL open a Quick Look preview for a single selected, non-directory file when Space is pressed.

#### Scenario: Preview selected file
- **WHEN** exactly one non-directory file is selected and the user presses Space
- **THEN** the `quick_look` command is invoked for that file

#### Scenario: Space ignored for folders or multi-selection
- **WHEN** the selection is empty, multiple, or a folder
- **THEN** Space does not open a preview

### Requirement: Standard shortcuts are supported
The system SHALL support copy, cut, paste, select-all, new folder, refresh, go-up, history navigation, path focus, Enter-to-open, and Delete-to-trash.

#### Scenario: Select all
- **WHEN** the user presses Cmd/Ctrl+A
- **THEN** all items in the current listing become selected

#### Scenario: Go up
- **WHEN** the user presses Cmd/Ctrl+ArrowUp or Cmd/Ctrl+D
- **THEN** the view navigates to the parent directory

#### Scenario: Enter opens a single selected item
- **WHEN** exactly one item is selected and the user presses Enter
- **THEN** a directory is opened as the new current folder and a file is revealed in Finder

### Requirement: Shortcuts do not fire while editing text
The system SHALL ignore global keyboard shortcuts while focus is in a text input, text area, or content-editable element.

#### Scenario: Typing in the path editor
- **WHEN** the path editor input has focus and the user types characters, including shortcuts like f or a
- **THEN** the global shortcut handlers do not run and the text is edited

### Requirement: Escape dismisses overlays and clears selection
The system SHALL close open modals and context menus and clear the selection when Escape is pressed.

#### Scenario: Escape closes dialogs
- **WHEN** a modal or the context menu is open and the user presses Escape
- **THEN** the overlay closes and focus is left in a neutral state

### Requirement: Command handlers use current state
Keyboard-invoked command handlers SHALL reference current component state and not capture stale values from prior renders.

#### Scenario: New folder uses the typed name
- **WHEN** the user types a folder name and confirms
- **THEN** the folder is created with exactly that name
