# File Tags Specification

## Purpose

Apply and discover macOS Finder-compatible tags while browsing files in Clive.

## Requirements

### Requirement: Preserve Finder-compatible tags

The system SHALL read and write tags using macOS Finder's `com.apple.metadata:_kMDItemUserTags` extended attribute, preserving each tag name and color index so Finder and Clive see the same tags.

#### Scenario: Existing Finder tags appear in Clive

- **WHEN** a directory contains an item tagged in Finder
- **THEN** Clive shows its tag color markers and includes the tag in the sidebar tag list

#### Scenario: Tag metadata cannot be read

- **WHEN** an item has no tag extended attribute
- **THEN** Clive treats it as untagged and continues listing it

### Requirement: Edit tags on one or multiple items

The system SHALL let users create and apply multiple named, colored tags to a selected item or selection, and remove tags without changing unrelated tags.

#### Scenario: Add a tag to a selection

- **WHEN** the user adds a tag in Edit Tags
- **THEN** Clive adds it to each selected item while preserving the other tags on those items

#### Scenario: Remove a tag from a selection

- **WHEN** the user clears a tag in Edit Tags
- **THEN** Clive removes only that tag from each selected item

### Requirement: Filter the current folder by tag

The system SHALL always show a Tags section in the sidebar, list tags found among the active pane's current folder items, and filter that pane to items carrying the selected tag. The section SHALL show an Edit Tags control for the current selection, disabled when no eligible items are selected, and an empty state when the folder contains no tags.

#### Scenario: Select a sidebar tag

- **WHEN** the user selects a tag in the sidebar
- **THEN** the active pane shows only items with that tag

#### Scenario: Clear the tag filter

- **WHEN** the user selects the active tag again
- **THEN** the active pane shows its unfiltered folder listing

### Requirement: Protect system locations

Tag writes SHALL respect Clive's system location guard and mounted volume checks.

#### Scenario: Guard is enabled

- **WHEN** a tag write targets a protected system path
- **THEN** Rust rejects the write before changing extended attributes
