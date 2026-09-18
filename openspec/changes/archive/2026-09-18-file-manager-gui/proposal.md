# Proposal: File Manager GUI - Tauri + React Window

## Why

The current Tauri file manager implements all backend file operations (copy, move, rename, delete-to-trash, FSEvents watcher, MPSC operation queue, internal clipboard) but lacks a graphical user interface window. Without a GUI window, the application cannot function as a Finder replacement. Adding a proper Tauri window with React frontend is necessary to complete the MVP and provide the user interface expected from a file manager.

## What Changes

- Add Tauri window configuration in tauri.conf.json
- Create main application window (1200x800, resizable)
- Integrate React + TypeScript + Frontend components (FileList, RenameInput)
- Expose file operation results and progress to frontend via Tauri commands
- Integrate filesystem watcher events to update file list visually
- Provide multi-selection (Cmd/Shift-click), inline rename, and progress feedback

## Capabilities

### New Capabilities

- `tauri-window`: Tauri window configuration and creation
- `react-file-list`: React FileList component with multi-selection and file metadata display
- `react-rename-input`: React RenameInput component with inline editing and keyboard handling
- `file-operation-progress`: Progress feedback from Rust file operations to frontend
- `internal-clipboard`: Rust-level clipboard state for multi-file tracking

### Modified Capabilities

- None - this is a new capability set for GUI integration

## Impact

- **Frontend**: React components in `src-frontend/vite-project/src/` - FileList.tsx, RenameInput.tsx already exist
- **Backend**: Tauri commands already implemented in `src-tauri/src/commands/` - need window integration
- **Configuration**: tauri.conf.json needs window settings added
- **No API breaking changes** - all new capabilities are additive

## Design Notes

The graphical features build upon the existing Rust implementation that is already complete (23/23 tasks). The frontend components will use the internal clipboard state and operation queue already implemented. The FileList and RenameInput components follow the design established in the previous OpenSpec change.
