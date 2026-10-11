# Clive

A native-feeling, keyboard-first **dual-pane file manager for macOS** (Tauri 2 +
React), with optional on-device/cloud **AI actions** — rename, organize,
summarize and chat — that always ask before touching your files and are undoable.

![platform](https://img.shields.io/badge/platform-macOS-blue) ![version](https://img.shields.io/badge/version-1.1.1-green)

## Highlights

- **Dual pane** with resizable split, collapsible rails, per-pane history,
  focus mode (⌘\\), swap and move-to-other-pane
- **File operations**: trash with restore, batch rename with live pattern
  preview, drag & drop transfers, pinned sidebar, mounted volumes with
  free/used and safe eject (incl. network mounts)
- **Preview panel** for images, video, audio, PDF, markdown, text — expandable
  across the workspace while preserving the saved pane layout — plus
  **read-only browsing of `.zip` archives** (extract with zip-slip protection)
- **AI layer** (via [Wise](https://github.com/gi4nks/wise), checked out as a pinned local Git submodule): any
  OpenAI-compatible provider can be added from Settings; cloud usage is opt-in;
  every mutation goes through a validated plan + undo journal
- Native **macOS look**: vibrancy, overlay titlebar, sheets, ⌘/ shortcut map

## Getting started

```sh
git clone --recurse-submodules https://github.com/gi4nks/clive.git
cd clive
make setup
make dev       # development
make build     # release bundle in target/release/bundle
```

Requirements: macOS, Xcode CLT, Rust, Node ≥ 20.

AI credentials live in `~/.clive/ai.env`
(`CLIVE_PROVIDER_<ID>_BASE_URL` / `CLIVE_PROVIDER_<ID>_API_KEY`) or can be
entered in **Settings → AI**; shell env vars take priority.

## Documentation map (what is canonical)

| Path | Role |
| --- | --- |
| `openspec/specs/` | **Canonical behaviour** of the app, per capability |
| `openspec/changes/archive/` | Historical change proposals (why each feature exists) |
| `docs/plans`, `docs/specs` | Design records for the AI chat/plan subsystems |
| `docs/archive/` | Superseded planning docs (spec-kit era) |
| `CHANGELOG.md` | Release history; version source is `tauri.conf.json` |

## Versioning & releases

SemVer, defined once in `tauri.conf.json` (`build.rs` fails the build on
drift with `Cargo.toml`/`package.json`). Releases are tagged `vX.Y.Z`; the
`About` section in Settings shows version, build date, and git commit.
