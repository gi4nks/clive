# M5 — Tauri smoke test and quality gates

**Status:** implemented locally; first Gitea pull request run pending.

## Decision

Use the existing macOS DMG workflow and its shared Gitea runner to run one
reproducible `make quality` gate before packaging. This keeps the toolchain and
artifact build on the already configured Apple Silicon macOS runner instead of
introducing a second runner definition whose label or installed SDKs are not
available in this checkout.

## Quality gate

`make quality` runs, in order:

1. Frontend-to-Rust Tauri command and DTO contract check.
2. `cargo fmt --all -- --check`.
3. `cargo clippy --all-targets -- -D warnings`.
4. `cargo test --all-targets`.
5. Frontend lint and production build/type check.
6. Full Vitest suite.

The Gitea workflow invokes the gate for pull requests to `main`, pushes to
`main`, SemVer tags and manual runs. Successful runs then make the release DMG
and call `make verify-dmg` before artifact upload. The verifier requires exactly
one expected Apple Silicon DMG, checks its image checksum, and verifies the
app's executable and ad-hoc signature.

M6 now enforces separate 85% line-coverage floors for Rust and frontend. Branch
and function percentages remain informational, and no exclusions are applied.

## Smoke evidence

- Local release build: `make build` produced `Clive.app` and
  `Clive_1.2.0_aarch64.dmg`.
- Native launch: the built app opened on macOS and rendered the initial home
  directory listing (12 entries), exercising the real Tauri directory-list
  IPC path.
- Artifact validation: `make verify-dmg` passed `hdiutil verify`, executable
  presence and `codesign --verify --deep --strict`.
- Quality: 112 Rust tests and 499 frontend tests passed; formatting, Clippy
  with warnings denied, contract check, Oxlint and Vite build completed.

## Tradeoffs and remaining validation

- Reusing the DMG workflow means PR validation performs the macOS packaging
  step and costs more runner time than a separate test-only job. It also avoids
  unverified runner labels and duplicated dependency setup.
- The sandbox cannot open loopback listeners, so the full Rust suite required
  the authorized outside-sandbox run. The CI runner must permit loopback for
  these gateway tests.
- The native smoke covered app startup and a read-only listing command. It did
  not exercise real cross-volume transfer or mount/eject; those remain manual
  device-level checks.
- The first Gitea PR workflow run is still required to verify remote reusable
  workflow compatibility and uploaded artifact retention.

## Acceptance criteria

- `make quality` succeeds locally on the intended toolchain.
- The release DMG builds and passes `make verify-dmg`.
- The app launches and displays a directory listing through real Tauri IPC.
- A Gitea pull request run remains the final remote validation item.
