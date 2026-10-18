use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Instant;

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;

/// A configured upstream provider. The frontend selects it by using a model id
/// of the form `<id>/<model>`; the gateway routes on that prefix and injects the
/// key, so credentials never reach the webview.
#[derive(Clone)]
struct Provider {
    id: String,
    base_url: String, // already ends with /v1
    api_key: Option<String>,
    /// false only for loopback/local endpoints (privacy gate).
    cloud: bool,
    builtin: bool,
}

/// Shared handle holding the gateway's bound port once it is listening.
#[derive(Clone)]
pub struct GatewayHandle(pub Arc<Mutex<Option<u16>>>);

#[derive(Debug, Deserialize)]
struct HealthQuery {
    provider: Option<String>,
    model: Option<String>,
}

impl GatewayHandle {
    pub fn new() -> Self {
        GatewayHandle(Arc::new(Mutex::new(None)))
    }
    fn set_port(&self, port: u16) {
        if let Ok(mut g) = self.0.lock() {
            *g = Some(port);
        }
    }
}

#[derive(Clone)]
struct AppState {
    client: reqwest::Client,
    request_seq: Arc<AtomicU64>,
}

/// Built-in providers: (id, default base url). Any OpenAI-compatible endpoint
/// can be added by the user as a *custom* provider via `ai.env` / env vars:
/// `CLIVE_PROVIDER_<ID>_BASE_URL` (+ `CLIVE_PROVIDER_<ID>_API_KEY`), where
/// `<ID>` is the id uppercased with `-` mapped to `_`.
const BUILTINS: &[(&str, &str)] = &[
    ("opencode-go", "https://opencode.ai/zen/go/v1"),
    ("opencode-zen", "https://opencode.ai/zen/v1"),
    ("ollama", "http://localhost:11434/v1"),
];

const PROVIDER_PREFIX: &str = "CLIVE_PROVIDER_";

fn env_segment(id: &str) -> String {
    id.to_uppercase().replace('-', "_")
}
fn base_var(id: &str) -> String {
    format!("{PROVIDER_PREFIX}{}_BASE_URL", env_segment(id))
}
fn key_var(id: &str) -> String {
    format!("{PROVIDER_PREFIX}{}_API_KEY", env_segment(id))
}

/// Reverse of `base_var`: `CLIVE_PROVIDER_LM_STUDIO_BASE_URL` → `lm-studio`.
fn id_from_base_var(var: &str) -> Option<String> {
    let rest = var
        .strip_prefix(PROVIDER_PREFIX)?
        .strip_suffix("_BASE_URL")?;
    let id = rest.to_lowercase().replace('_', "-");
    valid_provider_id(&id).then_some(id)
}

/// Ids are DNS-slug-like (`[a-z0-9-]`, 2..=32, must start alphanumeric). The
/// `opencode` prefix is reserved for the built-ins (session header quirk).
fn valid_provider_id(id: &str) -> bool {
    let bytes: &[u8] = id.as_bytes();
    if bytes.len() < 2 || bytes.len() > 32 {
        return false;
    }
    if !bytes[0].is_ascii_alphanumeric()
        || !bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'-')
    {
        return false;
    }
    !id.starts_with("opencode")
}

/// A usable `http(s)://host[/path]` base URL.
fn valid_base_url(url: &str) -> bool {
    let rest = url
        .strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"));
    match rest {
        Some(r) => {
            !r.is_empty() && !r.contains(char::is_whitespace) && r.contains('.')
                || r.starts_with("localhost")
                || r.starts_with("[::1]")
        }
        None => false,
    }
}

/// Loopback/local endpoints are not "cloud" for the privacy gate.
fn derive_cloud(base_url: &str) -> bool {
    let b = base_url.to_lowercase();
    !(b.starts_with("http://localhost")
        || b.starts_with("https://localhost")
        || b.starts_with("http://127.")
        || b.starts_with("https://127.")
        || b.starts_with("http://[::1]")
        || b.starts_with("https://[::1]"))
}

/// The clive dotfile holding provider config (key/base per provider).
fn ai_env_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".clive").join("ai.env"))
}

/// Parse `KEY=VALUE` lines from the dotfile (skips comments/blank, strips quotes).
fn parse_env(text: &str) -> HashMap<String, String> {
    let mut m = HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let k = k.trim();
            let v = v.trim().trim_matches('"').trim_matches('\'');
            if !k.is_empty() {
                m.insert(k.to_string(), v.to_string());
            }
        }
    }
    m
}

/// Read the dotfile as a map (empty if missing).
fn file_env() -> HashMap<String, String> {
    ai_env_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| parse_env(&s))
        .unwrap_or_default()
}

/// Effective value for a var: shell env wins, else dotfile. Non-empty only.
fn lookup(
    shell: &HashMap<String, String>,
    file: &HashMap<String, String>,
    name: &str,
) -> Option<String> {
    shell
        .get(name)
        .cloned()
        .filter(|s| !s.is_empty())
        .or_else(|| file.get(name).cloned().filter(|s| !s.is_empty()))
}

/// Snapshot of the process environment as a map.
fn shell_env() -> HashMap<String, String> {
    std::env::vars().collect()
}

/// Build the registry: built-ins (with optional overrides) plus every custom
/// provider declared via `CLIVE_PROVIDER_<ID>_BASE_URL` in the shell env or the
/// dotfile. Pure and injectable so tests don't touch the real environment.
fn build_providers(
    file: &HashMap<String, String>,
    shell: &HashMap<String, String>,
) -> Vec<Provider> {
    let mut out: Vec<Provider> = Vec::new();
    for (id, default_base) in BUILTINS {
        let base = lookup(shell, file, &base_var(id)).unwrap_or_else(|| default_base.to_string());
        let base_url = base.trim_end_matches('/').to_string();
        out.push(Provider {
            id: id.to_string(),
            cloud: derive_cloud(&base_url),
            api_key: lookup(shell, file, &key_var(id)),
            base_url,
            builtin: true,
        });
    }
    let mut custom_ids: Vec<String> = Vec::new();
    for k in file.keys().chain(shell.keys()) {
        if let Some(id) = id_from_base_var(k) {
            custom_ids.push(id);
        }
    }
    custom_ids.sort();
    custom_ids.dedup();
    for id in custom_ids {
        if BUILTINS.iter().any(|(b, _)| *b == id) {
            continue;
        }
        if let Some(base) = lookup(shell, file, &base_var(&id)) {
            let base_url = base.trim_end_matches('/').to_string();
            out.push(Provider {
                cloud: derive_cloud(&base_url),
                api_key: lookup(shell, file, &key_var(&id)),
                base_url,
                builtin: false,
                id,
            });
        }
    }
    out
}

/// Compute the registry fresh per call: keys saved from Settings take effect
/// without restarting the gateway.
fn providers_now() -> Vec<Provider> {
    build_providers(&file_env(), &shell_env())
}

/// Serialise a provider id's config into the dotfile map, then write it atomically.
fn write_env(mut edits: HashMap<String, Option<String>>) -> Result<(), String> {
    let path = ai_env_path().ok_or("HOME not set")?;
    write_env_at(&path, &mut edits)
}

fn write_env_at(
    path: &std::path::Path,
    edits: &mut HashMap<String, Option<String>>,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Merge: start from existing file, apply edits (Some→set, None→remove).
    let mut current = std::fs::read_to_string(path)
        .ok()
        .map(|text| parse_env(&text))
        .unwrap_or_default();
    for (k, v) in edits.drain() {
        match v {
            Some(val) => {
                current.insert(k, val);
            }
            None => {
                current.remove(&k);
            }
        }
    }
    let mut lines: Vec<String> = current.iter().map(|(k, v)| format!("{k}={v}")).collect();
    lines.sort();
    let body = format!(
        "# clive AI provider config (managed by Settings → AI)\n{}\n",
        lines.join("\n")
    );
    let tmp = path.with_extension("env.tmp");
    std::fs::write(&tmp, body.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Bind a loopback-only TCP listener, spawn the axum server, publish the port.
pub async fn start(handle: GatewayHandle) -> std::io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let port = listener.local_addr()?.port();

    let state = AppState {
        client: reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new()),
        request_seq: Arc::new(AtomicU64::new(0)),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/models", get(models))
        .route("/v1/chat/completions", post(chat_completions))
        .layer(cors)
        // A directory listing and plan prompt are intentionally compact. A
        // hard cap prevents the loopback gateway from becoming an accidental
        // unbounded memory sink when a caller sends a malformed request.
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .with_state(state);

    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    handle.set_port(port);
    Ok(port)
}

async fn probe(client: &reqwest::Client, p: &Provider) -> bool {
    let mut req = client
        .get(format!("{}/models", p.base_url))
        .timeout(std::time::Duration::from_secs(10));
    if let Some(k) = &p.api_key {
        req = req.header(header::AUTHORIZATION, format!("Bearer {k}"));
    }
    matches!(req.send().await, Ok(r) if r.status().is_success())
}

async fn model_available(client: &reqwest::Client, p: &Provider, model: &str) -> bool {
    let mut req = client
        .get(format!("{}/models", p.base_url))
        .timeout(std::time::Duration::from_secs(10));
    if let Some(k) = &p.api_key {
        req = req.header(header::AUTHORIZATION, format!("Bearer {k}"));
    }
    match req.send().await {
        Ok(r) if r.status().is_success() => r
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| {
                v.get("data").and_then(Value::as_array).map(|a| {
                    a.iter()
                        .any(|m| m.get("id").and_then(Value::as_str) == Some(model))
                })
            })
            .unwrap_or(false),
        _ => false,
    }
}

async fn healthz(Query(query): Query<HealthQuery>, State(st): State<AppState>) -> Json<Value> {
    healthz_for(&st, &providers_now(), query).await
}

async fn healthz_for(
    st: &AppState,
    providers_list: &[Provider],
    query: HealthQuery,
) -> Json<Value> {
    let mut providers = serde_json::Map::new();
    let mut any = false;
    for p in providers_list {
        let ok = probe(&st.client, p).await;
        any |= ok;
        providers.insert(p.id.clone(), json!(ok));
    }
    let selected = match (query.provider.as_deref(), query.model.as_deref()) {
        (Some(provider_id), Some(model_id)) => {
            let provider_ok = providers
                .get(provider_id)
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let model_ok = if provider_ok {
                match providers_list.iter().find(|p| p.id == provider_id) {
                    Some(p) => model_available(&st.client, p, model_id).await,
                    None => false,
                }
            } else {
                false
            };
            json!({ "provider": provider_id, "model": model_id, "providerOk": provider_ok, "modelAvailable": model_ok })
        }
        _ => Value::Null,
    };
    Json(json!({ "ok": any, "providers": providers, "selected": selected }))
}

/// Aggregate models from all providers, prefixing ids with `<provider>/`.
async fn models(State(st): State<AppState>) -> Response {
    models_for(&st, &providers_now()).await
}

async fn models_for(st: &AppState, providers: &[Provider]) -> Response {
    let mut data: Vec<Value> = Vec::new();
    for p in providers {
        let mut req = st
            .client
            .get(format!("{}/models", p.base_url))
            .timeout(std::time::Duration::from_secs(10));
        if let Some(k) = &p.api_key {
            req = req.header(header::AUTHORIZATION, format!("Bearer {k}"));
        }
        if let Ok(r) = req.send().await {
            let v: Value = r.json().await.unwrap_or_else(|_| json!({ "data": [] }));
            if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
                for m in arr {
                    if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                        data.push(json!({
                            "id": format!("{}/{}", p.id, id),
                            "object": "model",
                            "owned_by": p.id,
                        }));
                    }
                }
            }
        }
    }
    Json(json!({ "object": "list", "data": data })).into_response()
}

/// A stable per-process session id, required by the OpenCode Go/Zen chat
/// endpoint (`x-opencode-session`); without it those providers reject
/// chat/completions with a "MissingSessionID" error. `/models` is fine without.
fn session_id() -> &'static str {
    static SID: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    SID.get_or_init(|| {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("clive-{nanos:x}")
    })
}

/// Route a chat completion to the provider implied by the `<provider>/<model>`
/// prefix, inject the key, and stream the upstream response straight through.
async fn chat_completions(State(st): State<AppState>, Json(body): Json<Value>) -> Response {
    chat_completions_for(&st, &providers_now(), body).await
}

async fn chat_completions_for(st: &AppState, providers: &[Provider], mut body: Value) -> Response {
    let started = Instant::now();
    let request_id = format!(
        "clive-{}",
        st.request_seq.fetch_add(1, Ordering::Relaxed) + 1
    );
    let full = body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or_default()
        .to_string();
    let (provider_id, model) = match full.split_once('/') {
        Some((p, m)) => (p.to_string(), m.to_string()),
        None => (
            providers.first().map(|p| p.id.clone()).unwrap_or_default(),
            full.clone(),
        ),
    };
    let Some(provider) = providers.iter().find(|p| p.id == provider_id) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": format!("unknown provider '{provider_id}'") })),
        )
            .into_response();
    };

    if let Some(obj) = body.as_object_mut() {
        obj.insert("model".to_string(), json!(model));
    }

    let mut req = st
        .client
        .post(format!("{}/chat/completions", provider.base_url))
        .json(&body);
    if let Some(k) = &provider.api_key {
        req = req.header(header::AUTHORIZATION, format!("Bearer {k}"));
    }
    // OpenCode Go/Zen require a session header on chat completions.
    if provider.builtin && provider.id.starts_with("opencode") {
        req = req.header("x-opencode-session", session_id());
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                [(
                    header::HeaderName::from_static("x-clive-request-id"),
                    request_id,
                )],
                Json(json!({ "error": format!("upstream unreachable: {e}") })),
            )
                .into_response();
        }
    };

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
    let ct = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    // Stream the raw bytes back (SSE or JSON) without buffering.
    let stream = resp.bytes_stream().map_err(axum::Error::new);
    let headers = [
        (header::CONTENT_TYPE, ct),
        (
            header::HeaderName::from_static("x-clive-provider"),
            provider.id.clone(),
        ),
        (
            header::HeaderName::from_static("x-clive-upstream-status"),
            status.as_str().to_string(),
        ),
        (
            header::HeaderName::from_static("x-clive-request-id"),
            request_id,
        ),
        (
            header::HeaderName::from_static("x-clive-upstream-ttfb-ms"),
            started.elapsed().as_millis().to_string(),
        ),
    ];
    (status, headers, Body::from_stream(stream)).into_response()
}

/// Tauri command: the OpenAI-compatible base URL the frontend should target.
#[tauri::command]
pub fn gateway_base(state: tauri::State<'_, GatewayHandle>) -> Result<String, String> {
    let port = state
        .0
        .lock()
        .map_err(|_| "gateway lock poisoned".to_string())?
        .ok_or_else(|| "gateway not ready".to_string())?;
    Ok(format!("http://127.0.0.1:{port}/v1"))
}

/// Mask a secret for display: keep a 4-char prefix + suffix, never the whole key.
fn mask(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        return "••••".to_string();
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}…{tail}")
}

/// Serializable provider information exposed to the Settings UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderInfo {
    pub id: String,
    pub base_url: String,
    pub device: String,
    pub has_key: bool,
    pub key_preview: Option<String>,
    pub cloud: bool,
    pub builtin: bool,
}

/// Tauri command: full provider registry for the Settings UI (keys masked).
#[tauri::command]
pub fn ai_get_config() -> Vec<AiProviderInfo> {
    ai_config_for(&providers_now())
}

fn ai_config_for(providers: &[Provider]) -> Vec<AiProviderInfo> {
    providers
        .iter()
        .map(|p| AiProviderInfo {
            id: p.id.clone(),
            base_url: p.base_url.clone(),
            device: if p.cloud { "web" } else { "local" }.to_string(),
            has_key: p.api_key.is_some(),
            key_preview: p.api_key.as_deref().map(mask),
            cloud: p.cloud,
            builtin: p.builtin,
        })
        .collect()
}

/// Tauri command: persist a provider's base URL / API key into `~/.clive/ai.env`.
/// Works for built-ins (override) and custom providers; empty key clears it.
#[tauri::command]
pub fn ai_set_provider(
    id: String,
    base_url: Option<String>,
    api_key: Option<String>,
) -> Result<(), String> {
    ai_set_provider_with(id, base_url, api_key, write_env)
}

fn ai_set_provider_with(
    id: String,
    base_url: Option<String>,
    api_key: Option<String>,
    persist: impl FnOnce(HashMap<String, Option<String>>) -> Result<(), String>,
) -> Result<(), String> {
    if !valid_provider_id(&id) {
        return Err(format!("invalid provider id '{id}'"));
    }
    let mut edits: HashMap<String, Option<String>> = HashMap::new();
    if let Some(b) = base_url {
        let b = b.trim().trim_end_matches('/').to_string();
        if !b.is_empty() && !valid_base_url(&b) {
            return Err(format!("invalid base URL '{b}'"));
        }
        edits.insert(base_var(&id), if b.is_empty() { None } else { Some(b) });
    }
    if let Some(k) = api_key {
        let k = k.trim().to_string();
        edits.insert(key_var(&id), if k.is_empty() { None } else { Some(k) });
    }
    if edits.is_empty() {
        return Ok(());
    }
    persist(edits)
}

/// Tauri command: register a new custom OpenAI-compatible provider.
#[tauri::command]
pub fn ai_add_provider(
    id: String,
    base_url: String,
    api_key: Option<String>,
) -> Result<(), String> {
    let shell = shell_env();
    let file = file_env();
    ai_add_provider_with(id, base_url, api_key, &shell, &file, write_env)
}

fn ai_add_provider_with(
    id: String,
    base_url: String,
    api_key: Option<String>,
    shell: &HashMap<String, String>,
    file: &HashMap<String, String>,
    persist: impl FnOnce(HashMap<String, Option<String>>) -> Result<(), String>,
) -> Result<(), String> {
    if !valid_provider_id(&id) {
        return Err(format!("invalid provider id '{id}' (letters, digits, '-', 2-32 chars, must not start with \"opencode\")"));
    }
    let base = base_url.trim().trim_end_matches('/').to_string();
    if !valid_base_url(&base) {
        return Err(format!("invalid base URL '{base}' (must be http(s)://…)"));
    }
    if BUILTINS.iter().any(|(b, _)| *b == id) || lookup(shell, file, &base_var(&id)).is_some() {
        return Err(format!("provider '{id}' already exists"));
    }
    let mut edits: HashMap<String, Option<String>> = HashMap::new();
    edits.insert(base_var(&id), Some(base));
    let key = api_key.unwrap_or_default().trim().to_string();
    if !key.is_empty() {
        edits.insert(key_var(&id), Some(key));
    }
    persist(edits)
}

/// Tauri command: remove a custom provider's entries from the dotfile.
/// Built-ins cannot be removed; providers defined in the shell env must be
/// unset there (the file edit alone would not hide them).
#[tauri::command]
pub fn ai_remove_provider(id: String) -> Result<(), String> {
    let shell = shell_env();
    ai_remove_provider_with(id, &shell, write_env)
}

fn ai_remove_provider_with(
    id: String,
    shell: &HashMap<String, String>,
    persist: impl FnOnce(HashMap<String, Option<String>>) -> Result<(), String>,
) -> Result<(), String> {
    if BUILTINS.iter().any(|(b, _)| *b == id) {
        return Err(format!(
            "'{id}' is a built-in provider and cannot be removed"
        ));
    }
    if !valid_provider_id(&id) {
        return Err(format!("invalid provider id '{id}'"));
    }
    if shell.contains_key(&base_var(&id)) {
        return Err(format!(
            "'{id}' is defined in the shell environment; unset {} there",
            base_var(&id)
        ));
    }
    let mut edits: HashMap<String, Option<String>> = HashMap::new();
    edits.insert(base_var(&id), None);
    edits.insert(key_var(&id), None);
    persist(edits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;
    use serde_json::json;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn parse_env_reads_kv_and_skips_comments() {
        let m = parse_env("# c\nCLIVE_PROVIDER_OPENCODE_API_KEY=sk-abc\nB='q'\n\n  # x\n");
        assert_eq!(
            m.get("CLIVE_PROVIDER_OPENCODE_API_KEY").map(String::as_str),
            Some("sk-abc")
        );
        assert_eq!(m.get("B").map(String::as_str), Some("q"));
        assert!(!m.contains_key("x"));
    }

    #[test]
    fn builtins_present_without_config() {
        let p = build_providers(&Default::default(), &Default::default());
        let ids: Vec<_> = p.iter().map(|x| x.id.as_str()).collect();
        assert!(
            ids.contains(&"opencode-go")
                && ids.contains(&"opencode-zen")
                && ids.contains(&"ollama")
        );
        assert!(p.iter().all(|x| !x.base_url.is_empty()));
        assert!(p.iter().all(|x| x.builtin));
    }

    #[test]
    fn custom_provider_discovered_from_file() {
        let file = map(&[
            (
                "CLIVE_PROVIDER_OPENROUTER_BASE_URL",
                "https://openrouter.ai/api/v1",
            ),
            ("CLIVE_PROVIDER_OPENROUTER_API_KEY", "sk-or-1"),
        ]);
        let p = build_providers(&file, &Default::default());
        let or = p
            .iter()
            .find(|x| x.id == "openrouter")
            .expect("custom missing");
        assert_eq!(or.base_url, "https://openrouter.ai/api/v1");
        assert_eq!(or.api_key.as_deref(), Some("sk-or-1"));
        assert!(!or.builtin);
    }

    #[test]
    fn shell_env_wins_over_dotfile() {
        let file = map(&[(
            "CLIVE_PROVIDER_DEEPSEEK_BASE_URL",
            "https://file.example/v1",
        )]);
        let shell = map(&[("CLIVE_PROVIDER_DEEPSEEK_BASE_URL", "http://127.0.0.1:9/v1")]);
        let p = build_providers(&file, &shell);
        let d = p.iter().find(|x| x.id == "deepseek").unwrap();
        assert_eq!(d.base_url, "http://127.0.0.1:9/v1");
    }

    #[test]
    fn builtin_base_url_override() {
        let file = map(&[(
            "CLIVE_PROVIDER_OLLAMA_BASE_URL",
            "http://server.lan:11434/v1",
        )]);
        let p = build_providers(&file, &Default::default());
        assert_eq!(
            p.iter().find(|x| x.id == "ollama").unwrap().base_url,
            "http://server.lan:11434/v1"
        );
    }

    #[test]
    fn cloud_derived_from_base_url() {
        assert!(!derive_cloud("http://localhost:11434/v1"));
        assert!(!derive_cloud("http://127.0.0.1:1234/v1"));
        assert!(!derive_cloud("https://[::1]:8000/v1"));
        assert!(derive_cloud("https://openrouter.ai/api/v1"));
    }

    #[test]
    fn provider_id_validation() {
        assert!(valid_provider_id("openrouter"));
        assert!(valid_provider_id("my-llm2"));
        assert!(!valid_provider_id("a")); // too short
        assert!(!valid_provider_id("My Provider!"));
        assert!(!valid_provider_id("-lead"));
        assert!(!valid_provider_id("opencode-x")); // reserved prefix
    }

    #[test]
    fn base_url_validation() {
        assert!(valid_base_url("https://openrouter.ai/api/v1"));
        assert!(valid_base_url("http://localhost:11434/v1"));
        assert!(!valid_base_url("ftp://x"));
        assert!(!valid_base_url("https://"));
        assert!(!valid_base_url("https://a b"));
    }

    #[test]
    fn env_names_roundtrip_for_dashed_ids() {
        assert_eq!(base_var("lm-studio"), "CLIVE_PROVIDER_LM_STUDIO_BASE_URL");
        assert_eq!(
            id_from_base_var("CLIVE_PROVIDER_LM_STUDIO_BASE_URL").as_deref(),
            Some("lm-studio")
        );
        assert_eq!(id_from_base_var("CLIVE_PROVIDER_LM_STUDIO_API_KEY"), None);
    }

    #[test]
    fn mask_hides_middle() {
        assert_eq!(mask("sk-1234567890abcd"), "sk-1…abcd");
        assert_eq!(mask("short"), "••••");
    }

    #[test]
    fn provider_settings_validate_normalize_and_remove_empty_values() {
        let mut edits = None;
        ai_set_provider_with(
            "my-provider".into(),
            Some(" https://example.test/v1/// ".into()),
            Some("  secret  ".into()),
            |value| {
                edits = Some(value);
                Ok(())
            },
        )
        .unwrap();
        let edits = edits.unwrap();
        assert_eq!(
            edits[&base_var("my-provider")].as_deref(),
            Some("https://example.test/v1")
        );
        assert_eq!(edits[&key_var("my-provider")].as_deref(), Some("secret"));

        let mut removed = None;
        ai_set_provider_with(
            "my-provider".into(),
            Some("  ".into()),
            Some("".into()),
            |value| {
                removed = Some(value);
                Ok(())
            },
        )
        .unwrap();
        assert_eq!(removed.unwrap()[&base_var("my-provider")], None);
        assert!(ai_set_provider_with("bad id".into(), None, None, |_| Ok(())).is_err());
        assert!(ai_set_provider_with(
            "valid-id".into(),
            Some("ftp://invalid".into()),
            None,
            |_| Ok(())
        )
        .is_err());
        assert!(
            ai_set_provider_with("valid-id".into(), None, None, |_| panic!(
                "empty update must not persist"
            ))
            .is_ok()
        );
    }

    #[test]
    fn provider_registration_checks_ids_urls_and_duplicates() {
        let empty = HashMap::new();
        let mut edits = None;
        ai_add_provider_with(
            "custom-llm".into(),
            " https://example.test/v1/// ".into(),
            Some(" key ".into()),
            &empty,
            &empty,
            |value| {
                edits = Some(value);
                Ok(())
            },
        )
        .unwrap();
        let edits = edits.unwrap();
        assert_eq!(
            edits[&base_var("custom-llm")].as_deref(),
            Some("https://example.test/v1")
        );
        assert_eq!(edits[&key_var("custom-llm")].as_deref(), Some("key"));

        assert!(ai_add_provider_with(
            "opencode-test".into(),
            "https://example.test".into(),
            None,
            &empty,
            &empty,
            |_| Ok(())
        )
        .is_err());
        assert!(ai_add_provider_with(
            "invalid".into(),
            "not-a-url".into(),
            None,
            &empty,
            &empty,
            |_| Ok(())
        )
        .is_err());
        assert!(ai_add_provider_with(
            "ollama".into(),
            "http://localhost".into(),
            None,
            &empty,
            &empty,
            |_| Ok(())
        )
        .is_err());
        let file = map(&[(
            "CLIVE_PROVIDER_CUSTOM_LLM_BASE_URL",
            "https://saved.test/v1",
        )]);
        assert!(ai_add_provider_with(
            "custom-llm".into(),
            "https://example.test".into(),
            None,
            &empty,
            &file,
            |_| Ok(())
        )
        .is_err());
        let shell = map(&[(
            "CLIVE_PROVIDER_CUSTOM_LLM_BASE_URL",
            "https://shell.test/v1",
        )]);
        assert!(ai_add_provider_with(
            "custom-llm".into(),
            "https://example.test".into(),
            None,
            &shell,
            &empty,
            |_| Ok(())
        )
        .is_err());
    }

    #[test]
    fn provider_removal_protects_builtins_and_shell_configuration() {
        let mut edits = None;
        ai_remove_provider_with("custom-llm".into(), &HashMap::new(), |value| {
            edits = Some(value);
            Ok(())
        })
        .unwrap();
        let edits = edits.unwrap();
        assert_eq!(edits[&base_var("custom-llm")], None);
        assert_eq!(edits[&key_var("custom-llm")], None);
        assert!(ai_remove_provider_with("ollama".into(), &HashMap::new(), |_| Ok(())).is_err());
        assert!(ai_remove_provider_with("x".into(), &HashMap::new(), |_| Ok(())).is_err());
        let shell = map(&[("CLIVE_PROVIDER_CUSTOM_LLM_BASE_URL", "https://shell.test")]);
        assert!(
            ai_remove_provider_with("custom-llm".into(), &shell, |_| Ok(()))
                .unwrap_err()
                .contains("unset")
        );
    }

    #[test]
    fn provider_config_masks_keys_and_labels_local_and_cloud() {
        let providers = vec![
            Provider {
                id: "local".into(),
                base_url: "http://localhost:1234/v1".into(),
                api_key: Some("short".into()),
                cloud: false,
                builtin: false,
            },
            Provider {
                id: "cloud".into(),
                base_url: "https://provider.example/v1".into(),
                api_key: Some("sk-1234567890abcd".into()),
                cloud: true,
                builtin: false,
            },
            Provider {
                id: "open".into(),
                base_url: "https://provider.example/v1".into(),
                api_key: None,
                cloud: true,
                builtin: true,
            },
        ];
        let config = ai_config_for(&providers);
        assert_eq!(config[0].device, "local");
        assert_eq!(config[0].key_preview.as_deref(), Some("••••"));
        assert_eq!(config[1].device, "web");
        assert_eq!(config[1].key_preview.as_deref(), Some("sk-1…abcd"));
        assert!(config[2].key_preview.is_none());
        assert!(!config[2].has_key);
    }

    #[test]
    fn provider_dotfile_updates_merge_and_remove_keys_atomically() {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir()
            .join(format!(
                "clive-ai-env-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ))
            .join(".clive/ai.env");
        let mut edits = HashMap::from([
            ("KEEP".to_string(), Some("preserved".to_string())),
            ("REMOVE".to_string(), Some("old".to_string())),
        ]);
        write_env_at(&path, &mut edits).unwrap();
        let mut edits = HashMap::from([
            ("REMOVE".to_string(), None),
            ("NEW".to_string(), Some("value".to_string())),
        ]);
        write_env_at(&path, &mut edits).unwrap();
        let parsed = parse_env(&std::fs::read_to_string(&path).unwrap());
        assert_eq!(parsed.get("KEEP").map(String::as_str), Some("preserved"));
        assert_eq!(parsed.get("NEW").map(String::as_str), Some("value"));
        assert!(!parsed.contains_key("REMOVE"));
        let _ = std::fs::remove_dir_all(path.parent().unwrap().parent().unwrap());
    }

    fn test_state() -> AppState {
        AppState {
            client: reqwest::Client::new(),
            request_seq: Arc::new(AtomicU64::new(0)),
        }
    }

    fn provider(id: &str, base_url: String, builtin: bool, api_key: Option<&str>) -> Provider {
        Provider {
            id: id.into(),
            base_url,
            api_key: api_key.map(str::to_owned),
            cloud: false,
            builtin,
        }
    }

    async fn start_mock(app: Router) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        format!("http://{address}")
    }

    #[tokio::test]
    async fn chat_routes_model_injects_credentials_and_streams_response() {
        let captured = Arc::new(Mutex::new(None::<(Value, Option<String>, Option<String>)>));
        let captured_request = captured.clone();
        let app = Router::new().route(
            "/chat/completions",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let captured = captured_request.clone();
                async move {
                    *captured.lock().unwrap() = Some((
                        body,
                        headers
                            .get(header::AUTHORIZATION)
                            .and_then(|v| v.to_str().ok())
                            .map(str::to_owned),
                        headers
                            .get("x-opencode-session")
                            .and_then(|v| v.to_str().ok())
                            .map(str::to_owned),
                    ));
                    (
                        StatusCode::CREATED,
                        [(header::CONTENT_TYPE, "text/event-stream")],
                        "data: done\n\n",
                    )
                }
            }),
        );
        let base_url = start_mock(app).await;
        let provider = provider("opencode-zen", base_url, true, Some("secret-token"));

        let response = chat_completions_for(
            &test_state(),
            &[provider],
            json!({ "model": "opencode-zen/model-a", "messages": [] }),
        )
        .await;

        assert_eq!(response.status(), StatusCode::CREATED);
        assert_eq!(response.headers()["x-clive-provider"], "opencode-zen");
        assert_eq!(response.headers()["x-clive-upstream-status"], "201");
        assert_eq!(response.headers()["x-clive-request-id"], "clive-1");
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"data: done\n\n");
        let (request, authorization, session) = captured.lock().unwrap().clone().unwrap();
        assert_eq!(request["model"], "model-a");
        assert_eq!(authorization.as_deref(), Some("Bearer secret-token"));
        assert!(session.as_deref().unwrap().starts_with("clive-"));
    }

    #[tokio::test]
    async fn chat_rejects_unknown_providers_and_reports_unreachable_upstream() {
        let state = test_state();
        let unknown = chat_completions_for(&state, &[], json!({ "model": "missing/model" })).await;
        assert_eq!(unknown.status(), StatusCode::BAD_REQUEST);

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        let unavailable = provider("local-test", format!("http://{address}"), false, None);
        let response = chat_completions_for(
            &state,
            &[unavailable],
            json!({ "model": "local-test/model" }),
        )
        .await;
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(response.headers()["x-clive-request-id"], "clive-2");
    }

    #[tokio::test]
    async fn models_aggregates_valid_ids_and_skips_malformed_or_unreachable_providers() {
        let app = Router::new().route(
            "/models",
            get(|| async { Json(json!({ "data": [{"id": "alpha"}, {"name": "missing-id"}] })) }),
        );
        let base_url = start_mock(app).await;
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        let providers = [
            provider("local", base_url, false, None),
            provider("offline", format!("http://{address}"), false, None),
        ];

        let response = models_for(&test_state(), &providers).await;
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let result: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(result["object"], "list");
        assert_eq!(result["data"].as_array().unwrap().len(), 1);
        assert_eq!(result["data"][0]["id"], "local/alpha");
        assert_eq!(result["data"][0]["owned_by"], "local");
    }

    #[tokio::test]
    async fn health_reports_provider_and_selected_model_availability() {
        let app = Router::new().route(
            "/models",
            get(|| async { Json(json!({ "data": [{"id": "model-a"}] })) }),
        );
        let base_url = start_mock(app).await;
        let providers = [provider("local", base_url, false, None)];

        let response = healthz_for(
            &test_state(),
            &providers,
            HealthQuery {
                provider: Some("local".into()),
                model: Some("model-a".into()),
            },
        )
        .await
        .0;
        assert_eq!(response["ok"], true);
        assert_eq!(response["providers"]["local"], true);
        assert_eq!(response["selected"]["providerOk"], true);
        assert_eq!(response["selected"]["modelAvailable"], true);

        let missing = healthz_for(
            &test_state(),
            &providers,
            HealthQuery {
                provider: Some("local".into()),
                model: Some("absent".into()),
            },
        )
        .await
        .0;
        assert_eq!(missing["selected"]["modelAvailable"], false);
    }

    #[tokio::test]
    async fn health_without_a_selection_returns_null_selection() {
        let response = healthz_for(
            &test_state(),
            &[],
            HealthQuery {
                provider: None,
                model: None,
            },
        )
        .await
        .0;
        assert_eq!(response["ok"], false);
        assert_eq!(response["selected"], Value::Null);
    }
}
