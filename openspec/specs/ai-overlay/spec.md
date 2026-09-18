# ai-overlay Specification

## Purpose
Make the AI overlay's Apply button behave correctly on the **Summarize**
result — currently a no-op, causing user confusion. Summarize has no file
operations to apply, so Apply should dismiss the popup.

## Requirements

### Requirement: Apply dismisses the popup on summarize results
The system SHALL treat the overlay's **Apply** button as a "close" action
when the current busy mode is `summarize`, and as a normal "apply the plan"
action when the current mode is `rename`, `organize`, or `generate`.

#### Scenario: Apply closes the summarize popup
- **WHEN** the assistant has streamed a summary and the overlay shows it with Apply/Cancel
- **AND** the user clicks Apply
- **THEN** the overlay closes
- **AND** no filesystem mutation occurs

#### Scenario: Apply still performs renames normally
- **WHEN** the overlay is showing a rename preview (mode `rename`)
- **AND** the user clicks Apply
- **THEN** the renames are applied as before
- **AND** the overlay transitions to the undo-journal state
