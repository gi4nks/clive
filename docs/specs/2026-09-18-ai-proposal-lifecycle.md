# AI Proposal Lifecycle

**Status:** partially implemented; release validation pending
**Date:** 2026-09-18
**Decision:** adopt a shared proposal lifecycle while keeping multiple review adapters.

## Implementation status

- [x] `AiProposal` semantic model and risk/review classification
- [x] `ChatAction` conversion and validation seam
- [x] shared proposal executor for chat and quick actions
- [x] chat Apply routed through the shared executor
- [x] quick-action rename, organize, and generated-file Apply routed through the shared executor
- [x] Plan adapter conversion, preserving per-operation progress, journal, and undo (batches are not atomic)
- [x] focused regression tests and frontend production build
- [x] visual consolidation of chat and quick actions into one `AiWorkspace` shell
- [x] high-risk `PlanPanel` remains a dedicated review adapter above the workspace
- [x] workspace mode switching preserves an open proposal
- [x] proposal context snapshot covers folder, listing, selection, and guard state
- [x] mounted location classification is available to AI context and workspace
- [x] network move/trash proposals carry plan-review metadata; chat offers plan generation
- [x] Shared controller confirms exact operations for plan-review/explicit-confirmation proposals, without model regeneration
- [x] cross-volume transfer reports non-atomic copy/remove fallback
- [x] Transfer failures never automatically replay potentially completed mutations
- [x] Rename fallback is limited to cross-device errors
- [x] Partial plan undo preserves failed inverses for retry
- [x] Chat Apply checks the snapshot captured when the request was sent
- [x] Shared frontend volume snapshot refreshes on focus and periodically
- [x] Rust blocks absent /Volumes mounts before write/restore paths can recreate parents
- [x] Plan/trash journals persist mount source and filesystem identity; recovery rejects mismatches
- [x] Shared proposal controller refreshes volume information after confirmation, before execution
- [x] Chat and quick-action proposals use the Rust `apply_plan`/`undo_plan` batch journal; generated files are created exclusively and undo checks their SHA-256 before removal
- [ ] Validate interrupted SMB copy/trash/restore on disposable network fixtures

Local verification on 2026-10-18: 384 frontend tests and 51 Rust tests pass;
TypeScript check, `cargo check`, `make build`, and DMG checksum verification
pass. A real SMB interruption drill remains unperformed. Mount checks occur before operations;
they do not provide a filesystem transaction or eliminate races during a network
failure. A remount with changed filesystem identity can conservatively block
recovery even when the original server is back. Legacy trash entries without
identity are not automatically restored onto mounted remote volumes.

The shared proposal controller now sends every operation through the Rust
batch engine. The former frontend filesystem executor and direct
`write_text_file` command have been removed from this path. `createFile` uses
exclusive creation and a content-hash inverse so undo preserves later user
edits. Partial failures remain in the same Rust journal for retry.

## Intent

Clive currently has three AI mutation paths:

- quick actions through `useAi` and `AiOverlay`;
- inline `ChatAction` cards in `ChatDrawer`;
- structured `PlanOp` review in `PlanPanel`.

They already share safety rules and filesystem application in part, but their
state, validation, error, progress, and undo semantics are exposed through
different interfaces. The user should experience one operational language:

```text
intent → proposal → review → apply → undo
```

The visual review surface may change with risk and quantity, but the lifecycle
does not.

## Decision

Introduce one proposal lifecycle module. It owns the state and invariants of a
proposed mutation. Existing surfaces become adapters:

| Existing surface | Adapter role |
| --- | --- |
| `ChatDrawer` | compact inline review for low-risk proposals |
| `AiOverlay` | compact review for quick actions and generated content |
| `PlanPanel` | dense review for multi-operation or high-risk proposals |
| context menu / `AiWidget` | intent entry points; they do not own proposal state |

The lifecycle is shared; the density of review is not.

## Proposal model

The initial model should be semantic rather than tied to a rendering surface:

```ts
type ProposalRisk = 'low' | 'medium' | 'high'
type ProposalState =
  | 'draft'
  | 'reviewing'
  | 'applying'
  | 'applied'
  | 'cancelled'
  | 'failed'

interface AiProposal {
  id: string
  origin: 'chat' | 'quick-action' | 'context-menu'
  rootPath: string
  risk: ProposalRisk
  operations: ProposalOperation[]
  warnings: string[]
  state: ProposalState
  requiresExplicitConfirmation: boolean
}
```

`ProposalOperation` should cover the current mutation vocabulary:

- `rename`;
- `createFolder`;
- `move`;
- `trash`;
- `createFile`.

`PlanOp` and `ChatAction` remain input shapes during migration. They should be
converted into `AiProposal` at one seam, then never be applied directly by a
visual surface.

## Review policy

The adapter is selected from risk, quantity, and ambiguity:

```text
review density = risk × quantity × ambiguity
```

Initial policy:

| Case | Review adapter |
| --- | --- |
| one safe rename or folder creation | inline card |
| one generated file | inline editor with Apply |
| several renames or moves | compact proposal review |
| any trash operation | explicit review and confirmation |
| many operations, warnings, or collisions | `PlanPanel` |

This is a policy module, not UI logic. Thresholds can change without editing
the chat or context-menu callers.

## Invariants

1. No proposal mutates the filesystem before explicit Apply.
2. Every operation is validated when the proposal is created and revalidated
   immediately before Apply.
3. Protected paths remain blocked regardless of the adapter.
4. A batch reports applied, skipped, and failed operations consistently.
5. Successful reversible mutations produce an undo record.
6. Trash operations require a second confirmation.
7. Cancellation is distinct from failure and does not create an error toast.
8. A proposal is bound to its context snapshot; stale context triggers a
   revalidation result instead of silently applying old assumptions.

## Migration slices

### Slice 1 — context snapshot

Create one explicit snapshot containing `currentPath`, entries, selection,
guard configuration, and attached files. Make `useAi`, `useChat`, and plan
generation consume projections of this snapshot.

### Slice 2 — proposal conversion

Convert `ChatAction`, quick-action previews, and `PlanOp` into proposals. Keep
the existing renderers, but remove direct apply decisions from them.

### Slice 3 — shared lifecycle controller

Move validation, risk classification, apply progress, error reporting, and
undo bookkeeping behind one controller. Keep filesystem adapters injected so
the interface remains testable without Tauri.

### Slice 4 — adapter selection

Choose inline review versus `PlanPanel` through the policy module. Context-menu
items should create an intent or prefilled chat message, not mount a second AI
workflow.

### Slice 5 — remove duplicate state

Retire duplicated apply/error/undo state from `useAi`, `useChat`, and plan
coordination only after the shared lifecycle has regression coverage.

## Not in scope

- replacing chat with a command palette;
- changing model providers or gateway contracts;
- making every operation atomic across the filesystem;
- removing the distinction between quick review and plan review;
- redesigning the AI activity/debug view in the first slice.

## Network locations

Clive treats network shares as mounted filesystem locations, not as a second
filesystem protocol. macOS owns SMB/NFS/WebDAV authentication and mounting;
Clive operates on the resulting mount point (for example `/Volumes/NAS`).
The shared location model classifies the current path as local, network,
external, or unknown so AI context and operation policy can become
network-aware without storing credentials or parsing remote URLs as paths.

Cross-volume moves on network locations must remain explicitly reviewable:
they may degrade to copy-then-remove, may lose atomicity, and may not support
the same trash/undo guarantees as a local volume.

## First implementation target

Start with Slice 2 for `ChatAction` and the existing quick-action rename flow.
They exercise the smallest useful common path: validate → review → apply →
undo. Once stable, add `PlanOp` as the high-density adapter.
