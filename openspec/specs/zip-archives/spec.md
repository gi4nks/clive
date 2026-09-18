# zip-archives Specification

## Purpose
Read-only integration of `.zip` archives into the file manager: browsing them
like folders, previewing and extracting their content safely, with consistent
(i18n) UI affordances across panes, sidebar, menus, preview and transfers.

## Requirements

### Requirement: Zip files open as read-only virtual folders
Selecting a `.zip` and pressing Enter (or "Open") SHALL list its entries in the
active pane using pseudo-paths `<archive>.zip!/<entry-path>`; folder navigation
(Up/Home/Back/Forward/breadcrumbs) works within and out of the archive. The
archive's real file path remains accessible for Reveal-in-Finder.

#### Scenario: Enter and leave an archive
- **WHEN** the user opens `backup.zip` and then presses ⌘↑
- **THEN** the pane first lists the zip entries, then returns to the folder containing the zip

#### Scenario: Breadcrumb exposes the archive
- **WHEN** browsing `backup.zip!/fotos/2026`
- **THEN** the breadcrumb shows the folder crumbs plus a clickable `backup.zip` segment and the inner crumbs after a distinct separator

### Requirement: Safe listing, preview and extraction
`zip_list` SHALL return name/dir/size/mtime per entry; `zip_read(path, inner)` SHALL return capped bytes for preview; `zip_extract(path, dest, entries?)` SHALL resolve every member under `dest` (rejecting traversal/absolute paths), skip symlink entries, and never overwrite silently without reporting. Encrypted/corrupted archives SHALL surface a visible error instead of an empty list.

#### Scenario: Zip-slip rejected
- **WHEN** an archive contains `../evil.txt`
- **THEN** extraction of it fails (or is skipped with an error row) and nothing is written outside `dest`

#### Scenario: Preview inside archive
- **WHEN** a `.png` inside a zip is selected
- **THEN** the preview panel renders it via `zip_read` without full extraction

### Requirement: Read-only affordances inside archives
While the active pane is inside an archive, mutating actions (rename, trash,
copy, cut, paste, new folder, open terminal, shortcuts ⌘C/⌘X/⌘V/⌫/F2,
drag-in/drag-out, pinning inner paths) SHALL be disabled with an explanatory,
localized message. Available actions: extract (here/to…), preview, Quick Look,
open-in-temp via double-click. Dropping files ON a `.zip` row SHALL be refused
with a localized status message.

#### Scenario: Copy attempt inside archive
- **WHEN** the user presses ⌘C on an inner file
- **THEN** nothing is copied and the status bar shows "Archivio in sola lettura" (localized)

### Requirement: All archive UI is localized
Every new string (menu items, badges, tooltips, status/error messages, dialogs)
SHALL have matching `archive.*` keys in both `en.json` and `it.json`, covered
by the i18n parity/coverage tests.

#### Scenario: Language switch mid-browsing
- **WHEN** the user switches language in Settings while inside an archive
- **THEN** breadcrumbs badges, menus and messages re-render fully in the new language
