use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
pub struct ClipboardState {
    files: Mutex<HashSet<PathBuf>>,
    last_operation: Mutex<Option<String>>,
}

impl ClipboardState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_files(&self, files: HashSet<PathBuf>) {
        *self.files.lock().unwrap() = files;
    }

    pub fn get_files(&self) -> HashSet<PathBuf> {
        self.files.lock().unwrap().clone()
    }

    pub fn set_last_operation(&self, op: &str) {
        *self.last_operation.lock().unwrap() = Some(op.to_string());
    }

    pub fn get_last_operation(&self) -> Option<String> {
        self.last_operation.lock().unwrap().clone()
    }

    pub fn clear(&self) {
        self.set_files(HashSet::new());
        *self.last_operation.lock().unwrap() = None;
    }
}

#[tauri::command]
pub fn copy_paths(state: State<'_, ClipboardState>, paths: Vec<String>) -> Result<(), String> {
    let files = paths.into_iter().map(PathBuf::from).collect();
    state.set_files(files);
    state.set_last_operation("copy");
    Ok(())
}

#[tauri::command]
pub fn cut_paths(state: State<'_, ClipboardState>, paths: Vec<String>) -> Result<(), String> {
    let files = paths.into_iter().map(PathBuf::from).collect();
    state.set_files(files);
    state.set_last_operation("move");
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardInfo {
    pub paths: Vec<String>,
    pub operation: Option<String>,
}

#[tauri::command]
pub fn clipboard_info(state: State<'_, ClipboardState>) -> Result<ClipboardInfo, String> {
    let paths = state
        .get_files()
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    Ok(ClipboardInfo {
        paths,
        operation: state.get_last_operation(),
    })
}

#[tauri::command]
pub fn clear_clipboard(state: State<'_, ClipboardState>) -> Result<(), String> {
    state.clear();
    Ok(())
}

#[tauri::command]
pub fn paste_paths(
    state: State<'_, ClipboardState>,
    target_dir: String,
    allow_system: bool,
) -> Result<Vec<String>, String> {
    let files = state.get_files();
    if files.is_empty() {
        return Err("Clipboard is empty".to_string());
    }
    let op = state
        .get_last_operation()
        .unwrap_or_else(|| "copy".to_string());

    // A paste-move removes the originals → reject protected sources up front.
    if op == "move" {
        crate::commands::filesystem::guard_move_sources(&files, allow_system)?;
    }

    let dst_dir = PathBuf::from(target_dir.trim());
    let mut pasted = Vec::new();

    for src in &files {
        let fname = src.file_name().ok_or("Invalid source path")?;
        let dst = make_unique_dst(&dst_dir.join(fname));

        if op == "move" {
            crate::commands::filesystem::move_path(src, &dst).map_err(|e| e.to_string())?;
        } else {
            crate::commands::filesystem::copy_path(src, &dst).map_err(|e| e.to_string())?;
        }
        pasted.push(dst.to_string_lossy().into_owned());
    }

    if op == "move" {
        state.clear();
    }

    Ok(pasted)
}

fn make_unique_dst(dst: &Path) -> PathBuf {
    if !dst.exists() {
        return dst.to_path_buf();
    }
    let parent = dst.parent().unwrap_or(std::path::Path::new("."));
    let stem = dst
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".to_string());
    let ext = dst
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();

    let mut i = 1;
    loop {
        let candidate_name = if ext.is_empty() {
            format!("{stem} copy {i}")
        } else {
            format!("{stem} copy {i}.{ext}")
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
        i += 1;
    }
}
