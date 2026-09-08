# Proposal: AI integration for the File Manager (via `@gi4nks/wise`)

## Why

Clive is a local-first macOS file manager. Adding an LLM layer unlocks high-value, otherwise-tedious actions: human-readable batch renaming, folder organization, summarizing/describing selected files, generating new file content, finding duplicates, and asking questions about the tree in natural language. The monorepo already standardizes multi-provider LLM access through `@gi4nks/wise` (a Vercel AI SDK v7 wrapper), which homo and napoleon consume — so clive should build on the same abstraction rather than re-invent provider handling.

## What Changes

- Introduce a **local, loopback-only AI Gateway in Rust** that the Tauri webview talks to for every model/provider (local Ollama/OMLX now, cloud later). This resolves webview CORS for *all* providers and keeps API keys server-side (the webview never holds cloud keys).
- Run `@gi4nks/wise` in the frontend, building models whose `baseURL` points at the gateway, so provider calls are uniform (OpenAI-compatible `/v1`, plus native Ollama `/api`).
- Reuse the pure-React `wise/react` components (`WiseProvider`, `ModelSelector`, `ProviderKeyConfig`) for provider/model configuration, persisting selections in `@tauri-apps/plugin-store`.
- Add **magic actions** surfaced through the existing context menu and status-bar launcher: Rename with AI, Summarize/Describe, Generate content, and Organize folder — all producing *proposed* results the user reviews before anything is applied.
- Add a cross-cutting **action-safety** layer: validate proposed names/paths against the same rules the Rust `rename` enforces, require explicit confirmation for every mutation, and record an **undo journal** for batch rename/move.
- Enforce **input budgeting, model-capability gating, and cloud privacy**: cap/truncate file bytes before prompting, gate vision-dependent actions on vision-capable models, and warn before any request that leaves the machine.
- Add **duplicate detection** (content/perceptual hashing, reusing the `james` strategy) and **natural-language search** via tool-calling over the existing filesystem commands (no embeddings).
- As a prerequisite, **extend `@gi4nks/wise`** with an optional `baseUrl` on cloud providers so the gateway can be used as their endpoint (backward-compatible for homo/napoleon).

## Capabilities

### New Capabilities

- `ai-gateway`: the loopback Rust HTTP gateway that fronts all providers, injects keys, answers CORS, exposes `/healthz`, and gates cloud/privacy.
- `ai-provider-config`: provider/model selection and persistence, reusing `wise/react`; per-model capability metadata; health probing.
- `ai-runtime`: running `wise` in the webview through the gateway — structured and streaming calls, cancellation, and input budgeting.
- `ai-actions`: non-destructive magic actions (rename, summarize/describe, generate) with editable previews and async UX.
- `ai-organize`: AI folder-organization plan with preview and confirmation before applying moves.
- `ai-action-safety`: shared validation, collision handling, confirm-before-mutate, and batch undo.
- `ai-dedup-search`: duplicate detection via hashing (reusing `james`) and natural-language search via filesystem tool-calling.

### Modified Capabilities

- None against the deployed `openspec/specs/` baseline. `ai-actions`/`ai-organize` plug into the already-specified `context-menu`, `status-bar`, and `fs-commands` surfaces; the internal change to `@gi4nks/wise` (optional `baseUrl`) is tracked here and as a prerequisite task, not as a change to another project's specs.

## Impact

- **Frontend (clive/fm):** new `ai/` module (gateway client, `createAIModel` factory, `generateObject`/`streamText` helpers, budgeting); reuse of `wise/react` components; actions wired into `ContextMenu`/`actionsFor` and the status-bar launcher; provider-settings screen; Tauri `store` + `http` usage.
- **Backend (clive/fm, Rust):** new `axum` gateway (started from Tauri setup), provider pass-through + OpenAI-compat translation, key injection, CORS, healthz; a `dedup` command reusing `james`' hashing approach.
- **Shared library (`commons/wise`):** add optional `baseUrl` to `anthropic`/`gemini`/`openai` `ProviderConfig` entries (backward-compatible). Requires a coordinated bump; homo/napoleon unaffected because the field is optional.
- **Dependencies:** clive frontend adds `@gi4nks/wise` (`file:`), `ai`, `zod`, `@tauri-apps/plugin-store`, `@tauri-apps/plugin-http`; clive Rust adds `axum`/`tokio` (tokio already present) + `reqwest`; config `tauri.conf.json` CSP allows `http://127.0.0.1:<gateway>`.
- **Testing:** clive/fm gains a vitest harness (none today) to unit-test validation, plan→operations mapping, budgeting, and gateway routing with `wise`/network mocked.
- **Privacy:** local-first default; cloud is opt-in per provider and per action, with an explicit "contents leave this machine" warning.

## Phasing

- **V1 (build first):** local gateway (Ollama/OMLX), provider config, runtime (structured/streaming/abort/budgeting), `ai-actions` (rename/summarize/generate), `ai-organize` (plan→confirm→apply), `ai-action-safety` (validation+confirm+undo), async UX, health, vitest setup.
- **V2:** cloud providers through the gateway (+ `wise` `baseUrl` extension + privacy gating active), natural-language search (agent), duplicate detection.
- **Non-goals (v1/v2):** semantic/vector (embedding) search, autonomous multi-step file mutation without confirmation, Windows/Linux.
