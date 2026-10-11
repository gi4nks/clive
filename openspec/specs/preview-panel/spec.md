# preview-panel Specification

## Purpose
Live in-app preview of the selected file(s) in a dedicated right column, with
content-type-specific renderers and a native Quick Look fallback, without
launching external apps or exposing new filesystem surface.

## Requirements

### Requirement: Preview panel follows the active-pane selection
When enabled, the panel SHALL show the selection of the active pane: a single
file renders its preview; multiple files show an aggregate summary (count,
total size, kinds); a folder shows its metadata and a Quick Look action. The
panel updates within ~200 ms of selection change.

#### Scenario: Image selected
- **WHEN** one PNG is selected in the active pane and the panel is open
- **THEN** the image is shown scaled to fit the panel without opening any external app

#### Scenario: Multi-selection
- **WHEN** 3 files are selected
- **THEN** the panel lists count/total size and each name, and previews the last-clicked file

### Requirement: Supported renderers with graceful fallback
Text/code, markdown (rendered), images, PDF, audio and video SHALL render
in-panel. Any other type (or unsupported/`unknown`) SHALL render a fallback
card offering "Open with Quick Look" (and "Open"). A file whose bytes are not
valid UTF-8 but is not a known media type MUST take the fallback path.

#### Scenario: Unknown extension
- **WHEN** a `.zip` is selected
- **THEN** the fallback card shows name/size and the Quick Look button

### Requirement: Byte access via validated command, capped
The gateway to webview data SHALL be `read_file_bytes(path)`, which rejects
directories, fails with a clear error above the 32 MB cap, and never widens
outside the existing path normalization. Blob URLs created from it SHALL be
revoked when the previewed selection changes.

#### Scenario: Large video
- **WHEN** a 100 MB `.mov` is selected
- **THEN** no bytes are transferred and the panel shows the fallback card with a "too large" note

### Requirement: Visibility is user-controlled and persisted
The panel toggles from Settings → File, the toolbar, and ⌘⇧P; its state
persists across restarts (default: off). When disabled, layout returns to the
current dual-pane widths with no visual trace.

#### Scenario: Toggle off mid-preview
- **WHEN** the user hides the panel while a preview is loaded
- **THEN** panes reclaim the space and held blob URLs are released

### Requirement: Preview can use the available workspace width
When the preview is visible, the user SHALL be able to expand it across the
available workspace. In this mode both file panes SHALL collapse visually to
their navigation rails, while the preview fills the remaining width. Expanding
the preview SHALL preserve the saved collapsed state of each pane. The header
restore control SHALL return to that saved pane layout. Selecting a rail SHALL
expand only that pane if it was collapsed, preserve the other pane's state, and
return to the normal preview width.

#### Scenario: Expand preview
- **WHEN** the user expands the preview
- **THEN** both file panes reduce to their narrow navigation rails
- **AND** the preview fills the remaining workspace width

#### Scenario: Return to file browsing
- **WHEN** the user restores the preview after one pane was collapsed before expansion
- **THEN** that pane remains collapsed and the other pane remains open

#### Scenario: Select a navigation rail
- **WHEN** the user selects a collapsed pane's navigation rail while the preview is expanded
- **THEN** that pane opens, the other pane retains its saved collapsed state, and the preview returns to normal width
