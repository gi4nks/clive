use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Emitter;

use crate::commands::filesystem::path_safety::{is_protected, normalize, protected_err};
use crate::commands::filesystem::transfers::move_path;
use crate::commands::trash::{restore_target, trash_slot_dir, unique_in_dir};

/// One operation as serialized by the TS client (Task 1 `PlanOp`).
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PlanOpInput {
    #[serde(rename_all = "camelCase")]
    CreateFolder {
        id: String,
        path: String,
        included: bool,
    },
    #[serde(rename_all = "camelCase")]
    CreateFile {
        id: String,
        path: String,
        content: String,
        included: bool,
    },
    #[serde(rename_all = "camelCase")]
    Rename {
        id: String,
        path: String,
        new_name: String,
        included: bool,
    },
    #[serde(rename_all = "camelCase")]
    Move {
        id: String,
        path: String,
        dest_dir: String,
        #[serde(default)]
        dest_name: Option<String>,
        included: bool,
    },
    #[serde(rename_all = "camelCase")]
    Trash {
        id: String,
        path: String,
        included: bool,
    },
}

/// Inverse of one applied operation, as persisted in the journal
/// (externally tagged camelCase: `{"removeDir":{...}}`, `{"moveBack":{...}}`, …).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Inverse {
    #[serde(rename_all = "camelCase")]
    RemoveDir { path: String, was_new: bool },
    #[serde(rename_all = "camelCase")]
    RenameBack { path: String, to: String },
    #[serde(rename_all = "camelCase")]
    MoveBack { from: String, to: String },
    #[serde(rename_all = "camelCase")]
    RestoreFromTrash { slot: String, to: String },
    #[serde(rename_all = "camelCase")]
    RemoveFile { path: String, sha256: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JournalFile {
    #[serde(default)]
    mounts: std::collections::BTreeMap<String, Option<String>>,
    version: u32,
    batch_id: String,
    created_at: u64,
    root_path: String,
    entries: Vec<Inverse>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReport {
    pub applied: usize,
    pub skipped: usize,
    pub failed: Vec<FailedOp>,
    pub batch_id: String,
    pub total: usize,
    pub duration_ms: u128,
    pub phase_counts: std::collections::BTreeMap<String, usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedOp {
    pub id: String,
    pub error: String,
    pub code: String,
}

fn error_code(error: &str) -> &'static str {
    if error.contains("protected") {
        "protected"
    } else if error.contains("target exists") {
        "target_exists"
    } else if error.contains("destination folder missing") {
        "destination_missing"
    } else if error.contains("invalid destination") {
        "invalid_destination"
    } else if error.contains("invalid name") {
        "invalid_name"
    } else if error.contains("trash directory") {
        "trash_location"
    } else if error.contains("not empty") {
        "not_empty"
    } else if error.contains("not in trash") {
        "trash_missing"
    } else if error.contains("file changed") {
        "file_changed"
    } else {
        "filesystem"
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Journal directory: `$CLIVE_PLAN_JOURNAL` else `$HOME/.clive/plan-journal`.
fn journal_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CLIVE_PLAN_JOURNAL") {
        return PathBuf::from(dir);
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"));
    home.join(".clive").join("plan-journal")
}

fn journal_path(batch_id: &str) -> PathBuf {
    journal_dir().join(format!("{batch_id}.json"))
}

/// batchId maps directly onto a journal filename: reject anything that could
/// escape the journal dir (traversal, absolute paths). Authoritative gate.
fn validate_batch_id(batch_id: &str) -> Result<(), String> {
    if batch_id.is_empty()
        || batch_id.contains('/')
        || batch_id.contains('\\')
        || batch_id.contains("..")
    {
        return Err("invalid batchId".to_string());
    }
    Ok(())
}

/// Rewrite the whole journal atomically (tmp + rename) so a crash mid-batch
/// keeps every previously applied inverse durable.
fn write_journal(journal: &JournalFile) -> Result<(), String> {
    let jpath = journal_path(&journal.batch_id);
    if let Some(parent) = jpath.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_string_pretty(journal).map_err(|e| e.to_string())?;
    let tmp = jpath.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &jpath).map_err(|e| e.to_string())
}

fn id_of(op: &PlanOpInput) -> &str {
    match op {
        PlanOpInput::CreateFolder { id, .. }
        | PlanOpInput::CreateFile { id, .. }
        | PlanOpInput::Rename { id, .. }
        | PlanOpInput::Move { id, .. }
        | PlanOpInput::Trash { id, .. } => id,
    }
}

fn included_of(op: &PlanOpInput) -> bool {
    match op {
        PlanOpInput::CreateFolder { included, .. }
        | PlanOpInput::CreateFile { included, .. }
        | PlanOpInput::Rename { included, .. }
        | PlanOpInput::Move { included, .. }
        | PlanOpInput::Trash { included, .. } => *included,
    }
}

fn path_of(op: &PlanOpInput) -> &str {
    match op {
        PlanOpInput::CreateFolder { path, .. }
        | PlanOpInput::CreateFile { path, .. }
        | PlanOpInput::Rename { path, .. }
        | PlanOpInput::Move { path, .. }
        | PlanOpInput::Trash { path, .. } => path,
    }
}

fn phase_rank(op: &PlanOpInput) -> u8 {
    match op {
        PlanOpInput::CreateFolder { .. } => 0,
        PlanOpInput::CreateFile { .. } => 1,
        PlanOpInput::Rename { .. } => 2,
        PlanOpInput::Move { .. } => 3,
        PlanOpInput::Trash { .. } => 4,
    }
}

fn op_depth(op: &PlanOpInput) -> usize {
    normalize(path_of(op)).components().count()
}

/// Return the guard error for the first protected path (when the guard is on).
fn guard_err(allow_system: bool, paths: &[&Path]) -> Option<String> {
    if allow_system {
        return None;
    }
    paths
        .iter()
        .find(|p| is_protected(p))
        .map(|p| protected_err(p))
}

enum Outcome {
    Applied(Box<Inverse>),
    Skipped,
    Failed(String),
}

/// True when `anc` is `p` itself or one of its ancestors (lexical, component
/// wise — `/Xy` is NOT inside `/X`).
fn is_ancestor_or_same(anc: &Path, p: &Path) -> bool {
    p.strip_prefix(anc).is_ok()
}

fn run_op(op: &PlanOpInput, allow_system: bool) -> Outcome {
    if let Err(e) =
        crate::commands::filesystem::path_safety::require_mounted_path(&normalize(path_of(op)))
    {
        return Outcome::Failed(e.to_string());
    }
    match op {
        PlanOpInput::CreateFolder { path, .. } => {
            let p = normalize(path);
            if let Some(e) = guard_err(allow_system, &[&p]) {
                return Outcome::Failed(e);
            }
            if p.is_dir() {
                // idempotent no-op: undo must NOT delete a pre-existing dir
                return Outcome::Applied(Box::new(Inverse::RemoveDir {
                    path: p.to_string_lossy().into_owned(),
                    was_new: false,
                }));
            }
            if p.exists() {
                return Outcome::Failed("target exists".into());
            }
            match fs::create_dir_all(&p) {
                Ok(()) => Outcome::Applied(Box::new(Inverse::RemoveDir {
                    path: p.to_string_lossy().into_owned(),
                    was_new: true,
                })),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
        PlanOpInput::CreateFile { path, content, .. } => {
            let p = normalize(path);
            if let Some(e) = guard_err(allow_system, &[&p]) {
                return Outcome::Failed(e);
            }
            if p.file_name().is_none() || p.parent().is_none() {
                return Outcome::Failed("invalid name".into());
            }
            if !p.parent().is_some_and(Path::is_dir) {
                return Outcome::Failed("destination folder missing".into());
            }
            let mut file = match fs::OpenOptions::new().write(true).create_new(true).open(&p) {
                Ok(file) => file,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Outcome::Failed("target exists".into())
                }
                Err(e) => return Outcome::Failed(e.to_string()),
            };
            if let Err(e) = std::io::Write::write_all(&mut file, content.as_bytes())
                .and_then(|()| file.sync_all())
            {
                drop(file);
                let _ = fs::remove_file(&p);
                return Outcome::Failed(e.to_string());
            }
            let sha256 = format!("{:x}", Sha256::digest(content.as_bytes()));
            Outcome::Applied(Box::new(Inverse::RemoveFile {
                path: p.to_string_lossy().into_owned(),
                sha256,
            }))
        }
        PlanOpInput::Rename { path, new_name, .. } => {
            if new_name.contains('/')
                || new_name.contains('\\')
                || new_name == "."
                || new_name == ".."
            {
                return Outcome::Failed("invalid name".into());
            }
            let src = normalize(path);
            let dst = src
                .parent()
                .map(|d| d.join(new_name))
                .unwrap_or_else(|| normalize(new_name));
            if let Some(e) = guard_err(allow_system, &[&src, &dst]) {
                return Outcome::Failed(e);
            }
            if !src.exists() {
                return Outcome::Skipped;
            }
            if dst.exists() {
                return Outcome::Failed("target exists".into());
            }
            match move_path(&src, &dst) {
                Ok(()) => Outcome::Applied(Box::new(Inverse::RenameBack {
                    path: dst.to_string_lossy().into_owned(),
                    to: src
                        .file_name()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                })),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
        PlanOpInput::Move {
            path,
            dest_dir,
            dest_name,
            ..
        } => {
            let src = normalize(path);
            let dest_dir = normalize(dest_dir);
            let name = dest_name
                .as_deref()
                .or_else(|| src.file_name().and_then(|n| n.to_str()));
            let Some(name) = name.filter(|n| {
                !n.is_empty() && *n != "." && *n != ".." && !n.contains('/') && !n.contains('\\')
            }) else {
                return Outcome::Failed("invalid name".into());
            };
            let dst = dest_dir.join(name);
            if let Some(e) = guard_err(allow_system, &[&src, &dest_dir, &dst]) {
                return Outcome::Failed(e);
            }
            // reject moving a directory into its own subtree (fs::rename would
            // EINVAL and move_path's copy-fallback would churn the whole tree)
            if is_ancestor_or_same(&src, &dest_dir) {
                return Outcome::Failed("invalid destination".into());
            }
            if src == trash_slot_dir() {
                return Outcome::Failed("cannot move the trash directory".into());
            }
            if !src.exists() {
                return Outcome::Skipped;
            }
            if !dest_dir.is_dir() {
                return Outcome::Failed("destination folder missing".into());
            }
            if dst.exists() {
                return Outcome::Failed("target exists".into());
            }
            match move_path(&src, &dst) {
                Ok(()) => Outcome::Applied(Box::new(Inverse::MoveBack {
                    from: dst.to_string_lossy().into_owned(),
                    to: src.to_string_lossy().into_owned(),
                })),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
        PlanOpInput::Trash { path, .. } => {
            let src = normalize(path);
            if let Some(e) = guard_err(allow_system, &[&src]) {
                return Outcome::Failed(e);
            }
            let root = trash_slot_dir();
            // trashing the trash dir (or an ancestor of it) is nonsense
            if is_ancestor_or_same(&src, &root) {
                return Outcome::Failed("cannot trash the trash directory".into());
            }
            let meta = match fs::metadata(&src) {
                Ok(m) => m,
                Err(_) => return Outcome::Skipped,
            };
            // R4: our own move into the shared slot dir — never delete_to_trash,
            // which would double-bookkeep the app trash journal.
            if let Err(e) = fs::create_dir_all(&root) {
                return Outcome::Failed(e.to_string());
            }
            let desired = src
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "item".to_string());
            let slot_name = unique_in_dir(&root, &desired, meta.is_dir());
            let slot = root.join(&slot_name);
            match move_path(&src, &slot) {
                Ok(()) => Outcome::Applied(Box::new(Inverse::RestoreFromTrash {
                    slot: slot.to_string_lossy().into_owned(),
                    to: src.to_string_lossy().into_owned(),
                })),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
    }
}

/// Apply a batch in the fixed phase order (create asc-depth, rename, move, trash),
/// journaling each successful inverse incrementally. `on_progress` is called after
/// every processed op with (done, total, currentId).
fn apply_ops(
    batch_id: &str,
    ops: &[PlanOpInput],
    allow_system: bool,
    on_progress: &mut dyn FnMut(usize, usize, &str),
) -> Result<ApplyReport, String> {
    let started = Instant::now();
    validate_batch_id(batch_id)?;
    let dir = journal_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let root_path = ops
        .first()
        .and_then(|o| normalize(path_of(o)).parent().map(PathBuf::from))
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut journal = JournalFile {
        mounts: std::collections::BTreeMap::new(),
        version: 1,
        batch_id: batch_id.to_string(),
        created_at: now_secs(),
        root_path,
        entries: Vec::new(),
    };
    for op in ops.iter().filter(|op| included_of(op)) {
        let mut paths = vec![path_of(op)];
        if let PlanOpInput::Move { dest_dir, .. } = op {
            paths.push(dest_dir);
        }
        for path in paths {
            journal.mounts.insert(
                path.to_string(),
                crate::commands::filesystem::path_safety::mount_identity(&normalize(path))?,
            );
        }
    }
    write_journal(&journal)?;

    let mut ordered: Vec<&PlanOpInput> = ops.iter().collect();
    ordered.sort_by_key(|o| (phase_rank(o), op_depth(o)));

    let total = ops.len();
    let mut report = ApplyReport {
        applied: 0,
        skipped: 0,
        failed: Vec::new(),
        batch_id: batch_id.to_string(),
        total: ops.len(),
        duration_ms: 0,
        phase_counts: std::collections::BTreeMap::new(),
    };
    let mut done = 0usize;
    for op in ordered {
        let id = id_of(op).to_string();
        done += 1;
        let outcome = if included_of(op) {
            let changed = journal.mounts.iter().find_map(|(path, identity)| {
                crate::commands::filesystem::path_safety::verify_mount_identity(
                    &normalize(path),
                    identity,
                )
                .err()
            });
            if let Some(error) = changed {
                Outcome::Failed(error)
            } else {
                run_op(op, allow_system)
            }
        } else {
            Outcome::Skipped
        };
        let phase = match op {
            PlanOpInput::CreateFolder { .. } => "createFolder",
            PlanOpInput::CreateFile { .. } => "createFile",
            PlanOpInput::Rename { .. } => "rename",
            PlanOpInput::Move { .. } => "move",
            PlanOpInput::Trash { .. } => "trash",
        };
        *report.phase_counts.entry(phase.to_string()).or_default() += 1;
        match outcome {
            Outcome::Applied(inv) => {
                journal.entries.push(*inv);
                write_journal(&journal)?;
                report.applied += 1;
            }
            Outcome::Skipped => report.skipped += 1,
            Outcome::Failed(e) => report.failed.push(FailedOp {
                id: id.clone(),
                code: error_code(&e).into(),
                error: e,
            }),
        }
        on_progress(done, total, &id);
    }
    report.duration_ms = started.elapsed().as_millis();
    Ok(report)
}

fn inverse_label(inv: &Inverse) -> String {
    match inv {
        Inverse::RemoveDir { path, .. } => path.clone(),
        Inverse::RemoveFile { path, .. } => path.clone(),
        Inverse::RenameBack { path, .. } => path.clone(),
        Inverse::MoveBack { from, .. } => from.clone(),
        Inverse::RestoreFromTrash { slot, .. } => slot.clone(),
    }
}

fn run_inverse(inv: &Inverse, allow_system: bool) -> Outcome {
    let paths = match inv {
        Inverse::RemoveDir { path, .. } | Inverse::RemoveFile { path, .. } => vec![path],
        Inverse::RenameBack { path, to } => vec![path, to],
        Inverse::MoveBack { from, to } => vec![from, to],
        Inverse::RestoreFromTrash { slot, to } => vec![slot, to],
    };
    for path in paths {
        if let Err(e) =
            crate::commands::filesystem::path_safety::require_mounted_path(&normalize(path))
        {
            return Outcome::Failed(e.to_string());
        }
    }
    match inv {
        Inverse::RemoveDir { path, was_new } => {
            let p = normalize(path);
            if let Some(e) = guard_err(allow_system, &[&p]) {
                return Outcome::Failed(e);
            }
            if !p.exists() {
                return Outcome::Skipped;
            }
            if !was_new {
                return Outcome::Skipped;
            }
            if !p.is_dir() {
                return Outcome::Failed("not a directory".into());
            }
            match fs::remove_dir(&p) {
                Ok(()) => Outcome::Applied(Box::new(inv.clone())),
                Err(_) => Outcome::Failed("not empty".into()),
            }
        }
        Inverse::RemoveFile { path, sha256 } => {
            let p = normalize(path);
            if let Some(e) = guard_err(allow_system, &[&p]) {
                return Outcome::Failed(e);
            }
            let metadata = match fs::symlink_metadata(&p) {
                Ok(metadata) => metadata,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Outcome::Skipped,
                Err(e) => return Outcome::Failed(e.to_string()),
            };
            if !metadata.file_type().is_file() {
                return Outcome::Failed("file changed since apply".into());
            }
            let bytes = match fs::read(&p) {
                Ok(bytes) => bytes,
                Err(e) => return Outcome::Failed(e.to_string()),
            };
            if format!("{:x}", Sha256::digest(&bytes)) != *sha256 {
                return Outcome::Failed("file changed since apply".into());
            }
            match fs::remove_file(&p) {
                Ok(()) => Outcome::Applied(Box::new(inv.clone())),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
        Inverse::RenameBack { path, to } => {
            let src = normalize(path);
            let dst = src
                .parent()
                .map(|d| d.join(to))
                .unwrap_or_else(|| normalize(to));
            if let Some(e) = guard_err(allow_system, &[&src, &dst]) {
                return Outcome::Failed(e);
            }
            if !src.exists() {
                return Outcome::Skipped;
            }
            if dst.exists() {
                return Outcome::Failed("target exists".into());
            }
            match move_path(&src, &dst) {
                Ok(()) => Outcome::Applied(Box::new(inv.clone())),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
        Inverse::MoveBack { from, to } => {
            let src = normalize(from);
            let wanted = normalize(to);
            if let Some(e) = guard_err(allow_system, &[&src, &wanted]) {
                return Outcome::Failed(e);
            }
            if !src.exists() {
                return Outcome::Skipped;
            }
            if let Some(parent) = wanted.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    return Outcome::Failed(e.to_string());
                }
            }
            let dst = restore_target(&wanted, Path::exists);
            match move_path(&src, &dst) {
                Ok(()) => Outcome::Applied(Box::new(inv.clone())),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
        Inverse::RestoreFromTrash { slot, to } => {
            let slot_path = normalize(slot);
            let wanted = normalize(to);
            if let Some(e) = guard_err(allow_system, &[&wanted]) {
                return Outcome::Failed(e);
            }
            if !slot_path.exists() {
                return Outcome::Failed("not in trash".into());
            }
            if let Some(parent) = wanted.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    return Outcome::Failed(e.to_string());
                }
            }
            let dst = restore_target(&wanted, Path::exists);
            match move_path(&slot_path, &dst) {
                Ok(()) => Outcome::Applied(Box::new(inv.clone())),
                Err(e) => Outcome::Failed(e.to_string()),
            }
        }
    }
}

/// Undo a batch by replaying its journal in reverse order, then renaming the
/// journal file to `<batchId>.undone.json` (audit trail, never deleted).
fn undo_ops(
    batch_id: &str,
    allow_system: bool,
    on_progress: &mut dyn FnMut(usize, usize, &str),
) -> Result<ApplyReport, String> {
    let started = Instant::now();
    validate_batch_id(batch_id)?;
    let jpath = journal_path(batch_id);
    if !jpath.exists() {
        let undone = jpath.with_extension("undone.json");
        if undone.exists() {
            return Err("journal already undone".to_string());
        }
        return Err("no journal".to_string());
    }
    let raw = fs::read_to_string(&jpath).map_err(|e| e.to_string())?;
    let journal: JournalFile =
        serde_json::from_str(&raw).map_err(|e| format!("corrupt journal: {e}"))?;
    if journal.version != 1 {
        return Err(format!("unsupported journal version {}", journal.version));
    }

    let total = journal.entries.len();
    for (path, identity) in &journal.mounts {
        crate::commands::filesystem::path_safety::verify_mount_identity(
            &normalize(path),
            identity,
        )?;
    }
    let mut remaining = journal.clone();
    let mut report = ApplyReport {
        applied: 0,
        skipped: 0,
        failed: Vec::new(),
        batch_id: batch_id.to_string(),
        total: journal.entries.len(),
        duration_ms: 0,
        phase_counts: std::collections::BTreeMap::new(),
    };
    for (i, inv) in journal.entries.iter().rev().enumerate() {
        let current_id = inverse_label(inv);
        let outcome = run_inverse(inv, allow_system);
        let completed = !matches!(&outcome, Outcome::Failed(_));
        match outcome {
            Outcome::Applied(_) => report.applied += 1,
            Outcome::Skipped => report.skipped += 1,
            Outcome::Failed(e) => report.failed.push(FailedOp {
                id: current_id.clone(),
                code: error_code(&e).into(),
                error: e,
            }),
        }
        if completed {
            remaining.entries.remove(total - 1 - i);
            write_journal(&remaining)?;
        }
        on_progress(i + 1, total, &current_id);
    }

    report.duration_ms = started.elapsed().as_millis();

    // Failed inverses remain retryable even after partial success.
    if remaining.entries.is_empty() {
        let done_path = jpath.with_extension("undone.json");
        fs::rename(&jpath, &done_path).map_err(|e| e.to_string())?;
    }
    Ok(report)
}

/// Async entrypoints: the batch runs on a spawn_blocking worker so a ~200-op
/// plan never blocks the macOS main thread and `plan-progress` events stream
/// to the webview *during* the run (review I-3). Unit tests keep calling the
/// sync `apply_ops`/`undo_ops` workers directly.
#[tauri::command]
pub async fn apply_plan(
    app: tauri::AppHandle,
    batch_id: String,
    ops: Vec<PlanOpInput>,
    allow_system: bool,
) -> Result<ApplyReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        apply_ops(
            &batch_id,
            &ops,
            allow_system,
            &mut |done, total, current_id| {
                app.emit(
                    "plan-progress",
                    serde_json::json!({ "done": done, "total": total, "currentId": current_id }),
                )
                .ok();
            },
        )
    })
    .await
    .map_err(|e| format!("apply_plan worker failed: {e}"))?
}

#[tauri::command]
pub async fn undo_plan(
    app: tauri::AppHandle,
    batch_id: String,
    allow_system: bool,
) -> Result<ApplyReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        undo_ops(&batch_id, allow_system, &mut |done, total, current_id| {
            app.emit(
                "plan-progress",
                serde_json::json!({ "done": done, "total": total, "currentId": current_id }),
            )
            .ok();
        })
    })
    .await
    .map_err(|e| format!("undo_plan worker failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    // Shares the trash module's env lock: both mutate the process-global
    // CLIVE_TRASH_DIR, so every env-touching test in the crate must serialize.
    use crate::commands::trash::TRASH_TEST_LOCK;

    static SEQ: AtomicU64 = AtomicU64::new(0);

    #[test]
    fn partial_undo_preserves_only_failed_entries_for_retry() {
        let _lock = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("partial-undo");
        set_env(&base);
        let folder = base.join("created");
        fs::create_dir(&folder).unwrap();
        let journal = JournalFile {
            mounts: std::collections::BTreeMap::new(),
            version: 1,
            batch_id: "partial".into(),
            created_at: 0,
            root_path: s(&base),
            entries: vec![
                Inverse::RenameBack {
                    path: "/System/blocked".into(),
                    to: s(&base.join("target")),
                },
                Inverse::RemoveDir {
                    path: s(&folder),
                    was_new: true,
                },
            ],
        };
        write_journal(&journal).unwrap();
        let report = undo_ops("partial", false, &mut |_, _, _| {}).unwrap();
        assert_eq!(report.applied, 1);
        assert_eq!(report.failed.len(), 1);
        let remaining: JournalFile =
            serde_json::from_str(&fs::read_to_string(journal_path("partial")).unwrap()).unwrap();
        assert_eq!(remaining.entries.len(), 1);
        assert!(!folder.exists());
        clear_env(&base);
    }

    fn temp_base(tag: &str) -> PathBuf {
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("clive-plan-{tag}-{}-{n}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn set_env(base: &Path) {
        std::env::set_var("CLIVE_TRASH_DIR", base.join("trash"));
        std::env::set_var("CLIVE_PLAN_JOURNAL", base.join("journal"));
    }

    fn clear_env(base: &Path) {
        std::env::remove_var("CLIVE_TRASH_DIR");
        std::env::remove_var("CLIVE_PLAN_JOURNAL");
        let _ = fs::remove_dir_all(base);
    }

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn apply_then_undo_restores_initial_state() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("apply-undo");
        let root = base.join("root");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("a.pdf"), b"PDF").unwrap();
        fs::write(root.join("sub").join("b.txt"), b"B").unwrap();
        set_env(&base);

        let r = s(&root);
        // deliberately out-of-order input: the engine must still execute phases
        let ops = vec![
            PlanOpInput::Trash {
                id: "t1".into(),
                path: format!("{r}/sub"),
                included: true,
            },
            PlanOpInput::Move {
                id: "m1".into(),
                path: format!("{r}/sub/b.txt"),
                dest_dir: format!("{r}/X/Y"),
                dest_name: None,
                included: true,
            },
            PlanOpInput::CreateFolder {
                id: "c2".into(),
                path: format!("{r}/X/Y"),
                included: true,
            },
            PlanOpInput::CreateFolder {
                id: "c1".into(),
                path: format!("{r}/X"),
                included: true,
            },
            PlanOpInput::Rename {
                id: "n1".into(),
                path: format!("{r}/a.pdf"),
                new_name: "a1.pdf".into(),
                included: true,
            },
        ];
        let report = apply_ops("b1", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(report.applied, 5, "failed: {:?}", report.failed);
        assert!(report.failed.is_empty());
        assert_eq!(report.skipped, 0);

        // tree after apply
        assert!(!root.join("a.pdf").exists());
        assert_eq!(fs::read(root.join("a1.pdf")).unwrap(), b"PDF");
        assert!(!root.join("sub").exists());
        assert_eq!(
            fs::read(root.join("X").join("Y").join("b.txt")).unwrap(),
            b"B"
        );
        let slots: Vec<_> = fs::read_dir(trash_slot_dir()).unwrap().collect();
        assert_eq!(slots.len(), 1, "sub must be trashed as one slot");

        // undo → byte-for-byte initial state
        let undo = undo_ops("b1", false, &mut |_, _, _| {}).unwrap();
        assert_eq!(undo.applied, 5, "undo failed: {:?}", undo.failed);
        assert!(undo.failed.is_empty());
        assert_eq!(fs::read(root.join("a.pdf")).unwrap(), b"PDF");
        assert!(!root.join("a1.pdf").exists());
        assert_eq!(fs::read(root.join("sub").join("b.txt")).unwrap(), b"B");
        assert!(!root.join("X").exists());
        assert_eq!(fs::read_dir(trash_slot_dir()).unwrap().count(), 0);

        // journal renamed to .undone.json, original gone
        assert!(!journal_path("b1").exists());
        assert!(journal_path("b1").with_extension("undone.json").exists());
        assert!(undo_ops("b1", false, &mut |_, _, _| {}).is_err());

        clear_env(&base);
    }

    #[test]
    fn undo_move_back_uses_restored_name_without_overwriting_new_file() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("move-back-collision");
        set_env(&base);
        let original = base.join("source").join("report.txt");
        let moved = base.join("destination").join("report.txt");
        fs::create_dir_all(original.parent().unwrap()).unwrap();
        fs::create_dir_all(moved.parent().unwrap()).unwrap();
        fs::write(&original, b"new file created after move").unwrap();
        fs::write(&moved, b"original moved file").unwrap();

        let journal = JournalFile {
            mounts: std::collections::BTreeMap::new(),
            version: 1,
            batch_id: "move-back-collision".into(),
            created_at: 0,
            root_path: s(&base),
            entries: vec![Inverse::MoveBack {
                from: s(&moved),
                to: s(&original),
            }],
        };
        write_journal(&journal).unwrap();

        let report = undo_ops("move-back-collision", false, &mut |_, _, _| {}).unwrap();

        assert_eq!(report.applied, 1);
        assert!(report.failed.is_empty());
        assert_eq!(fs::read(&original).unwrap(), b"new file created after move");
        assert_eq!(
            fs::read(base.join("source").join("report (restored).txt")).unwrap(),
            b"original moved file"
        );
        assert!(!moved.exists());
        assert!(journal_path("move-back-collision")
            .with_extension("undone.json")
            .exists());
        clear_env(&base);
    }

    #[test]
    fn guard_blocks_protected_even_if_client_includes() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("guard");
        set_env(&base);

        let ops = vec![
            PlanOpInput::Trash {
                id: "g1".into(),
                path: "/Applications".into(),
                included: true,
            },
            PlanOpInput::Rename {
                id: "g2".into(),
                path: "/System/Library/CoreServices".into(),
                new_name: "hax".into(),
                included: true,
            },
            PlanOpInput::CreateFile {
                id: "g3".into(),
                path: "/System/clive-guard-test.txt".into(),
                content: "must not be written".into(),
                included: true,
            },
        ];
        let report = apply_ops("gb1", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(report.applied, 0);
        assert_eq!(report.failed.len(), 3);
        // order follows engine phases (rename before trash), so match by id
        let has_failed = |id: &str| {
            report
                .failed
                .iter()
                .any(|f| f.id == id && f.error.contains("Protected"))
        };
        assert!(has_failed("g1"), "failed: {:?}", report.failed);
        assert!(has_failed("g2"), "failed: {:?}", report.failed);
        assert!(has_failed("g3"), "failed: {:?}", report.failed);
        assert!(Path::new("/Applications").is_dir());
        assert!(Path::new("/System/Library/CoreServices").is_dir());

        // nothing journaled
        let raw = fs::read_to_string(journal_path("gb1")).unwrap();
        let j: JournalFile = serde_json::from_str(&raw).unwrap();
        assert!(j.entries.is_empty());
        assert_eq!(j.version, 1);

        clear_env(&base);
    }

    #[test]
    fn idempotent_skip_when_source_gone() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("idempotent");
        let root = base.join("root");
        fs::create_dir_all(root.join("dst")).unwrap();
        fs::write(root.join("f.txt"), b"F").unwrap();
        set_env(&base);

        let ops = vec![PlanOpInput::Move {
            id: "m1".into(),
            path: s(&root.join("f.txt")),
            dest_dir: s(&root.join("dst")),
            dest_name: None,
            included: true,
        }];
        let first = apply_ops("i1", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(first.applied, 1);

        // re-apply the same op: source already moved → skipped, no failures
        let second = apply_ops("i2", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(second.applied, 0);
        assert!(second.skipped >= 1);
        assert_eq!(second.failed.len(), 0);
        assert_eq!(fs::read(root.join("dst").join("f.txt")).unwrap(), b"F");

        clear_env(&base);
    }

    #[test]
    fn crash_keeps_applied_prefix_undoable() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("prefix");
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("a.txt"), b"A").unwrap();
        fs::write(root.join("b"), b"B").unwrap();
        set_env(&base);

        // first op succeeds, second fails (rename onto an existing target)
        let ops = vec![
            PlanOpInput::CreateFolder {
                id: "c1".into(),
                path: s(&root.join("X")),
                included: true,
            },
            PlanOpInput::Rename {
                id: "r1".into(),
                path: s(&root.join("a.txt")),
                new_name: "b".into(),
                included: true,
            },
        ];
        let report = apply_ops("p1", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(report.applied, 1);
        assert_eq!(report.failed.len(), 1);
        assert_eq!(report.failed[0].error, "target exists");

        // journal durable after the first success, containing only its inverse
        let raw = fs::read_to_string(journal_path("p1")).unwrap();
        let j: JournalFile = serde_json::from_str(&raw).unwrap();
        assert_eq!(j.entries.len(), 1);
        assert!(matches!(j.entries[0], Inverse::RemoveDir { .. }));

        clear_env(&base);
    }

    #[test]
    fn rejects_traversal_batch_id() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("traversal");
        set_env(&base);
        let ops = vec![PlanOpInput::CreateFolder {
            id: "c1".into(),
            path: s(&base.join("root/evil")),
            included: true,
        }];
        for bad in ["../../evil", "../x", "", "a/b", "a\\b", "x..y"] {
            assert_eq!(
                apply_ops(bad, &ops, false, &mut |_, _, _| {}).err(),
                Some("invalid batchId".to_string()),
                "batchId {bad:?} must be rejected"
            );
            assert_eq!(
                undo_ops(bad, false, &mut |_, _, _| {}).err(),
                Some("invalid batchId".to_string())
            );
        }
        // validation precedes any journal-dir creation: nothing touched on disk
        assert!(!base.join("journal").exists());
        assert!(!base.join("root").exists());
        clear_env(&base);
    }

    #[test]
    fn rejects_move_into_own_subtree() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("subtree");
        let root = base.join("root");
        fs::create_dir_all(root.join("X/sub")).unwrap();
        fs::write(root.join("X/sub/f.txt"), b"F").unwrap();
        set_env(&base);

        let ops = vec![PlanOpInput::Move {
            id: "m1".into(),
            path: s(&root.join("X")),
            dest_dir: s(&root.join("X/sub")),
            dest_name: None,
            included: true,
        }];
        let report = apply_ops("st1", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(report.applied, 0);
        assert_eq!(report.failed.len(), 1);
        assert_eq!(report.failed[0].error, "invalid destination");

        // self-move (dest == src) rejected too
        let ops2 = vec![PlanOpInput::Move {
            id: "m2".into(),
            path: s(&root.join("X")),
            dest_dir: s(&root.join("X")),
            dest_name: None,
            included: true,
        }];
        let r2 = apply_ops("st2", &ops2, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(r2.failed[0].error, "invalid destination");

        // nothing executed or journaled
        assert_eq!(fs::read(root.join("X/sub/f.txt")).unwrap(), b"F");
        for b in ["st1", "st2"] {
            let raw = fs::read_to_string(journal_path(b)).unwrap();
            let j: JournalFile = serde_json::from_str(&raw).unwrap();
            assert!(j.entries.is_empty());
        }
        clear_env(&base);
    }

    #[test]
    fn rejects_rename_with_path_separator() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("pathy");
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("a.txt"), b"A").unwrap();
        set_env(&base);

        for bad in ["X/b.txt", "b/c", ".", "..", "a\\b"] {
            let ops = vec![PlanOpInput::Rename {
                id: "r1".into(),
                path: s(&root.join("a.txt")),
                new_name: bad.into(),
                included: true,
            }];
            let report = apply_ops("rn1", &ops, false, &mut |_, _, _| {}).unwrap();
            assert_eq!(report.applied, 0, "newName {bad:?} must be rejected");
            assert_eq!(report.failed[0].error, "invalid name");
        }
        // nothing moved or journaled
        assert_eq!(fs::read(root.join("a.txt")).unwrap(), b"A");
        let raw = fs::read_to_string(journal_path("rn1")).unwrap();
        let j: JournalFile = serde_json::from_str(&raw).unwrap();
        assert!(j.entries.is_empty());
        clear_env(&base);
    }

    #[test]
    fn undo_keeps_journal_when_nothing_applied() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("keepend");
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("f.txt"), b"F").unwrap();
        set_env(&base);

        let ops = vec![PlanOpInput::Trash {
            id: "t1".into(),
            path: s(&root.join("f.txt")),
            included: true,
        }];
        apply_ops("kd1", &ops, false, &mut |_, _, _| {}).unwrap();

        // simulate "Finder emptied": the trash slot is gone → every inverse fails
        let tdir = trash_slot_dir();
        for e in fs::read_dir(&tdir).unwrap() {
            let _ = fs::remove_file(e.unwrap().path());
        }
        let undo = undo_ops("kd1", false, &mut |_, _, _| {}).unwrap();
        assert_eq!(undo.applied, 0);
        assert_eq!(undo.failed[0].error, "not in trash");
        // journal NOT consumed: retry stays possible
        assert!(journal_path("kd1").exists());
        assert!(!journal_path("kd1").with_extension("undone.json").exists());

        // trashing the trash dir itself is refused
        let bad = vec![PlanOpInput::Trash {
            id: "t2".into(),
            path: s(&tdir),
            included: true,
        }];
        let r = apply_ops("kd2", &bad, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(r.failed[0].error, "cannot trash the trash directory");

        clear_env(&base);
    }

    #[test]
    fn plan_op_input_wire_shape_parses() {
        // Critical for Task 4: exact camelCase wire names.
        let json = r#"[
            {"id":"c","kind":"createFolder","path":"/tmp/X","included":true},
            {"id":"n","kind":"rename","path":"/tmp/a","newName":"b","included":false},
            {"id":"m","kind":"move","path":"/tmp/a","destDir":"/tmp/X","destName":"b","included":true},
            {"id":"f","kind":"createFile","path":"/tmp/note.md","content":"hello","included":true},
            {"id":"t","kind":"trash","path":"/tmp/a","included":true}
        ]"#;
        let ops: Vec<PlanOpInput> = serde_json::from_str(json).unwrap();
        assert_eq!(ops.len(), 5);
        assert!(!included_of(&ops[1]));
        assert!(matches!(&ops[2], PlanOpInput::Move { dest_name: Some(name), .. } if name == "b"));
        assert!(matches!(&ops[3], PlanOpInput::CreateFile { content, .. } if content == "hello"));
        let report = ApplyReport {
            applied: 1,
            skipped: 2,
            failed: vec![FailedOp {
                id: "x".into(),
                code: "filesystem".into(),
                error: "e".into(),
            }],
            batch_id: "b".into(),
            total: 3,
            duration_ms: 0,
            phase_counts: std::collections::BTreeMap::new(),
        };
        let v: serde_json::Value = serde_json::to_value(&report).unwrap();
        assert_eq!(v["batchId"], "b");
        assert_eq!(v["failed"][0]["id"], "x");
        assert_eq!(v["failed"][0]["error"], "e");
        let inv: serde_json::Value = serde_json::to_value(Inverse::RemoveDir {
            path: "/p".into(),
            was_new: true,
        })
        .unwrap();
        assert_eq!(inv["removeDir"]["wasNew"], true);
        let inv: serde_json::Value = serde_json::to_value(Inverse::RestoreFromTrash {
            slot: "/s".into(),
            to: "/t".into(),
        })
        .unwrap();
        assert_eq!(inv["restoreFromTrash"]["slot"], "/s");
    }

    #[test]
    fn create_file_is_journaled_and_undo_removes_only_unchanged_content() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = temp_base("create-file-undo");
        let root = base.join("root");
        fs::create_dir_all(&root).unwrap();
        set_env(&base);
        let path = root.join("note.md");
        let ops = vec![PlanOpInput::CreateFile {
            id: "file-1".into(),
            path: s(&path),
            content: "hello".into(),
            included: true,
        }];

        let applied = apply_ops("file-undo", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(applied.applied, 1);
        assert_eq!(fs::read(&path).unwrap(), b"hello");
        let journal: JournalFile =
            serde_json::from_str(&fs::read_to_string(journal_path("file-undo")).unwrap()).unwrap();
        assert!(matches!(
            journal.entries.as_slice(),
            [Inverse::RemoveFile { .. }]
        ));

        let undone = undo_ops("file-undo", false, &mut |_, _, _| {}).unwrap();
        assert_eq!(undone.applied, 1);
        assert!(!path.exists());

        fs::write(&path, b"pre-existing").unwrap();
        let collision = apply_ops("file-collision", &ops, false, &mut |_, _, _| {}).unwrap();
        assert_eq!(collision.applied, 0);
        assert_eq!(collision.failed[0].code, "target_exists");
        assert_eq!(fs::read(&path).unwrap(), b"pre-existing");
        fs::remove_file(&path).unwrap();

        let second = vec![PlanOpInput::CreateFile {
            id: "file-2".into(),
            path: s(&path),
            content: "original".into(),
            included: true,
        }];
        apply_ops("file-changed", &second, false, &mut |_, _, _| {}).unwrap();
        fs::write(&path, b"user edit").unwrap();
        let failed_undo = undo_ops("file-changed", false, &mut |_, _, _| {}).unwrap();
        assert_eq!(failed_undo.failed[0].code, "file_changed");
        assert_eq!(fs::read(&path).unwrap(), b"user edit");
        assert!(
            journal_path("file-changed").exists(),
            "failed inverse must remain retryable"
        );
        clear_env(&base);
    }
}
