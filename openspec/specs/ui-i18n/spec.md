# ui-i18n Specification

## Purpose
Defines the user-interface localization system: English as the default language, a persisted language switcher, complete key coverage across the UI, and correct pluralization and locale-aware formatting.

## Requirements

### Requirement: English is the default UI language
The system SHALL initialize localization with English as the default and fallback language, so a first-run or new user sees English regardless of the operating system language.

#### Scenario: First run uses English
- **WHEN** the application starts with no stored language preference
- **THEN** all user-facing strings render in English

#### Scenario: Unknown keys fall back to English
- **WHEN** a string is requested in a non-English locale that lacks that key
- **THEN** the English text is displayed instead of an empty value

### Requirement: Every user-facing string is localized
The system SHALL render all user-facing text (window chrome, toolbar tooltips, context-menu and status-bar labels, sidebar sections, search and input placeholders, dialog titles and buttons, status toasts, and validation messages) from translation keys rather than hard-coded literals.

#### Scenario: No hard-coded Italian remains
- **WHEN** the UI is inspected with the default English locale
- **THEN** none of the labels, tooltips, messages, or placeholders display Italian text
- **AND** a linting rule flags any user-facing string literal left inline in a component

### Requirement: The user can switch and persist the language
The system SHALL provide a language control that switches between English and Italian and remembers the choice across launches.

#### Scenario: Switch to Italian
- **WHEN** the user selects "Italiano"
- **THEN** the interface updates to Italian
- **AND** after reopening the app it remains Italian

#### Scenario: Switch back to English
- **WHEN** the user selects "English"
- **THEN** the interface updates to English

### Requirement: Counts use correct plural forms
The system SHALL render count-dependent text (elements, selection, and similar) using the active language's plural rules rather than string concatenation.

#### Scenario: Singular and plural elements
- **WHEN** one element is listed
- **THEN** the label reads in the singular ("1 element")
- **WHEN** more than one element is listed
- **THEN** the label uses the plural ("5 elements")

#### Scenario: Selection count follows the same rule
- **WHEN** one file is selected the text is singular; when several are selected it is plural

### Requirement: Formatting follows the active language
The system SHALL format dates and numbers according to the active language.

#### Scenario: Locale-aware date
- **WHEN** a file date is displayed while English is active
- **THEN** it is formatted with an English locale
- **AND** switching the language changes the date formatting accordingly
