use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub extension: Option<String>,
}

pub(crate) fn normalize(path: &str) -> PathBuf {
    let trimmed = path.trim();
    if trimmed == "~" || trimmed.starts_with("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            let home = home.to_string_lossy().into_owned();
            return PathBuf::from(trimmed.replacen('~', &home, 1));
        }
    }
    PathBuf::from(trimmed)
}

/// Authoritative mirror of the webview `systemGuard.ts`. macOS system
/// locations (exact top-level entries + everything under `/System`) are
/// protected from rename / trash / move-away unless the caller passes
/// `allow_system` (the `guardSystemLocations` preference flipped off).
/// Compared case-insensitively and lexically (resolves `.`/`..`, no symlink
/// resolution) so traversal tricks can't smuggle a protected path past it.
const PROTECTED_ROOTS: &[&str] = &[
    "/", "/applications", "/library", "/system", "/usr", "/bin", "/sbin",
    "/private", "/etc", "/var", "/opt", "/cores", "/dev", "/home", "/mnt",
    "/volumes", "/network", "/automount", "/tmp", "/macos install data",
];

fn lexical_lower(path: &Path) -> String {
    use std::path::Component;
    let abs = path.is_absolute();
    let mut stack: Vec<String> = Vec::new();
    for c in path.components() {
        match c {
            Component::RootDir | Component::CurDir | Component::Prefix(_) => {}
            Component::ParentDir => {
                stack.pop();
            }
            Component::Normal(s) => stack.push(s.to_string_lossy().to_lowercase()),
        }
    }
    let joined = stack.join("/");
    if abs {
        format!("/{joined}")
    } else {
        joined
    }
}

pub(crate) fn is_protected(path: &Path) -> bool {
    let n = lexical_lower(path);
    if n == "/system" || n.starts_with("/system/") {
        return true;
    }
    PROTECTED_ROOTS.contains(&n.as_str())
}

pub(crate) fn protected_err(path: &Path) -> String {
    format!(
        "Protected system location (enable \"Protect system locations\" in Settings to override): {}",
        path.display()
    )
}

/// Reject a batch move if any source is a protected location and the guard is on.
/// Checked before any filesystem change so a batch is all-or-nothing.
pub(crate) fn guard_move_sources<'a, I, P>(srcs: I, allow_system: bool) -> Result<(), String>
where
    I: IntoIterator<Item = &'a P>,
    P: AsRef<Path> + 'a,
{
    if allow_system {
        return Ok(());
    }
    for s in srcs {
        let p = s.as_ref();
        if is_protected(p) {
            return Err(protected_err(p));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_dir(path: String, show_hidden: Option<bool>) -> Result<Vec<FileEntry>, String> {
    let dir = normalize(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", dir.display()));
    }
    let show_hidden = show_hidden.unwrap_or(false);

    let rd = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut entries: Vec<FileEntry> = Vec::new();

    for entry in rd.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        entries.push(FileEntry {
            name,
            path: p.to_string_lossy().into_owned(),
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() {
                metadata.len()
            } else {
                0
            },
            modified: metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0),
            extension: p.extension().map(|e| e.to_string_lossy().into_owned()),
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    std::env::var_os("HOME")
        .map(|h| h.to_string_lossy().into_owned())
        .ok_or_else(|| "HOME not set".to_string())
}

pub fn copy_path(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !src.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Source not found: {}", src.display()),
        ));
    }
    if src.is_dir() {
        copy_dir_recursive(src, dst)
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(src, dst).map(|_| ())
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

pub fn move_path(src: &Path, dst: &Path) -> std::io::Result<()> {
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Cross-device fallback: copy then remove
            copy_path(src, dst)?;
            if src.is_dir() {
                fs::remove_dir_all(src)
            } else {
                fs::remove_file(src)
            }
        }
    }
}

#[tauri::command]
pub fn copy_file(src: String, dst: String) -> Result<(), String> {
    copy_path(&normalize(&src), &normalize(&dst)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_file(src: String, dst: String, allow_system: bool) -> Result<(), String> {
    let s = normalize(&src);
    if !allow_system && is_protected(&s) {
        return Err(protected_err(&s));
    }
    move_path(&s, &normalize(&dst)).map_err(|e| e.to_string())
}

/// Split a file name into (stem, extension-with-dot). Directories use the whole
/// name as the stem (matching the client `ai/safety` `splitName`).
fn split_name(name: &str, is_dir: bool) -> (String, String) {
    if is_dir {
        return (name.to_string(), String::new());
    }
    match name.rfind('.') {
        Some(dot) if dot > 0 => (name[..dot].to_string(), name[dot..].to_string()),
        _ => (name.to_string(), String::new()),
    }
}

/// Collision-free destination path inside `dst_dir`, mirroring `paste_paths`'s
/// `make_unique_dst` and the webview `transfer.ts`. `claimed` tracks names taken
/// earlier in the same batch so duplicates are also resolved.
fn unique_dst(dst_dir: &Path, name: &str, is_dir: bool, claimed: &mut std::collections::HashSet<String>) -> PathBuf {
    let mut candidate_name = name.to_string();
    if dst_dir.join(&candidate_name).exists() || claimed.contains(&candidate_name) {
        let (stem, ext) = split_name(name, is_dir);
        let mut i = 1;
        loop {
            let c = format!("{stem} copy {i}{ext}");
            if !dst_dir.join(&c).exists() && !claimed.contains(&c) {
                candidate_name = c;
                break;
            }
            i += 1;
        }
    }
    claimed.insert(candidate_name.clone());
    dst_dir.join(candidate_name)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferFailure {
    pub src: String,
    pub error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferResult {
    pub applied: usize,
    pub failures: Vec<TransferFailure>,
}

/// Batch copy/move of `paths` into `dst_dir` with collision-free naming — one
/// round-trip instead of N `copy_file`/`move_file` calls.
#[tauri::command]
pub fn transfer_items(paths: Vec<String>, dst_dir: String, mode: String, allow_system: bool) -> Result<TransferResult, String> {
    let copy = mode == "copy";
    // Move removes the originals: pre-check the whole batch so a protected source
    // aborts everything before any filesystem change (atomic).
    if !copy {
        guard_move_sources(&paths, allow_system)?;
    }
    let dst_dir = normalize(&dst_dir);
    if !dst_dir.is_dir() {
        return Err(format!("Destination is not a directory: {}", dst_dir.display()));
    }
    let mut applied = 0;
    let mut failures = Vec::new();
    let mut claimed: std::collections::HashSet<String> = std::collections::HashSet::new();
    for src_str in &paths {
        let src = normalize(src_str);
        let name = match src.file_name() {
            Some(n) => n.to_string_lossy().into_owned(),
            None => {
                failures.push(TransferFailure { src: src_str.clone(), error: "invalid source".into() });
                continue;
            }
        };
        let dst = unique_dst(&dst_dir, &name, src.is_dir(), &mut claimed);
        let res = if copy { copy_path(&src, &dst) } else { move_path(&src, &dst) };
        match res {
            Ok(()) => applied += 1,
            Err(e) => failures.push(TransferFailure { src: src_str.clone(), error: e.to_string() }),
        }
    }
    Ok(TransferResult { applied, failures })
}

#[tauri::command]
pub fn rename(path: String, new_name: String, allow_system: bool) -> Result<(), String> {
    let src = normalize(&path);
    if !allow_system && is_protected(&src) {
        return Err(protected_err(&src));
    }
    let name = new_name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') {
        return Err("Invalid name".to_string());
    }
    let parent = src.parent().ok_or("No parent directory")?.to_path_buf();
    let dst = parent.join(name);
    if dst == src {
        return Ok(());
    }
    if dst.exists() {
        return Err(format!("`{}` already exists", dst.display()));
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_folder(parent: String, name: String) -> Result<String, String> {
    let dir = normalize(&parent).join(name.trim());
    fs::create_dir(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(normalize(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(normalize(&path), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(&p)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("open failed".to_string())
    }
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("open")
        .arg(&p)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("open failed".to_string())
    }
}

#[tauri::command]
pub fn quick_look(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("qlmanage")
        .arg("-p")
        .arg(&p)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("preview failed".to_string())
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpace {
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub volume_name: String,
}

#[tauri::command]
pub fn disk_space(path: String) -> Result<DiskSpace, String> {
    let p = normalize(&path);
    let out = std::process::Command::new("df")
        .arg("-kP")
        .arg(&p)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("df failed".to_string());
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let line = stdout
        .lines()
        .nth(1)
        .ok_or_else(|| "df: no data".to_string())?;
    let cols: Vec<&str> = line.split_whitespace().collect();
    if cols.len() < 6 {
        return Err("df: unexpected output".to_string());
    }
    let blocks_kb: u64 = cols[1].parse().map_err(|_| "df: bad size".to_string())?;
    let used_kb: u64 = cols[2].parse().map_err(|_| "df: bad used".to_string())?;
    let avail_kb: u64 = cols[3].parse().map_err(|_| "df: bad avail".to_string())?;
    let mount = cols[5..].join(" ");
    Ok(DiskSpace {
        total_bytes: blocks_kb * 1024,
        used_bytes: used_kb * 1024,
        free_bytes: avail_kb * 1024,
        volume_name: mount,
    })
}

#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("open")
        .arg("-a")
        .arg("Terminal")
        .arg(&p)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("could not open terminal".to_string())
    }
}

#[tauri::command]
pub fn empty_trash() -> Result<(), String> {
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg("tell application \"Finder\" to empty the trash")
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("could not empty trash".to_string())
    }
}

#[cfg(test)]
mod guard_tests {
    use super::*;

    #[test]
    fn protects_top_level_roots() {
        for p in ["/", "/Applications", "/Library", "/usr", "/etc", "/Volumes", "/tmp", "/private"] {
            assert!(is_protected(Path::new(p)), "{p} should be protected");
        }
    }

    #[test]
    fn system_is_recursive() {
        assert!(is_protected(Path::new("/System")));
        assert!(is_protected(Path::new("/System/Volumes/Data")));
    }

    #[test]
    fn children_of_other_roots_are_editable() {
        assert!(!is_protected(Path::new("/Applications/Foo.app")));
        assert!(!is_protected(Path::new("/usr/local/bin/x")));
        assert!(!is_protected(Path::new("/Users/me/Desktop")));
    }

    #[test]
    fn case_insensitive_and_trailing() {
        assert!(is_protected(Path::new("/applications")));
        let via_traversal = PathBuf::from("/Applications/Foo/..");
        assert!(is_protected(&via_traversal));
    }

    #[test]
    fn guard_move_denies_without_allow() {
        let paths = vec!["/Applications".to_string(), "/Users/me/f".to_string()];
        assert!(guard_move_sources(&paths, false).is_err());
        assert!(guard_move_sources(&paths, true).is_ok()); // opted out → allowed
        let ok = vec!["/Users/me/f".to_string()];
        assert!(guard_move_sources(&ok, false).is_ok());
    }

    #[test]
    fn commands_deny_protected_before_touching_fs() {
        // Each command returns Err from the guard BEFORE any fs::/trash call, so
        // these run safely against real system paths.
        assert!(rename("/Applications".into(), "X".into(), false)
            .err()
            .unwrap()
            .contains("Protected system location"));
        assert!(crate::commands::trash::delete_to_trash("/System".into(), false).is_err());
        assert!(move_file("/Library".into(), "/tmp/nonexistent-fm-test".into(), false).is_err());
        assert!(transfer_items(vec!["/System/Fonts".into()], "/".into(), "move".into(), false).is_err());
    }
}
