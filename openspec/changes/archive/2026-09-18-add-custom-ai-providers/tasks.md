# Tasks: add-custom-ai-providers

## 1. Gateway registry (Rust)

- [x] 1.1 Test-first: unit tests in `gateway.rs` for `CLIVE_PROVIDER_<ID>_BASE_URL`/`_API_KEY` resolution (shell wins over dotfile), custom-id discovery, built-in defaults with no config, case-insensitive prefix match. Verify: `cargo test gateway` red → implement → green.
- [x] 1.2 Replace `const PROVIDERS` table with built-in `(id, default_base)` seeds + dynamic discovery (`providers_now()`); remove all `GLB_*` references (`gateway.rs`, `main.rs`). Verify: `cargo test` green, `rg GLB_` empty in src-tauri.
- [x] 1.3 Add `cloud: bool` to `Provider` (localhost/127./[::1] ⇒ false) + unit tests; expose in `ai_get_config` and `/healthz` payload. Verify: tests + manual `curl /healthz` with a local httpbin-style base.
- [x] 1.4 Commands `ai_add_provider` (validate slug + http(s) URL, reject duplicate) and `ai_remove_provider` (reject built-ins, purge dotfile keys); register in `main.rs`. Verify: Rust tests for validation + write_env round-trip.

## 2. Frontend: gateway as single source of truth

- [x] 2.1 Test-first (vitest): normalize `ai_get_config` + `/healthz` into `providers: ProviderMeta[]` (id, cloud, builtin, online); `isCloudProvider`/`visibleProviders` read from it. Delete hard-coded `PROVIDERS` in `src/ai/settings.ts` and the "(lab server)" label. Verify: suite green, `rg -i lab-server src/` empty.
- [x] 2.2 App-level auto-selection: empty/unknown/`cloud&&!optIn` stored provider ⇒ first online provider + first model from `listAvailableModels()`; persist. Update `appConfig` defaults to `provider: ''`, `model: ''` (keep `normalizeConfig` backward-compatible so existing installs keep working). Verify: tests for each fallback branch + appConfig.test updates.
- [x] 2.3 Settings → AI: provider list with availability dots + cloud tag; add-provider form (id/baseUrl/key, inline validation errors from commands); edit built-in base/key (existing `ai_set_provider`); remove button for customs with confirm. Verify: component tests (mocked commands) + manual smoke.
- [x] 2.4 i18n: add/remove `settings.ai.*` keys (en + it parity test must pass); remove "OpenCode Go"-centric strings if reworded. Verify: `npm run test` i18n coverage green.

## 3. Integration + cleanup

- [x] 3.1 Live smoke on `tauri dev`: fresh `~/.clive/ai.env`, add OpenRouter (or LM Studio) via UI, healthz green, chat from drawer, remove provider ⇒ selection falls back to ollama.
- [x] 3.2 Migrate the author's machine: rewrite shell/dotfile `GLB_*` vars to `CLIVE_PROVIDER_*` (manual step, outside repo).
- [x] 3.3 Repo sweep: `rg -in "GLB_|lab-server|lab-server|kimi-k3|opencode-go" --glob '!openspec' --glob '!node_modules'` only leaves intentional built-in defaults (`gateway.rs` seeds, `DEFAULT_PROVIDER` gone) + i18n labels. Update stale task notes in `docs/plans/*` only if trivial.
- [x] 3.4 Full verify: `cargo test`, `npm run test`, `npm run lint`, `npm run build` green; commit on request.
