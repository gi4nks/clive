# context-menu Specification

## Purpose
Defines right-click context menus for file-list items and sidebar entries, offering generic and type-specific actions targeted at the current selection.

## Requirements

### Requirement: Right-click opens a menu at the cursor
The system SHALL open a context menu at the pointer location when the user right-clicks a file-list item, clamped so it stays within the viewport.

#### Scenario: Menu appears near the item
- **WHEN** the user right-clicks a file or folder
- **THEN** a context menu opens near the cursor
- **AND** if it would extend past a screen edge it is flipped or shifted to remain fully visible

### Requirement: Suppress the native WebView context menu
The system SHALL suppress the browser's native context menu throughout the app, including on areas without a Clive context menu.

#### Scenario: Right-click an empty app area
- **WHEN** the user right-clicks an area without a Clive context menu
- **THEN** the WebView's native menu, including Reload, does not appear
- **AND** existing Clive context menus continue to open on supported items

#### Scenario: Menu closes on dismissal
- **WHEN** the user clicks outside, presses Escape, blurs the window, or scrolls
- **THEN** the context menu closes

### Requirement: Menu targets the current selection
The system SHALL apply menu actions to the whole selection when the right-clicked item is already part of it, and otherwise act on the single clicked item.

#### Scenario: Right-click inside a selection
- **WHEN** several files are selected and the user right-clicks one of them
- **THEN** the actions target the entire selection

#### Scenario: Right-click outside the selection
- **WHEN** several files are selected and the user right-clicks a non-selected item
- **THEN** the selection is reduced to that item and actions target it

### Requirement: Generic actions are always available
The context menu SHALL offer Open/Anteprima, Get Info for a single filesystem item, Show in Finder, Copy path, Copy, Cut, Paste, Rename, and Move to Trash.

#### Scenario: Paste availability
- **WHEN** the internal clipboard is empty
- **THEN** the Paste action is disabled

#### Scenario: Rename is single-item only
- **WHEN** more than one item is targeted
- **THEN** Rename is disabled

#### Scenario: Get Info for a file or folder
- **WHEN** the user chooses Get Info for one filesystem item
- **THEN** Clive shows its name, kind, path, size, direct child count for folders, timestamps, and permissions
- **AND** folder size is the recursive sum of contained regular-file sizes
- **AND** the information is read from the filesystem without changing the item

#### Scenario: Get Info is unavailable for multi-selection and archive members
- **WHEN** the target is a multi-selection or a virtual item inside a ZIP archive
- **THEN** Get Info is not offered

### Requirement: Actions adapt to item type
The system SHALL vary menu content based on the item's type.

#### Scenario: Folder offers new folder
- **WHEN** the target is a directory
- **THEN** the menu offers "New folder here" that navigates into the folder and starts folder creation

#### Scenario: Previewable file offers Quick Look
- **WHEN** the target is a single image, video, audio, or document file
- **THEN** the menu offers an "Anteprima" action invoking `quick_look`

#### Scenario: Archive labels the open action as extract
- **WHEN** the target is a single archive file
- **THEN** the primary open action is labeled "Estrai" and opens the archive with the default application

#### Scenario: Trash action confirms
- **WHEN** the user chooses Move to Trash
- **THEN** a confirmation is requested before items are moved to the Trash

### Requirement: Sidebar entries have a context menu
The system SHALL open a context menu when the user right-clicks a sidebar place or a recent path.

#### Scenario: Place menu actions
- **WHEN** the user right-clicks a place such as Desktop or Documents
- **THEN** the menu offers Open, Show in Finder, New folder here, and Copy path

#### Scenario: Recent menu can be removed
- **WHEN** the user right-clicks a recent path
- **THEN** the menu additionally offers "Remove from recents"
- **AND** choosing it removes that path from the recent list
