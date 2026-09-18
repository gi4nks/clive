# Tasks: AI integration for clive

Legend: `[x]` done & verified · `[~]` partial (noted) · `[ ]` not started.

## 0. Prerequisites

- [x] 0.1 `commons/wise`: add optional `baseUrl` to `anthropic`/`gemini`/`openai` `ProviderConfig`, forwarded to `createX({ apiKey, baseURL })` (backward-compatible); rebuilt `dist`; wise type-check + 8/8 tests green; homo/napoleon unaffected (field optional)
- [x] 0.2 clive/fm: add vitest + `api`/`invoke` mock harness (no network in tests)
- [x] 0.3 clive/fm: add `@gi4nks/wise` (file:), `ai`, `zod`, `@tauri-apps/plugin-store` (frontend); `axum`/`tower-http`/`reqwest` (Rust; `tokio` present)

## 1. V1 — Gateway + config + runtime

- [x] 1.1 Rust: axum AI Gateway bound to `127.0.0.1:<ephemeral>`, started with the Tauri app; port published via `GatewayHandle`, `gateway_base` command
- [x] 1.2 Rust: `GET /healthz` reporting per-provider reachability
- [x] 1.3 Rust: `GET /v1/models` aggregating reachable upstreams (OpenAI-style)
- [x] 1.4 Rust: `POST /v1/chat/completions` routes by `<provider>/<model>` prefix, injects the provider key, SSE passthrough (`bytes_stream`→`Body::from_stream`)
- [x] 1.5 Rust: permissive CORS for the webview origin; loopback-only bind
- [ ] 1.6 tauri.conf.json: explicit CSP `connect-src` allows `http://127.0.0.1:*` (currently left permissive `csp: null` — works, hardening pending)
- [x] 1.7 Frontend: wise factory `createAIModel('openai', model, { openai:{ baseUrl: gateway } })`
- [x] 1.8 Frontend: `generateStructured(schema,prompt,signal)` via `generateObject`; `streamAssistant` via `streamText`; `AbortSignal` threaded
- [x] 1.9 Frontend: input budgeting — per-file + total cap, head+tail truncation with marker, binary/dir metadata-only (unit-tested)
- [~] 1.10 Provider+model selection made configurable (homo-style): Provider catalog (`PROVIDERS`) + model dropdown filtered per provider, persisted via `localStorage`. Keys resolved by the gateway from `GLB_*` env (never in frontend). Not yet: literal reuse of `wise/react` components nor `@tauri-apps/plugin-store` (dep added but unwired)
- [x] 1.11 Model capability metadata (`supportsVision`, `maxContextTokens`) + gating (`ai/capabilities.ts`, wired into "Riassumi"; unit-tested)
- [x] 1.12 Health probe + disable AI affordances when offline (done; probe is lazy on popover-open, not on startup — acceptable)

## 2. V1 — Actions

- [x] 2.1 Rename with AI — `generateObject` → `{path,newName}[]` from budgeted content (unit-tested)
- [~] 2.2 Summarize/Describe selected files → inline result panel. Vision-image description gating not wired (see 1.11)
- [x] 2.3 Generate content → proposed name+body → confirm → `write_text_file`
- [x] 2.4 Organize folder → move plan into subfolders → checkbox preview → confirm → folders+`move_file` (unit-tested)
- [x] 2.5 Expose actions through `actionsFor` (context menu + status-bar context-actions) — "Rinomina/Organizza/Riassumi con AI" added; the run/preview/apply/undo flow was centralized in `useAi` + a global `AiOverlay` shared by the panel and the context menu

## 3. V1 — Safety (cross-cutting)

- [x] 3.1 Validate proposed names against Rust `rename` rules (unit-tested)
- [x] 3.2 Intra-batch dedupe + on-disk collision → unique suffix (unit-tested)
- [x] 3.3 Re-validate path existence at apply time (in `applyPlan`, unit-tested)
- [x] 3.4 Confirm-before-mutate: preview panel with editable rows + Apply/Cancel gate
- [x] 3.5 Undo journal: inverse ops per batch, single Undo, reports failures (unit-tested)

## 4. V1 — Async UX

- [x] 4.1 Cancellation via `AbortSignal` on the Annulla control and on panel close
- [x] 4.2 In-flight disables the triggers (no double-submit) + busy labels
- [x] 4.3 Editable rename table (accept/edit/exclude per row)
- [~] 4.4 Organize preview is a checklist, not a full tree-diff
- [~] 4.5 Results (summary/previews/undo) render in a global bottom overlay (`AiOverlay`), not a side drawer/chat; good enough for V1

## 5. V2 — Cloud, agent, dedup

- [x] 5.1 Cloud routing via the gateway (OpenCode Go + Zen, keys injected in Rust from `GLB_*` env, using the `wise` `baseUrl` extension) — live in V1
- [~] 5.2 Cloud/privacy warning shown in the AI panel when a cloud (opencode) provider is selected. Not yet: per-action opt-in / block
- [ ] 5.3 NL search agent via `streamText`+`tool()` over read-only FS tools; step budget
- [ ] 5.4 Dedup: Rust content/perceptual hash command (reuse `james`); AI labeling only

## 6. Verification

- [x] 6.1 `npm run build` + `npm run lint` clean (only the pre-existing `backStack` warning remains)
- [x] 6.2 `cargo check` + `cargo clippy` clean; `commons/wise` builds, homo/napoleon unaffected by the optional `baseUrl`
- [x] 6.3 vitest: validation, collision, budgeting, organize/route mapping, undo-inversion (28 tests)
- [x] 6.4 `openspec validate 2026-09-06-clive-ai-integration --strict` — passes
- [ ] 6.5 Manual GUI: propose→preview→confirm→apply→undo; health-off; vision gating; cloud-blocked
