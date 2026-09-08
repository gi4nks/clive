use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::TryStreamExt;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

/// A configured upstream provider. The frontend selects it by using a model id
/// of the form `<id>/<model>`; the gateway routes on that prefix and injects the
/// key, so credentials never reach the webview.
#[derive(Clone)]
struct Provider {
    id: String,
    base_url: String, // already ends with /v1
    api_key: Option<String>,
}

/// Shared handle holding the gateway's bound port once it is listening.
#[derive(Clone)]
pub struct GatewayHandle(pub Arc<Mutex<Option<u16>>>);

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
}

/// id → (base-url env var, api-key env var, default base url).
const PROVIDERS: &[(&str, &str, &str, &str)] = &[
    ("opencode-go", "GLB_OPENCODE_GO_BASE_URL", "GLB_OPENCODE_API_KEY", "https://opencode.ai/zen/go/v1"),
    ("opencode-zen", "GLB_OPENCODE_ZEN_BASE_URL", "GLB_OPENCODE_API_KEY", "https://opencode.ai/zen/v1"),
    ("ollama", "GLB_OLLAMA_BASE_URL", "GLB_OLLAMA_API_KEY", "http://localhost:11434/v1"),
];

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
fn effective(map: &HashMap<String, String>, name: &str) -> Option<String> {
    if let Ok(v) = std::env::var(name) {
        if !v.is_empty() {
            return Some(v);
        }
    }
    map.get(name).cloned().filter(|s| !s.is_empty())
}

/// Build the current provider registry from env + dotfile + defaults. Computed
/// per call so a saved key takes effect without restarting the gateway.
fn providers_now() -> Vec<Provider> {
    let file = file_env();
    let mut out = Vec::new();
    for (id, base_var, key_var, base_default) in PROVIDERS {
        let base = effective(&file, base_var).unwrap_or_else(|| base_default.to_string());
        let base_url = base.trim_end_matches('/').to_string();
        out.push(Provider {
            id: id.to_string(),
            base_url,
            api_key: effective(&file, key_var),
        });
    }
    out
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
        client: reqwest::Client::new(),
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
        .with_state(state);

    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    handle.set_port(port);
    Ok(port)
}

async fn probe(client: &reqwest::Client, p: &Provider) -> bool {
    let mut req = client.get(format!("{}/models", p.base_url));
    if let Some(k) = &p.api_key {
        req = req.header(header::AUTHORIZATION, format!("Bearer {k}"));
    }
    matches!(req.send().await, Ok(r) if r.status().is_success())
}

async fn healthz(State(st): State<AppState>) -> Json<Value> {
    let providers_list = providers_now();
    let mut providers = serde_json::Map::new();
    let mut any = false;
    for p in &providers_list {
        let ok = probe(&st.client, p).await;
        any |= ok;
        providers.insert(p.id.clone(), json!(ok));
    }
    Json(json!({ "ok": any, "providers": providers }))
}

/// Aggregate models from all providers, prefixing ids with `<provider>/`.
async fn models(State(st): State<AppState>) -> Response {
    let mut data: Vec<Value> = Vec::new();
    for p in providers_now() {
        let mut req = st.client.get(format!("{}/models", p.base_url));
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
    if provider.id.starts_with("opencode") {
        req = req.header("x-opencode-session", session_id());
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
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
    (status, [(header::CONTENT_TYPE, ct)], Body::from_stream(stream)).into_response()
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

/// Tauri command: current provider config for the Settings UI (keys masked).
#[tauri::command]
pub fn ai_get_config() -> Vec<Value> {
    let file = file_env();
    PROVIDERS
        .iter()
        .map(|(id, base_var, key_var, base_default)| {
            let base = effective(&file, base_var).unwrap_or_else(|| base_default.to_string());
            let has_key = effective(&file, key_var).is_some();
            let masked = effective(&file, key_var).map(|k| mask(&k));
            json!({ "id": id, "baseUrl": base.trim_end_matches('/'), "hasKey": has_key, "keyPreview": masked })
        })
        .collect()
}

/// Tauri command: persist a provider's base URL / API key into `~/.clive/ai.env`.
/// Empty/None leaves a field unchanged; passing `Some("")` clears it.
#[tauri::command]
pub fn ai_set_provider(id: String, base_url: Option<String>, api_key: Option<String>) -> Result<(), String> {
    let (_, base_var, key_var, _) = PROVIDERS
        .iter()
        .find(|(pid, ..)| *pid == id)
        .ok_or_else(|| format!("unknown provider '{id}'"))?;
    let mut edits: HashMap<String, Option<String>> = HashMap::new();
    if let Some(b) = base_url {
        let b = b.trim().trim_end_matches('/').to_string();
        edits.insert(base_var.to_string(), if b.is_empty() { None } else { Some(b) });
    }
    if let Some(k) = api_key {
        let k = k.trim().to_string();
        edits.insert(key_var.to_string(), if k.is_empty() { None } else { Some(k) });
    }
    if edits.is_empty() {
        return Ok(());
    }
    write_env(edits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_env_reads_kv_and_skips_comments() {
        let m = parse_env("# c\nGLB_OPENCODE_API_KEY=sk-abc\nB='q'\n\n  # x\n");
        assert_eq!(m.get("GLB_OPENCODE_API_KEY").map(String::as_str), Some("sk-abc"));
        assert_eq!(m.get("B").map(String::as_str), Some("q"));
        assert!(!m.contains_key("x"));
    }

    #[test]
    fn providers_includes_all_ids_with_defaults() {
        let p = providers_now();
        let ids: Vec<_> = p.iter().map(|x| x.id.as_str()).collect();
        assert!(ids.contains(&"opencode-go") && ids.contains(&"opencode-zen") && ids.contains(&"ollama"));
        // base urls are non-empty (defaults or env)
        assert!(p.iter().all(|x| !x.base_url.is_empty()));
    }

    #[test]
    fn mask_hides_middle() {
        assert_eq!(mask("sk-1234567890abcd"), "sk-1…abcd");
        assert_eq!(mask("short"), "••••");
    }
}
