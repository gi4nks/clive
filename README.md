# Clive

A native-feeling, keyboard-first **dual-pane file manager for macOS** (Tauri 2 +
React), with optional on-device/cloud **AI actions** — rename, organize,
summarize and chat — that always ask before touching your files and are undoable.

![platform](https://img.shields.io/badge/platform-macOS-blue) ![version](https://img.shields.io/badge/version-1.2.1-green)

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

## Tests & coverage

```sh
make quality             # CI gate: fmt, Clippy, tests, and >=85% line coverage per suite
make frontend-test       # Vitest
make frontend-coverage   # Vitest + V8 coverage; HTML in frontend/coverage/
make rust-coverage       # Rust tests + llvm-cov report and 85% line gate (Xcode CLT + llvm-tools-preview)
make coverage            # both coverage runs
```

Coverage reports are local build artifacts. The Rust and frontend suites have
separate 85% line-coverage gates; branch/function coverage remains visible but
is not gated yet. See [`docs/test-coverage.md`](docs/test-coverage.md) for the
measured baseline and remaining gaps.

The Gitea workflow runs `make quality` on pull requests and builds and verifies
the Apple Silicon DMG before uploading its artifact. GitHub Actions
builds the Apple Silicon DMG for version tags (`vX.Y.Z`). The
app is ad-hoc signed so macOS does not label the downloaded package damaged.
Since it is not signed with a Developer ID certificate or notarized, macOS
may show “Apple could not verify ‘Clive’ is free of malware.” To approve it,
first try to open Clive and dismiss the warning, then go to **System Settings
→ Privacy & Security**, scroll to **Security**, and click **Open Anyway** next
to Clive. Confirm **Open** in the next prompt. You can also Control-click
Clive in Finder, choose **Open**, then confirm **Open**. Only approve the copy
downloaded from Clive’s official GitHub Actions build.
Download the `Clive-macOS-Apple-Silicon` artifact from the workflow run in the
repository's **Actions** tab.

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
the release commit to Gitea. Gitea's `.gitea` workflow builds Apple Silicon
and Intel DMGs on `main` and version tags. GitHub is a separate filtered mirror
with its own history and `.github` workflow. Publish the matching version there
from a filtered source snapshot without `.gitea`; keep the `.github` workflow
and push the matching tag. The GitHub DMG workflow runs on version tags or
manual dispatch, so updating its `main` branch does not create a duplicate
release build. Both repositories use the same `vX.Y.Z` label on their release
commits.

The `About` section in Settings shows version, build date, and git commit.
