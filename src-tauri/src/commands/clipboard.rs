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
    set_paths(&state, paths, "copy");
    Ok(())
}

#[tauri::command]
pub fn cut_paths(state: State<'_, ClipboardState>, paths: Vec<String>) -> Result<(), String> {
    set_paths(&state, paths, "move");
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
    Ok(clipboard_info_for(&state))
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
    paste_paths_for(&state, target_dir, allow_system)
}

fn set_paths(state: &ClipboardState, paths: Vec<String>, operation: &str) {
    let files = paths.into_iter().map(PathBuf::from).collect();
    state.set_files(files);
    state.set_last_operation(operation);
}

fn clipboard_info_for(state: &ClipboardState) -> ClipboardInfo {
    let paths = state
        .get_files()
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    ClipboardInfo {
        paths,
        operation: state.get_last_operation(),
    }
}

fn paste_paths_for(
    state: &ClipboardState,
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
        crate::commands::filesystem::path_safety::guard_move_sources(&files, allow_system)?;
    }

    let dst_dir = PathBuf::from(target_dir.trim());
    let mut pasted = Vec::new();

    for src in &files {
        let fname = src.file_name().ok_or("Invalid source path")?;
        let dst = make_unique_dst(&dst_dir.join(fname));

        if op == "move" {
            crate::commands::filesystem::transfers::move_path(src, &dst)
                .map_err(|e| e.to_string())?;
        } else {
            crate::commands::filesystem::transfers::copy_path(src, &dst)
                .map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::{clipboard_info_for, make_unique_dst, paste_paths_for, set_paths, ClipboardState};
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn temp_dir() -> PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "clive-clipboard-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn copy_and_cut_state_exposes_paths_and_operation() {
        let state = ClipboardState::new();
        set_paths(&state, vec!["/tmp/a".into(), "/tmp/b".into()], "copy");
        let info = clipboard_info_for(&state);
        assert_eq!(info.paths.len(), 2);
        assert_eq!(info.operation.as_deref(), Some("copy"));
        set_paths(&state, vec!["/tmp/c".into()], "move");
        assert_eq!(
            clipboard_info_for(&state).operation.as_deref(),
            Some("move")
        );
        assert_eq!(state.get_files().len(), 1);
        state.clear();
        assert!(state.get_files().is_empty());
        assert_eq!(state.get_last_operation(), None);
    }

    #[test]
    fn paste_copy_uses_unique_names_and_keeps_clipboard() {
        let root = temp_dir();
        let source = root.join("report.txt");
        let target = root.join("target");
        fs::create_dir(&target).unwrap();
        fs::write(&source, "copy").unwrap();
        fs::write(target.join("report.txt"), "existing").unwrap();
        let state = ClipboardState::new();
        set_paths(&state, vec![source.to_string_lossy().into_owned()], "copy");

        let result = paste_paths_for(&state, target.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(
            result,
            vec![target.join("report copy 1.txt").to_string_lossy()]
        );
        assert_eq!(
            fs::read_to_string(target.join("report copy 1.txt")).unwrap(),
            "copy"
        );
        assert_eq!(state.get_last_operation().as_deref(), Some("copy"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn paste_move_clears_clipboard_and_empty_paste_fails() {
        let root = temp_dir();
        let source = root.join("move.txt");
        let target = root.join("target");
        fs::create_dir(&target).unwrap();
        fs::write(&source, "move").unwrap();
        let state = ClipboardState::new();
        set_paths(&state, vec![source.to_string_lossy().into_owned()], "move");

        let result = paste_paths_for(&state, target.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(result, vec![target.join("move.txt").to_string_lossy()]);
        assert!(!source.exists());
        assert!(state.get_files().is_empty());
        assert_eq!(state.get_last_operation(), None);
        assert_eq!(
            paste_paths_for(&state, target.to_string_lossy().into_owned(), false).unwrap_err(),
            "Clipboard is empty"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn paste_rejects_a_source_without_a_file_name() {
        let state = ClipboardState::new();
        set_paths(&state, vec!["/".into()], "copy");
        assert_eq!(
            paste_paths_for(&state, "/tmp".into(), true).unwrap_err(),
            "Invalid source path"
        );
    }

    #[test]
    fn unique_destination_handles_names_without_extensions() {
        let root = temp_dir();
        let target = root.join("README");
        fs::write(&target, "existing").unwrap();
        assert_eq!(make_unique_dst(&target), root.join("README copy 1"));
        fs::write(root.join("README copy 1"), "existing").unwrap();
        assert_eq!(make_unique_dst(&target), root.join("README copy 2"));
        fs::remove_dir_all(root).unwrap();
    }
}
