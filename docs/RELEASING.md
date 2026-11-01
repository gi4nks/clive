# Releasing Clive

This document describes the current maintainer release process. A GitHub release is a deliberate maintainer action; CI builds are not published as releases automatically.

## Version and changelog

`tauri.conf.json` is the version source. The Rust and frontend versions are checked against it during the build. Clive uses SemVer and Conventional Commits:

- `feat:` produces a minor version bump.
- `fix:`, `perf:`, and `revert:` produce a patch bump.
- A breaking change (`!` or a `BREAKING CHANGE:` footer) produces a major bump.
- Documentation, maintenance, and test commits do not trigger a release by themselves.

Curate user-facing release notes under `[Unreleased]` in `CHANGELOG.md`. From a clean worktree, inspect the proposed version first:

```sh
make release-check
```

When the version and notes are ready, apply the release locally:

```sh
make release
```

This updates manifests and changelog, creates a release commit, and makes an annotated `vX.Y.Z` tag. It does not push or publish a GitHub release. Review the commit, tag, changelog, and working tree before pushing.

## CI and packages

The Gitea workflow is canonical for pull request quality checks and macOS package builds. GitHub is a filtered mirror with its own Actions workflow and history. Keep the GitHub mirror free of `.gitea`; retain `.github` and the Wise submodule.

Before making a GitHub release:

1. Confirm the matching version and tag exist in the GitHub mirror.
2. Confirm the corresponding GitHub Actions build is green and inspect its uploaded DMG. Generate a SHA-256 checksum for the release asset with `shasum -a 256 <file.dmg>`.
3. Verify the package architecture, launch behavior, and installation instructions.
4. Create the GitHub Release with the reviewed changelog, DMG, and checksum.
5. Recheck the release page and download link before announcing it.

Current GitHub packages are ad-hoc signed and are not Developer ID signed or notarized. macOS Gatekeeper may require the user to approve the app in Privacy & Security. Do not describe them as Developer ID signed or notarized.
