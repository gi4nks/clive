# Proposal: Clive-owned recycle bin with per-item context menu

## Why

Deleting to the macOS system Trash gave no way to restore an individual item
from Clive, and the Trash popover offered no per-item actions. Users asked for a
context menu in the Trash to restore ("undo") or permanently delete a single
item. Reliable restore-to-original needs Clive to track where each item came
from, which the system Trash doesn't expose — so Clive gets its own recycle bin.

## What Changes

- **Clive-owned trash**: deletions move items into `~/.clive/trash/` under an
  opaque slot id, with a journal `~/.clive/trash/journal.json` recording
  `{id, originalPath, deletedAt, isDir, size, modified}`. The `trash` crate
  dependency is dropped.
- **`delete_to_trash`** now routes to the Clive bin (still guarded against
  protected system paths). The Delete key / "Move to Trash" behave the same from
  the user's view but land in Clive's bin.
- **New Tauri commands**: `trash_list` (prunes stale slots, newest first),
  `trash_restore` (re-move to original, recreating parents; never clobbers →
  `name (restored N)`), `trash_delete_forever`, `trash_empty`.
- **Trash popover context menu** (right-click or the row, inline menu, no
  overlay conflict): Restore · Open · Reveal in Finder · Copy original path ·
  Delete immediately. "Empty Trash" now clears Clive's bin.

## Impact

- New capability: `clive-trash` (updates `contextual-status-bar` trash widget).
- Affected: `src-tauri/src/commands/trash.rs` (new), `filesystem.rs`
  (`delete_to_trash` moved; helpers exposed), `main.rs`, `Cargo.toml` (drop
  `trash`), `src/api.ts`, `src/widgets.tsx`, i18n `trash.*`.
