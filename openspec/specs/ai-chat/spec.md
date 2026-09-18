# ai-chat Specification

## Purpose
Provide a conversational AI surface alongside the existing one-shot actions.
The chat streams model responses, sees the folder + selected + user-added
files as context, and can propose file operations as **confirmable action
cards** rendered inline in the assistant message. Nothing is executed without
an explicit Apply click.

## Requirements

### Requirement: Chat drawer is available on demand and closes with Escape
The system SHALL provide a right-side drawer containing an AI chat, openable
via a status-bar button and a global `⌘⇧C` shortcut, and dismissable via
`Escape`, `✕`, or backdrop click.

#### Scenario: Keyboard opens the drawer
- **WHEN** the user presses `⌘⇧C` anywhere in the app
- **THEN** the chat drawer becomes visible with an empty thread

#### Scenario: Escape closes the drawer
- **WHEN** the drawer is open and the user presses `Escape`
- **THEN** the drawer becomes hidden and any in-flight stream is aborted

### Requirement: Chat is mutually exclusive with the one-shot AI overlay
The system SHALL NOT display the chat drawer and the AI overlay at the same
time; opening one closes the other.

#### Scenario: Opening the drawer closes the overlay
- **WHEN** the overlay is showing (e.g. mid-rename preview) and the user opens the chat
- **THEN** the overlay's preview state is cancelled before the drawer becomes visible

### Requirement: Chat responses stream incrementally
The system SHALL render assistant replies token-by-token as the model streams,
not as a single block at the end.

#### Scenario: Partial reply visible during stream
- **WHEN** the model has emitted some chunks but not finished
- **THEN** the assistant message bubble shows the accumulated partial text

### Requirement: Chat context includes folder listing, selected files, and user-added files
The system SHALL attach the following as context to every turn: the active
pane's directory listing (compact), the contents of the currently-selected
files (budgeted), and any files the user attached via drag-and-drop into the
drawer.

#### Scenario: Directory contents mentioned in prompt
- **WHEN** the user asks "what files are here?" and clicks Send
- **THEN** the model's prompt includes the directory listing of the active pane

#### Scenario: Dropped file becomes removable chip
- **WHEN** the user drags a file from the pane into the drawer
- **THEN** a chip for that file appears above the input
- **AND** clicking the chip's `×` removes it from the next turn's context

### Requirement: Chat history is trimmed FIFO with an anchor
The system SHALL maintain a per-session character budget on the message
history. When exceeded, the oldest non-first messages are dropped while the
first user message is always kept as an anchor, and a warning chip is shown.

#### Scenario: Very long conversation is truncated with warning
- **WHEN** the user has exchanged 20+ messages and the total exceeds the budget
- **THEN** older middle messages are removed
- **AND** the first user message remains
- **AND** a `chat.truncated` chip is visible above the thread

### Requirement: Assistant may propose actions via a JSON marker block
The system SHALL parse an optional `<<<ACTIONS>>>{...}<<<END>>>` block at the
end of the assistant's reply. Valid `ChatAction` entries are removed from the
visible text and rendered as inline action cards.

#### Scenario: Malformed JSON leaves the block as plain text
- **WHEN** the marker block contains invalid JSON
- **THEN** no action cards are rendered
- **AND** the raw text (including the marker) stays visible in the bubble

### Requirement: Every proposed action requires an explicit Apply click
The system SHALL NOT call any filesystem-mutating primitive in response to an
assistant message; only a user click on a card's **Apply** may cause a
mutation.

#### Scenario: Actions received but not clicked leave the FS untouched
- **WHEN** the assistant proposes a rename
- **AND** the user does not click Apply
- **THEN** no `rename`/`move`/`write`/`deleteToTrash` call reaches the backend

### Requirement: Action proposals are pre-validated and guard-blocked cards render as disabled
The system SHALL run each proposed action through `validateChatAction` (name
validity, collision, path-parent, and system guard) at render time.
Guard-blocked or otherwise invalid actions render with the Apply button
**disabled** and the reason displayed on the card.

#### Scenario: Protected path shown greyed with hint
- **WHEN** the assistant proposes `trash` on `/Applications` with the guard on
- **THEN** the card is visible with Apply disabled and a "system location" hint
- **AND** no filesystem call is made even if the user could somehow click Apply

#### Scenario: Rename collision reported without disabling retry
- **WHEN** a rename to a name that already exists is proposed
- **AND** the user clicks Apply
- **THEN** the card shows the collision error
- **AND** the user may edit the model's proposal by asking again
- **AND** transient FS errors do NOT permanently hide the Apply button

### Requirement: Unsupported-image models skip images with a note
The system SHALL consult `modelCapabilities` and, when the active model lacks
vision, omit image files from the context and surface a note.

#### Scenario: Image dropped, non-vision model
- **WHEN** the user drops a PNG into the drawer with a text-only model selected
- **THEN** the PNG is not sent to the model
- **AND** the status bar shows the "no vision" note
