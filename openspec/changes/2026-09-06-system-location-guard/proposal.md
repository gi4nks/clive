# Proposal: Guard destructive actions on macOS system locations

## Why

The app can rename, move-to-trash and move files/folders. With no guard, the user
can accidentally rename or delete macOS's own locations (e.g. `/Applications`,
`/System`, `/usr`), which is unrecoverable or breaks the OS. The user wants these
operations blocked on native system locations, configurable in Settings.

## What Changes

- A **protected set**: macOS top-level system directories compared as exact
  entries — `/`, `/Applications`, `/Library`, `/System`, `/usr`, `/bin`, `/sbin`,
  `/private`, `/etc`, `/var`, `/opt`, `/cores`, `/dev`, `/home`, `/mnt`,
  `/Volumes`, `/Network`, `/Automount`, `/tmp`, `/macOS Install Data` — plus
  **everything under `/System`** (recursive, SIP). Children of the non-`/System`
  roots stay editable.
- When protection is **on** (default), **rename**, **move-to-trash** and **move
  (when the source is protected)** are refused on a protected path. Copy, and
  writing *into* a protected location, remain allowed.
- **Authoritative in Rust** (`is_protected`, plus `allow_system` on `rename`,
  `delete_to_trash`, `move_file`, `transfer_items`, `paste_paths`) so every path —
  context menu, keyboard, in-app drag, clipboard paste and AI apply — is covered.
  Batch moves are all-or-nothing (a protected source aborts before any FS change).
- **Frontend UX**: `api.ts` injects `allowSystem` from config; the file/folder
  context menu disables the gated items (with a "system" hint) when the target is
  protected.
- A **Settings toggle** `guardSystemLocations` (Safety, default **on**) with a
  confirmation when turning it **off**.
- Paths are normalized for the check (resolve `..`, drop `.`/empty/trailing,
  case-insensitive) so traversal like `/Applications/..` can't smuggle a bypass.

## Impact

- Affected specs: none prior.
- Affected code: `src/systemGuard.ts` (new), `src/api.ts`, `src/settings/appConfig.ts`,
  `src/settings/SettingsModal.tsx`, `src/App.tsx`, `src/i18n/locales/{en,it}.json`,
  `src-tauri/src/commands/filesystem.rs`, `src-tauri/src/commands/clipboard.rs`.
