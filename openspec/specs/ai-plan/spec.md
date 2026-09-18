# ai-plan Specification

## Purpose
Turn an AI-chat folder-reorganization analysis into an interactive tree Plan the user reviews/edits and applies atomically (create/rename/move/trash) with a persistent, cross-restart Undo-all. Coexists with the inline ACTIONS cards.

## Requirements

### Requirement: 🪄 converts a chat analysis into a reviewed Plan
The system SHALL offer a per-assistant-message button that makes a second structured model call and expands the returned JSON against the real directory listing into validated ops; unknown/protected/colliding ops are flagged and never applied without an explicit per-op exclusion being lifted (issue ops cannot be lifted).

#### Scenario: model proposes an unknown file
- **WHEN** the JSON references a basename not in the listing
- **THEN** that op is created with an issue and excluded, and a warning is shown

### Requirement: Bulk apply is phased and guard-authoritative
The system SHALL execute ops in the order createFolder (depth asc) → rename → move → trash, rejecting any protected path on the Rust side regardless of the client, and MUST NOT mutate the filesystem without an explicit Apply (plus a second confirmation when the plan contains trash ops).

#### Scenario: protected destination refused
- **WHEN** an included move targets a protected macOS location with the guard on
- **THEN** the engine refuses that op (failed) and touches nothing

### Requirement: Undo restores the pre-apply state and survives restart
The system SHALL persist an inverse journal per applied batch so "Annulla tutto" restores the original layout, including after an app restart (via a remembered batch id), until the macOS Trash is emptied.

#### Scenario: undo after relaunch
- **WHEN** the user quits and reopens Clive after applying a plan
- **THEN** an affordance lets them undo that batch, restoring original paths
