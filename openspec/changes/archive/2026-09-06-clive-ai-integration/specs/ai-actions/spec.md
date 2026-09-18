## Purpose

Defines the non-destructive magic actions offered through the existing context menu and status bar — rename with AI, summarize/describe, and generate content — each producing a proposed result the user reviews before anything is applied.

## ADDED Requirements

### Requirement: Rename with AI
The system SHALL offer an action that proposes new, human-readable names for the selected files based on their (budgeted) content, returning proposed `path → newName` pairs for user review.

#### Scenario: Propose names from content
- **WHEN** the user invokes "Rinomina con AI" on selected files
- **THEN** a table of proposed new names is shown, editable per row, and nothing is renamed until the user confirms

### Requirement: Summarize or describe selected files
The system SHALL produce a summary or description of the selected files and show it in a side panel.

#### Scenario: Summarize documents
- **WHEN** one or more text/code/document files are selected
- **THEN** their summaries are displayed without modifying any file

#### Scenario: Describe images only with vision
- **WHEN** images are selected and the active model supports vision
- **THEN** descriptions are produced; otherwise the action indicates vision is required

### Requirement: Generate new content
The system SHALL generate the contents of a new file from a prompt, proposing a name and body for confirmation before writing.

#### Scenario: Confirm before write
- **WHEN** generated content is accepted
- **THEN** the file is created at the current folder only after the user confirms the name and content

### Requirement: Actions are cancellable and non-blocking
Every AI action SHALL run without blocking the UI, expose an in-flight state that prevents duplicate submission, and support cancellation.

#### Scenario: Prevent double submit
- **WHEN** an action is already running for the current target
- **THEN** its trigger is disabled until it finishes or is cancelled
