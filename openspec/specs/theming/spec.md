# theming Specification

## Purpose
Defines the styling toolchain and theming: Tailwind CSS v4 with daisyUI 5, a theme registry, automatic system dark mode, and a persisted user theme choice.

## Requirements

### Requirement: Frontend uses Tailwind v4 and daisyUI 5
The system SHALL style the frontend with Tailwind CSS v4 and daisyUI 5 configured via CSS-first directives, without a JavaScript Tailwind config or the v3 import path.

#### Scenario: Build produces themed CSS
- **WHEN** the frontend is built
- **THEN** Tailwind v4 and daisyUI styles compile via `@tailwindcss/postcss`
- **AND** the build succeeds without the previous import/prefix errors

### Requirement: A set of themes is available
The system SHALL enable a theme registry including light, dark, dracula, business, night, and cupcake, with light as the default.

#### Scenario: Default theme on first run
- **WHEN** the app starts with no stored theme
- **THEN** the light theme is applied
- **AND** when the system prefers a dark appearance the dark theme is applied

### Requirement: Theme selection persists
The system SHALL let the user pick a theme from a switcher and remember the choice across reloads.

#### Scenario: User changes and keeps the theme
- **WHEN** the user selects a theme from the switcher and later reloads the app
- **THEN** the chosen theme is still applied

#### Scenario: Switching back to system
- **WHEN** the user removes an explicit theme choice
- **THEN** the application follows the system light/dark setting

### Requirement: Shell colors use theme tokens
The application chrome SHALL use daisyUI semantic color tokens (for example base-100, base-200, base-300, base-content, error) rather than hard-coded neutral colors.

#### Scenario: Chrome follows the theme
- **WHEN** a different theme is selected
- **THEN** the background, borders, text, and danger accents recolor accordingly
