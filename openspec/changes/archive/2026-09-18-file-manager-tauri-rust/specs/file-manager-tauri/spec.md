## Purpose

The Tauri/Rust backend command surface for the File Manager: synchronous filesystem operations exposed to the React frontend via Tauri commands.

## ADDED Requirements

### Requirement: List directory contents
The system SHALL list a directory's contents and return each entry with its name, absolute path, directory flag, size, last-modified time, and file extension.

#### Scenario: Directory listing is returned sorted
- **WHEN** `list_dir` is invoked with a valid directory path
- **THEN** the result contains one entry per readable item
- **AND** directories are ordered before files, and items are sorted by case-insensitive name

#### Scenario: Non-directory path is rejected
- **WHEN** `list_dir` is invoked with a path that is not a directory
- **THEN** the command returns an error identifying the path

#### Scenario: Tilde paths are expanded
- **WHEN** a path beginning with `~` is provided
- **THEN** the path is expanded against the user's home directory before use

### Requirement: Provide the user home directory
The system SHALL return the current user's home directory path.

#### Scenario: Home directory resolves
- **WHEN** `home_dir` is invoked
- **THEN** the home directory path is returned
- **AND** if it cannot be determined an error is returned

### Requirement: Copy files and folders
The system SHALL copy a file to a destination and copy a directory recursively, creating parent directories as needed.

#### Scenario: Copy a file
- **WHEN** `copy_file` is invoked with an existing source file and a destination path
- **THEN** the destination file exists with the source contents
- **AND** parent directories of the destination are created

#### Scenario: Copy a directory
- **WHEN** `copy_file` is invoked with a source directory
- **THEN** the directory tree is recursively copied to the destination

#### Scenario: Missing source is rejected
- **WHEN** the source path does not exist
- **THEN** the command returns a not-found error

### Requirement: Move files and folders with cross-device fallback
The system SHALL move an item to a destination, falling back to copy-then-delete when a direct rename is not possible.

#### Scenario: Rename-based move
- **WHEN** `move_file` is invoked for a source and destination on the same volume
- **THEN** the item is relocated via rename and the source no longer exists

#### Scenario: Cross-device move
- **WHEN** a direct rename fails (for example across volumes)
- **THEN** the item is copied to the destination and removed from the source

### Requirement: Rename with validation
The system SHALL rename an item within its parent directory, rejecting invalid or colliding names.

#### Scenario: Valid rename
- **WHEN** `rename` is invoked with a valid new name that does not collide
- **THEN** the item is renamed to `parent/<newName>`

#### Scenario: Invalid new name
- **WHEN** the new name is empty, is `.` or `..`, or contains a path separator
- **THEN** the command returns an "Invalid name" error

#### Scenario: Collision
- **WHEN** the target name already exists in the parent directory
- **THEN** the command returns an error and leaves the original unchanged

### Requirement: Create a folder
The system SHALL create a new folder inside a given parent directory and return its path.

#### Scenario: Folder creation
- **WHEN** `create_folder` is invoked with a parent path and a name
- **THEN** the directory is created and its absolute path is returned
- **AND** if creation fails an error is returned

### Requirement: Read and write text files
The system SHALL read a file's contents as text and write text contents to a file.

#### Scenario: Write then read
- **WHEN** `write_text_file` stores content at a path and `read_text_file` reads that path
- **THEN** the read content equals the written content

### Requirement: Reveal an item in Finder
The system SHALL reveal a given path in the macOS Finder.

#### Scenario: Reveal in Finder
- **WHEN** `reveal_in_finder` is invoked with a path
- **THEN** Finder is opened showing that item
- **AND** a failure is reported as an error
