# Clive test coverage progress

Measured on 2026-10-18 after M7. The
requested target is at least 85% line coverage for each suite.

## Frontend

Command: `NODE_OPTIONS=--no-experimental-webstorage npm run test:coverage`
from `frontend/` (Vitest V8 provider)

| Metric | Coverage |
| --- | ---: |
| Statements | 81.66% (3,907 / 4,784) |
| Branches | 72.93% (2,539 / 3,481) |
| Functions | 74.91% (1,048 / 1,399) |
| Lines | 85.53% (3,353 / 3,920) |

The run passed 503 tests in 72 files. M4 adds app-shell tests for failed listing
refreshes, out-of-order navigation responses, and persisted pane preferences.
Earlier focused coverage exercises the frontend entry point, confirm backdrop,
file list drag and tag rendering, multimedia/text previews, and truncated text.
M6 adds four storage-boundary regressions for native store hydration, invalid
persisted DTO normalization, migration from legacy keys, and failure fallback.
The HTML report is generated at
`frontend/coverage/index.html` and is ignored by Git.

The line target is met. Branch coverage is 72.93%; larger remaining gaps
include `App.tsx` (63.20% lines), `AiDebugModal.tsx` (61.11%),
`SettingsModal.tsx` (70%), and `PlanPanel.tsx` (80.73%). The extracted transfer
workflow is at 96.92% line coverage; `appConfig.ts` increased from 74.13% to
94.82% after the M6 storage tests.

## Rust / Tauri

Command: `make rust-coverage` (LLVM source instrumentation and `llvm-cov`)

| Metric | Coverage |
| --- | ---: |
| Regions | 87.55% (7,547 / 8,620) |
| Functions | 72.26% (422 / 584) |
| Lines | 86.64% (4,204 / 4,852) |

The run passed all 116 Rust tests. The HTML report is written under
`target/coverage/rust/run.*/html/index.html`; build and profile artifacts are
ignored by Git. `rustup component add llvm-tools-preview` is required once so
the coverage tools match the LLVM version used by the active Rust toolchain.

Remaining larger Rust gaps include desktop integration (0%), `main.rs`
(8.57%), and volume handling (80.43%). M6 extracted the `df -kP` output parser
for isolated success and error-path tests; it also normalizes escaped spaces in
mounted-volume names.

M7 adds two isolated regressions. `trash_empty_journal_write_failure_leaves_retryable_records`
injects a removal failure and a journal persistence failure during partial
empty, then proves retry is safe. `batch_move_reports_partial_failure_and_preserves_failed_source`
proves successful items remain moved while the failed source is preserved and
reported. These tests verify the current recovery contract but do not simulate
process termination or storage-device failure.

## Policy

Rust and frontend now have separate 85% line-coverage floors. Rust's gate parses
the filtered `llvm-cov` report; Vitest enforces its line threshold directly.
No exclusions are configured. Branch and function coverage are reported but
not gated yet: Rust LLVM currently reports no branch counters, and the measured
frontend values remain 72.93% branches / 74.91% functions. Prioritize remaining
app-shell and settings/AI branches before considering higher thresholds.

## Quality gate verification

`make quality` is the shared local/CI gate. On 2026-10-18 after M7 it passed the Tauri
contract check (42 commands, 16 DTOs), Rust fmt and Clippy with warnings denied,
116 Rust tests at 86.64% line coverage, frontend lint/build, and 503 frontend
tests across 72 files at 85.53% line coverage. The separate 85% line floors are
active. The packaged app and Apple Silicon DMG were built and verified with
`make build` and `make verify-dmg` during M5. The M7 invocation of
`make quality` additionally passed the complete frontend suite; its Rust
coverage totals are reported above.
