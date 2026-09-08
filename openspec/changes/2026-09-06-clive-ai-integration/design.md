# Design: AI integration for clive

## Context

clive is Tauri 2 (Rust backend + WKWebView frontend), no Node server. `@gi4nks/wise` is a Vercel AI SDK v7 wrapper whose provider clients perform `fetch`. In homo/napoleon wise runs in Next **server actions** (Node, keys server-side, no CORS). clive has no such server, so we must decide where the `fetch` to providers actually happens.

## Core decision: a loopback AI Gateway in Rust

A small HTTP server bound to `127.0.0.1` runs inside the Tauri process (started in `setup`, stopped on exit). The webview talks **only** to this gateway for all LLM traffic.

Why a gateway (vs. `@tauri-apps/plugin-http` + injecting `fetch` into wise):
- It is the single choke point for **keys** (Rust-held, never shipped to the webview), **CORS** (gateway returns permissive CORS for the webview origin), **cloud/privacy gating** (reject or warn before anything leaves the machine), **budgeting/rate/telemetry**, and **health**.
- It normalizes every upstream to one wire format so the frontend has one code path.
- `plugin-http`+`fetch`-injection would work but keeps cloud keys in the webview, needs a `fetch` extension in wise, and scatters privacy/health concerns across the frontend.

### Endpoints

The gateway is a **multi-provider router**. It builds a provider registry from `GLB_*` env vars (never exposed to the webview): `opencode-go` (`GLB_OPENCODE_GO_BASE_URL` + `GLB_OPENCODE_API_KEY`), `opencode-zen` (`GLB_OPENCODE_ZEN_BASE_URL`), `ollama` (`GLB_OLLAMA_BASE_URL` → lab-server). Each base is already OpenAI-compatible (`…/v1`). Providers missing a base are skipped.

- `GET  /healthz` → `{ ok, providers: { 'opencode-go': bool, ollama: bool, … } }` (probes each upstream `/models`)
- `GET  /v1/models` → aggregates every provider's models, **prefixing each id with `<provider>/`** (e.g. `opencode-go/kimi-k3`, `ollama/qwen38-scene:latest`)
- `POST /v1/chat/completions` → reads the `<provider>/<model>` prefix on `model`, routes to that upstream, injects its `Authorization: Bearer <key>`, and **streams the SSE response straight through** (`bytes_stream` → `Body::from_stream`).

### Model selection (homo-style)

Like homo's `activeProvider` + `activeModelName`, clive lets the user pick a **provider** then a **model** from that provider's list (`ai/settings.ts` `PROVIDERS` + gateway-fetched models filtered per provider), persisted in `localStorage`. All provider credentials/keys stay in the gateway env; the webview only ever sends the placeholder `local-gateway` key. Default target: **`opencode-go` / `kimi-k3`** (verified reachable).

Ollama natively exposes `/v1/*` (OpenAI-compatible), so local models ride the same `/v1` path as cloud — meaning **one frontend provider** (`openai`) pointed at the gateway covers local and cloud uniformly.

### wise interaction

The frontend calls `createAIModel('openai', modelId, { openai: { apiKey: 'local-gateway', baseUrl: `http://127.0.0.1:${port}/v1` } })`. The apiKey is a dummy because the gateway holds the real ones. For native Ollama tooling we can alternatively use `createAIModel('ollama', ..., { ollama: { baseUrl } })`, already supported by wise.

## Prerequisite: extend `@gi4nks/wise`

Add optional `baseUrl?: string` to `ProviderConfig.anthropic | .gemini | .openai`, forwarded to the SDK's `createX({ apiKey, baseURL })`. Fully backward-compatible (omitted ⇒ current behavior), so homo/napoleon are unaffected. `openai`/`ollama` are the only ones strictly needed by the gateway path; add all three for symmetry.

## Model capabilities & gating

Each configured model carries metadata: `supportsVision`, `maxContextTokens`. Actions declare requirements; the UI disables an action when the active model can't satisfy it (e.g. "Descrivi immagine" requires `supportsVision`).

## Input budgeting

Before prompting, file text is capped (configurable byte budget, e.g. 24 KB/file, 96 KB/call) with head+tail truncation and an explicit "truncated" marker. Over-budget or binary files are described by name/metadata only. Binary/image handling is gated on vision capability.

## Safety model (cross-cutting)

1. **Propose → validate → preview → confirm → apply → undo.**
2. Validation mirrors the Rust `rename` rules (non-empty, no `/`, not `.`/`..`, no on-disk collision) and de-duplicates names within a batch; paths are re-checked for existence at apply time (the 2s poller can have changed them).
3. Mutations only run after an explicit confirmation showing the concrete diff (per-row for renames, a tree for organize).
4. An **undo journal** records inverse operations per batch; "Annulla" reverts, reporting partial failures.

## Async UX

Long model calls are cancellable (`AbortSignal` through `streamText`/`generateObject`). While an action runs, its trigger is disabled (no double-submit), a spinner shows, and closing its panel aborts. Results render in editable surfaces: a rename table (accept/edit/exclude per row), an organize tree-diff, and a summary drawer.

## Natural-language search & dedup (no embeddings)

- **Dedup**: content hash (and perceptual hash for images) computed in Rust, reusing `james`' strategy; AI is used only to *label/group* results, never to detect.
- **Smart search**: an agent loop that calls existing filesystem tools (`list_dir`, optionally `read_text_file`) driven by `streamText` + `tool()`, with a hard **step budget** and read-only tools; it returns candidate paths and may `navigate`/`open`. It is name/metadata reasoning, not semantic vectors.

## Where AI surfaces live (reuse of existing UI)

- **Magic actions**: entries appended to the shared `actionsFor` action set → appear in the right-click `ContextMenu`, the status-bar `context-actions` widget, and the launcher.
- **Settings**: `wise/react` config components in a "Modello AI" panel (toolbar) writing to the Tauri store.
- **Chat/agent**: a right-side drawer reserved for the search/agent phase.

## Phasing

- **V1**: local-only gateway (Ollama/OMLX), provider config, runtime (structured+streaming+abort+budgeting), `ai-actions` (rename/summarize/generate), `ai-organize`, `ai-action-safety` (validation+confirm+undo), async UX, health, vitest setup.
- **V2**: cloud providers via the gateway (activates the `wise` `baseUrl` extension + cloud/privacy gating), NL search (agent), dedup.
- **Deferred/non-goals**: embeddings/semantic search, autonomous mutation, cross-platform.

## Testing

- Unit (vitest, no network): name/plan validation vs rename rules, collision/dedup, byte budgeting/truncation, gateway routing table, tool-calling step budget, undo inverse-op construction. `wise` and `fetch` mocked.
- Integration smoke: gateway `/healthz` and `/v1/models` against a running Ollama; a structured rename call against a fake provider.
- Manual: ticking/preview/confirm/undo flows; cloud-disabled enforcement; vision gating.
