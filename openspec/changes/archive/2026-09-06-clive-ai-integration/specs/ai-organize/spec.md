## Purpose

Defines the AI folder-organization action: propose a plan that groups files into subfolders, preview it as a diff, and only move files after explicit confirmation. Applying it goes through the shared action-safety validation and undo.

## ADDED Requirements

### Requirement: Propose an organization plan
The system SHALL propose a plan that assigns the files of the current folder to a target subfolder structure based on their type and content, without performing any move until confirmed.

#### Scenario: Plan only
- **WHEN** the user invokes "Organizza cartella"
- **THEN** a proposed structure (file → destination folder) is shown
- **AND** no file is moved yet

### Requirement: Preview as an editable diff
The system SHALL present the plan as a tree diff where the user can accept, edit, or exclude individual moves.

#### Scenario: Exclude a move
- **WHEN** the user excludes one proposed move
- **THEN** that file is left in place while the rest may proceed

### Requirement: Apply moves after confirmation
The system SHALL create any needed subfolders and perform the accepted moves only after the user confirms the plan.

#### Scenario: Confirm then apply
- **WHEN** the user confirms the plan
- **THEN** subfolders are created and the accepted files are moved accordingly

### Requirement: Organize is reversible as a batch
The system SHALL record the inverse operations of an applied plan so the whole organization step can be undone.

#### Scenario: Undo the reorganization
- **WHEN** the user triggers undo immediately after applying
- **THEN** files are returned to their original locations
