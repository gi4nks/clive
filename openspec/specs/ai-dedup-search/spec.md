# ai-dedup-search Specification

## Purpose
Defines duplicate detection and natural-language search without embeddings. Duplicates are found by hashing (reusing the `james` strategy) with AI only for labeling/grouping; "smart search" is a bounded agent that reasons over names and metadata via filesystem tool-calling.

## Requirements

### Requirement: Duplicates are detected by hashing
The system SHALL identify duplicate files by content hash (and perceptual hash for images), reusing the existing duplicate-finder strategy, and SHALL NOT rely on AI to decide equality.

#### Scenario: Exact duplicates grouped
- **WHEN** the user requests duplicate detection in a folder
- **THEN** files sharing a content hash are presented as a group
- **AND** the decision to group is made by hashing, not the model

#### Scenario: AI labels groups only
- **WHEN** duplicate groups are shown
- **THEN** AI may propose a name/description for a group but cannot mark items as duplicates

### Requirement: Natural-language search over the tree
The system SHALL answer a natural-language query by invoking read-only filesystem tools (directory listing, optional text reads) in a bounded loop and returning candidate paths.

#### Scenario: Query returns matches
- **WHEN** the user asks to find files matching a description
- **THEN** the agent lists directories and returns matching paths as candidates
- **AND** the user can navigate to or open them

#### Scenario: Read-only tools
- **WHEN** the search agent runs
- **THEN** it may only read/list, and cannot rename, move, or delete

### Requirement: Agent step budget
The system SHALL cap the number of tool-calling steps an agent search may take and terminate cleanly at the limit.

#### Scenario: Budget exhausted
- **WHEN** the agent reaches its step limit without finishing
- **THEN** it stops and returns the best result so far rather than looping indefinitely

### Requirement: No semantic vector search
The system SHALL NOT claim semantic/vector search, because the provider abstraction offers no embedding capability; search is name/metadata reasoning.

#### Scenario: Feature description is honest
- **WHEN** the search feature is presented
- **THEN** it is described as tool-based filename/metadata search, not embeddings
