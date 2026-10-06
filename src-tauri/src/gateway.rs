use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{atomic::{AtomicU64, Ordering}, Arc, Mutex};
use std::time::Instant;

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{header, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::TryStreamExt;
use serde_json::{json, Value};
use serde::Deserialize;
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
    let rest = var.strip_prefix(PROVIDER_PREFIX)?.strip_suffix("_BASE_URL")?;
    let id = rest.to_lowercase().replace('_', "-");
    valid_provider_id(&id).then_some(id)
}

/// Ids are DNS-slug-like (`[a-z0-9-]`, 2..=32, must start alphanumeric). The
/// `opencode` prefix is reserved for the built-ins (session header quirk).
fn valid_provider_id(id: &str) -> bool {
    let bytes: &[u8] = id.as_bytes();
    if bytes.len() < 2 || bytes.len() > 32 {
        return false
    }
    if !bytes[0].is_ascii_alphanumeric() || !bytes.iter().all(|b| b.is_ascii_alphanumeric() || *b == b'-') {
        return false
    }
    !id.starts_with("opencode")
}

/// A usable `http(s)://host[/path]` base URL.
fn valid_base_url(url: &str) -> bool {
    let rest = url.strip_prefix("http://").or_else(|| url.strip_prefix("https://"));
    match rest {
        Some(r) => !r.is_empty() && !r.contains(char::is_whitespace) && r.contains('.') || r.starts_with("localhost") || r.starts_with("[::1]"),
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
fn lookup(shell: &HashMap<String, String>, file: &HashMap<String, String>, name: &str) -> Option<String> {
    shell.get(name).cloned().filter(|s| !s.is_empty()).or_else(|| file.get(name).cloned().filter(|s| !s.is_empty()))
}

/// Snapshot of the process environment as a map.
fn shell_env() -> HashMap<String, String> {
    std::env::vars().collect()
}

/// Build the registry: built-ins (with optional overrides) plus every custom
/// provider declared via `CLIVE_PROVIDER_<ID>_BASE_URL` in the shell env or the
/// dotfile. Pure and injectable so tests don't touch the real environment.
fn build_providers(file: &HashMap<String, String>, shell: &HashMap<String, String>) -> Vec<Provider> {
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
            continue
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
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Merge: start from existing file, apply edits (Some→set, None→remove).
    let mut current = file_env();
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
    let mut lines: Vec<String> = current
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect();
    lines.sort();
    let body = format!("# clive AI provider config (managed by Settings → AI)\n{}\n", lines.join("\n"));
    let tmp = path.with_extension("env.tmp");
    std::fs::write(&tmp, body.as_bytes()).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
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
    let mut req = client.get(format!("{}/models", p.base_url)).timeout(std::time::Duration::from_secs(10));
    if let Some(k) = &p.api_key {
        req = req.header(header::AUTHORIZATION, format!("Bearer {k}"));
    }
    matches!(req.send().await, Ok(r) if r.status().is_success())
}

async fn model_available(client: &reqwest::Client, p: &Provider, model: &str) -> bool {
    let mut req = client.get(format!("{}/models", p.base_url)).timeout(std::time::Duration::from_secs(10));
    if let Some(k) = &p.api_key { req = req.header(header::AUTHORIZATION, format!("Bearer {k}")); }
    match req.send().await {
        Ok(r) if r.status().is_success() => r.json::<Value>().await.ok()
            .and_then(|v| v.get("data").and_then(Value::as_array).map(|a| a.iter().any(|m| m.get("id").and_then(Value::as_str) == Some(model))))
            .unwrap_or(false),
        _ => false,
    }
}

async fn healthz(Query(query): Query<HealthQuery>, State(st): State<AppState>) -> Json<Value> {
    let providers_list = providers_now();
    let mut providers = serde_json::Map::new();
    let mut any = false;
    for p in &providers_list {
        let ok = probe(&st.client, p).await;
        any |= ok;
        providers.insert(p.id.clone(), json!(ok));
    }
    let selected = match (query.provider.as_deref(), query.model.as_deref()) {
        (Some(provider_id), Some(model_id)) => {
            let provider_ok = providers.get(provider_id).and_then(Value::as_bool).unwrap_or(false);
            let model_ok = if provider_ok {
                match providers_list.iter().find(|p| p.id == provider_id) {
                    Some(p) => model_available(&st.client, p, model_id).await,
                    None => false,
                }
            } else { false };
            json!({ "provider": provider_id, "model": model_id, "providerOk": provider_ok, "modelAvailable": model_ok })
        }
        _ => Value::Null,
    };
    Json(json!({ "ok": any, "providers": providers, "selected": selected }))
}

/// Aggregate models from all providers, prefixing ids with `<provider>/`.
async fn models(State(st): State<AppState>) -> Response {
    let mut data: Vec<Value> = Vec::new();
    for p in providers_now() {
        let mut req = st.client.get(format!("{}/models", p.base_url)).timeout(std::time::Duration::from_secs(10));
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
async fn chat_completions(
    State(st): State<AppState>,
    Json(mut body): Json<Value>,
) -> Response {
    let started = Instant::now();
    let request_id = format!("clive-{}", st.request_seq.fetch_add(1, Ordering::Relaxed) + 1);
    let providers = providers_now();
    let full = body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or_default()
        .to_string();
    let (provider_id, model) = match full.split_once('/') {
        Some((p, m)) => (p.to_string(), m.to_string()),
        None => (providers.first().map(|p| p.id.clone()).unwrap_or_default(), full.clone()),
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
                [(header::HeaderName::from_static("x-clive-request-id"), request_id)],
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
        (header::HeaderName::from_static("x-clive-provider"), provider.id.clone()),
        (header::HeaderName::from_static("x-clive-upstream-status"), status.as_str().to_string()),
        (header::HeaderName::from_static("x-clive-request-id"), request_id),
        (header::HeaderName::from_static("x-clive-upstream-ttfb-ms"), started.elapsed().as_millis().to_string()),
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

/// Tauri command: full provider registry for the Settings UI (keys masked).
#[tauri::command]
pub fn ai_get_config() -> Vec<Value> {
    providers_now()
        .iter()
        .map(|p| {
            json!({
                "id": p.id,
                "baseUrl": p.base_url,
                "hasKey": p.api_key.is_some(),
                "keyPreview": p.api_key.as_deref().map(mask),
                "cloud": p.cloud,
                "builtin": p.builtin,
            })
        })
        .collect()
}

/// Tauri command: persist a provider's base URL / API key into `~/.clive/ai.env`.
/// Works for built-ins (override) and custom providers; empty key clears it.
#[tauri::command]
pub fn ai_set_provider(id: String, base_url: Option<String>, api_key: Option<String>) -> Result<(), String> {
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
    write_env(edits)
}

/// Tauri command: register a new custom OpenAI-compatible provider.
#[tauri::command]
pub fn ai_add_provider(id: String, base_url: String, api_key: Option<String>) -> Result<(), String> {
    if !valid_provider_id(&id) {
        return Err(format!("invalid provider id '{id}' (letters, digits, '-', 2-32 chars, must not start with \"opencode\")"));
    }
    let base = base_url.trim().trim_end_matches('/').to_string();
    if !valid_base_url(&base) {
        return Err(format!("invalid base URL '{base}' (must be http(s)://…)"));
    }
    let shell = shell_env();
    let file = file_env();
    if BUILTINS.iter().any(|(b, _)| *b == id) || lookup(&shell, &file, &base_var(&id)).is_some() {
        return Err(format!("provider '{id}' already exists"));
    }
    let mut edits: HashMap<String, Option<String>> = HashMap::new();
    edits.insert(base_var(&id), Some(base));
    let key = api_key.unwrap_or_default().trim().to_string();
    if !key.is_empty() {
        edits.insert(key_var(&id), Some(key));
    }
    write_env(edits)
}

/// Tauri command: remove a custom provider's entries from the dotfile.
/// Built-ins cannot be removed; providers defined in the shell env must be
/// unset there (the file edit alone would not hide them).
#[tauri::command]
pub fn ai_remove_provider(id: String) -> Result<(), String> {
    if BUILTINS.iter().any(|(b, _)| *b == id) {
        return Err(format!("'{id}' is a built-in provider and cannot be removed"));
    }
    if !valid_provider_id(&id) {
        return Err(format!("invalid provider id '{id}'"));
    }
    if std::env::var(base_var(&id)).is_ok() {
        return Err(format!("'{id}' is defined in the shell environment; unset {} there", base_var(&id)));
    }
    let mut edits: HashMap<String, Option<String>> = HashMap::new();
    edits.insert(base_var(&id), None);
    edits.insert(key_var(&id), None);
    write_env(edits)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn parse_env_reads_kv_and_skips_comments() {
        let m = parse_env("# c\nCLIVE_PROVIDER_OPENCODE_API_KEY=sk-abc\nB='q'\n\n  # x\n");
        assert_eq!(m.get("CLIVE_PROVIDER_OPENCODE_API_KEY").map(String::as_str), Some("sk-abc"));
        assert_eq!(m.get("B").map(String::as_str), Some("q"));
        assert!(!m.contains_key("x"));
    }

    #[test]
    fn builtins_present_without_config() {
        let p = build_providers(&Default::default(), &Default::default());
        let ids: Vec<_> = p.iter().map(|x| x.id.as_str()).collect();
        assert!(ids.contains(&"opencode-go") && ids.contains(&"opencode-zen") && ids.contains(&"ollama"));
        assert!(p.iter().all(|x| !x.base_url.is_empty()));
        assert!(p.iter().all(|x| x.builtin));
    }

    #[test]
    fn custom_provider_discovered_from_file() {
        let file = map(&[
            ("CLIVE_PROVIDER_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            ("CLIVE_PROVIDER_OPENROUTER_API_KEY", "sk-or-1"),
        ]);
        let p = build_providers(&file, &Default::default());
        let or = p.iter().find(|x| x.id == "openrouter").expect("custom missing");
        assert_eq!(or.base_url, "https://openrouter.ai/api/v1");
        assert_eq!(or.api_key.as_deref(), Some("sk-or-1"));
        assert!(!or.builtin);
    }

    #[test]
    fn shell_env_wins_over_dotfile() {
        let file = map(&[("CLIVE_PROVIDER_DEEPSEEK_BASE_URL", "https://file.example/v1")]);
        let shell = map(&[("CLIVE_PROVIDER_DEEPSEEK_BASE_URL", "http://127.0.0.1:9/v1")]);
        let p = build_providers(&file, &shell);
        let d = p.iter().find(|x| x.id == "deepseek").unwrap();
        assert_eq!(d.base_url, "http://127.0.0.1:9/v1");
    }

    #[test]
    fn builtin_base_url_override() {
        let file = map(&[("CLIVE_PROVIDER_OLLAMA_BASE_URL", "http://server.lan:11434/v1")]);
        let p = build_providers(&file, &Default::default());
        assert_eq!(p.iter().find(|x| x.id == "ollama").unwrap().base_url, "http://server.lan:11434/v1");
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
        assert_eq!(id_from_base_var("CLIVE_PROVIDER_LM_STUDIO_BASE_URL").as_deref(), Some("lm-studio"));
        assert_eq!(id_from_base_var("CLIVE_PROVIDER_LM_STUDIO_API_KEY"), None);
    }

    #[test]
    fn mask_hides_middle() {
        assert_eq!(mask("sk-1234567890abcd"), "sk-1…abcd");
        assert_eq!(mask("short"), "••••");
    }
}
