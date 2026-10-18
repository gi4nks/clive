# M6 — Focused coverage and regression floors

**Status:** completed locally; remote CI validation will occur on the next PR.

## Decision record

Set an 85% line-coverage minimum independently for Rust and React/TypeScript.
Both measured baselines already exceed it, so the gate prevents aggregate line
coverage regressions while the team works toward 90%. Keep branch and function
coverage visible but ungated: Rust LLVM currently provides no branch counters,
and frontend branch/function baselines are 72.93% and 74.91%. No source files
are excluded.

## Implementation

- Vitest enforces `coverage.thresholds.lines: 85`.
- `scripts/rust-coverage.sh` checks the `TOTAL` line percentage from the
  dependency-filtered LLVM report and exits nonzero below 85%.
- `make quality` runs Rust and frontend coverage-enabled test suites after
  formatting, Clippy, contract checks, and frontend build. Coverage tests also
  serve as the suite tests, avoiding a second plain test run.
- The Gitea preparation step installs `llvm-tools-preview`; Rust coverage still
  requires macOS/Xcode CLT.
- Added storage/config migration tests in
  `frontend/src/settings/appConfig.store.test.ts` and pure disk-space output
  parser tests in `src-tauri/src/commands/filesystem/volumes.rs`.

## Measured result

| Suite | Lines | Branches | Functions | Tests |
| --- | ---: | ---: | ---: | ---: |
| React / TypeScript | 85.53% (3,353/3,920) | 72.93% | 74.91% | 503 / 72 files |
| Rust / Tauri | 86.44% (4,138/4,787) | unavailable | 72.07% | 114 |

`appConfig.ts` increased from 74.13% to 94.82% line coverage. Volume handling
increased from 77.26% to 80.43%. Its output parser now tests malformed `df`
responses and converts escaped mount spaces for the displayed name.

## Remaining gaps and tradeoffs

- The floor is aggregate per language. It can conceal a low-coverage module;
  the report therefore retains per-file figures and critical gaps.
- Frontend `App.tsx` is 63.20%, `SettingsModal.tsx` 70%, and `AiDebugModal.tsx`
  61.11%. Rust desktop integration is 0%, `main.rs` 8.57%, and volume handling
  80.43%.
- Rust branch coverage is not emitted by the current LLVM setup. Frontend
  branch/function coverage remains report-only until more risk-focused tests
  raise its baseline.
- The first remote Gitea PR run remains necessary to validate the runner's
  `llvm-tools-preview` installation, loopback permissions, and job duration.

## Acceptance

- Rust and frontend have distinct 85% line gates with no exclusions.
- `make quality` includes the coverage suites and can fail on a regression.
- The current full test suites pass and report their metrics separately.
- Remaining module-level and native integration gaps are explicit in the audit.
