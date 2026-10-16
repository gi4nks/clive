# Clive

A native-feeling, keyboard-first **dual-pane file manager for macOS** (Tauri 2 +
React), with optional on-device/cloud **AI actions** — rename, organize,
summarize and chat — that always ask before touching your files and are undoable.

![platform](https://img.shields.io/badge/platform-macOS-blue) ![version](https://img.shields.io/badge/version-1.2.0-green)

## Highlights

- **Dual pane** with resizable split, collapsible rails, per-pane history,
  focus mode (⌘\\), swap and move-to-other-pane
- **File operations**: trash with restore, batch rename with live pattern
  preview, drag & drop transfers, pinned Navigator, mounted volumes with
  free/used and safe eject (incl. network mounts)
- **Preview panel** for images, video, audio, PDF, markdown, text — expandable
  across the workspace while preserving the saved pane layout — plus
  **read-only browsing of `.zip` archives** (extract with zip-slip protection)
- **AI layer** (via [Wise](https://github.com/gi4nks/wise), checked out as a pinned local Git submodule): any
  OpenAI-compatible provider can be added from Settings; cloud usage is opt-in;
  every mutation goes through a validated plan + undo journal; a Settings
  switch hides and disables all AI entry points across the app
- **Finder-compatible colored tags** with Navigator filtering and bulk editing
- Native **macOS look**: vibrancy, overlay titlebar, sheets, ⌘/ shortcut map

## Getting started

```sh
git clone --recurse-submodules https://github.com/gi4nks/clive.git
cd clive
make setup
make dev       # development
make build     # release bundle in target/release/bundle
```

GitHub Actions builds the Apple Silicon DMG on pushes to `main` and version
tags (`vX.Y.Z`). Download the `Clive-macOS-Apple-Silicon` artifact from the
workflow run in the repository's **Actions** tab.

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

Clive follows SemVer (`MAJOR.MINOR.PATCH`). `tauri.conf.json` is the version
source; `build.rs` checks it against Cargo and frontend manifests. Conventional
Commits determine the next version:

- `feat:` → minor release
- `fix:`, `perf:`, or `revert:` → patch release
- `!` after the type/scope or a `BREAKING CHANGE:` footer → major release
- `docs:`, `chore:`, `test:`, and other non-feature commits do not trigger a
  release by themselves

After committing the current release state, initialize the local Gitea tag
baseline once if it has no SemVer tags, then push that tag to Gitea:

```sh
make release-bootstrap
git push origin "$(git describe --tags --exact-match HEAD)"
```

For each subsequent release, keep the worktree clean and preview the decision:

```sh
make release-check
```

The command reads commits since the latest `vX.Y.Z` tag. Add curated notes
under `[Unreleased]` in `CHANGELOG.md`; applying a release updates the Tauri,
Cargo, npm, lockfile, and README badge versions, promotes those notes, commits
the release, and creates an annotated tag:

```sh
make release
```

`make release` does not push. Review the generated commit and tag, then push
both to Gitea. Its existing workflow builds the DMG from version tags. To
publish the same version on GitHub, update GitHub from a filtered source
snapshot and push the matching tag there; GitHub keeps its own history and
`.github` workflow, while Gitea keeps `.gitea` and its local configuration.
The GitHub DMG workflow runs on version tags (or manual dispatch), so pushing
the snapshot to `main` does not create a duplicate release build. The two
repositories use the same `vX.Y.Z` label on their respective release commits.

The `About` section in Settings shows version, build date, and git commit.
