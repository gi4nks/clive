# Tasks — AI Plan v1

## Completed (subagent-driven, all reviewed)
- [x] T1 pure plan.ts (expandPlan/validateFolderPath/orderPlanOps) + guard/collision createFolder check
- [x] T2 chat.generatePlan (2nd model call, json in both prompts)
- [x] T3 Rust apply_plan/undo_plan + persistent journal (hardened: batchId traversal, self-subtree/ pathy rejects, spawn_blocking async)
- [x] T4 api.ts wrappers + usePlan (origin-based authoritative-issue locking, aliveRef)
- [x] T5 PlanPanel (tree, issue-locked disabled rows, two-confirm, progress/report/undo) + buildPlanTree nesting test
- [x] T6 🪄 integration + App pipeline + restart-undo banner (+ committed orphan childCount module)
- [x] T7 i18n camelCase coverage + en/it parity test + spec reconcile + AC8 smoke
- [x] final whole-branch review (APPROVED) + one fix wave (I-1/I-2/I-3/M-2/M-3/M-5), re-review CLEAN

## Follow-ups / v1.1 (non-blocking)
- [ ] apply `folderEditIssue` to `destDir` reassign too (same traversal class as createFolder)
- [ ] gate `plan.undoDone` toast on `applied>0`; align M-3 fully-skipped key-vs-journal asymmetry
- [ ] AC8 mixed partial-undo Rust test (trash fails, moves restore)
- [ ] i18n guard: cover backtick-literal keys + narrow no-count false-negative; consider App.tsx test harness
- [ ] folder-rename in panel re-attaches descendant ops (currently fails safe at apply)
- [ ] translate raw OS-error strings (M-1); token-cap the second model turn text (M-4)
- [ ] recursion into subfolders; multi-root; dedup-by-hash; agent-style iterative plan (deferred in spec §2)

## Wand scaling fix (2026-09-09, commit 66667f1) — big folders now work
- Plan generation is rule-based ({folders, rules:[{match,to}], renames, trashPatterns, fallback}); client expands against the real listing (no per-file JSON, no hallucinated names).
- Sends a compact renderPlanSignature (counts+ext histogram+sample) instead of the full listing → planner latency for ~/Downloads (399 files) went from >90s timeout to ~57s (valid plan). Rust apply/undo + PlanPanel untouched.
- Residual: ~57s is mostly provider reasoning; follow-up = stream the plan turn / raise cap gracefully / async task notification so the wait is less opaque.
