# Proposal: AI Plan — from a chat reorganization analysis to an interactive, reversible bulk plan

## Why
Clive's AI chat can already produce a long textual analysis of a folder (e.g. "smista la Desktop in 01_Personal, 02_Projects, cestina i duplicati") but there is no way to ACT on it: applying ~200 file moves by hand is impractical, and the existing `<<<ACTIONS>>>` cards don't scale or show the folder tree. Users need a "magic button" that turns the analysis into a reviewable plan and applies it atomically with a full undo.

## What Changes
- **Bottone 🪄** on assistant chat messages → second structured model call (`generatePlan`) that returns a compact name-based JSON, expanded deterministically against the real listing (`expandPlan`) into validated `PlanOp`s (unknown basenames/collisions/protected → flagged & excluded).
- **PlanPanel**: interactive tree (create/rename/move/trash), per-op include/exclude, inline folder/rename edit + folder reassign, two-confirm for the trash subset, live `plan-progress` bar, apply report + **Annulla tutto**.
- **Rust authoritative batch engine** `apply_plan`/`undo_plan`: phased order (create→rename→move→trash), `is_protected` guard enforced server-side regardless of the client, persisted per-batch inverse journal (`~/.clive/plan-journal/<id>.json`, survives restart), runs off the main thread (`spawn_blocking`) so progress streams.
- **Coexists** with inline `<<<ACTIONS>>>` cards and the AiOverlay one-shot flow (no regression); v1 is flat (current folder only), trash goes to the unified macOS `~/.Trash`.

## Impact
- Affected specs: `clive/docs/specs/2026-09-08-ai-plan-design.md`.
- Affected code: new `ai/plan.ts`, `ai/usePlan.ts`, `ai/PlanPanel.tsx`, `ai/createPlanFromMessage.ts`, `ai/planJournalStore.ts`, `commands/plan.rs`; modified `ai/chat.ts`, `api.ts`, `ai/ChatDrawer.tsx`, `App.tsx`, `main.rs`, `i18n/{en,it}.json`.
- Verification: cargo 26/26, clippy clean, tsc 0, vitest 245/245, make build exit 0.
