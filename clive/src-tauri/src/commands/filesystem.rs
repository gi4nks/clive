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
pub fn copy_file(src: String, dst: String, allow_system: bool) -> Result<(), String> {
    let destination = normalize(&dst);
    if !allow_system && is_protected(&destination) {
        return Err(protected_err(&destination));
    }
    copy_path(&normalize(&src), &destination).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_file(src: String, dst: String, allow_system: bool) -> Result<(), String> {
    let s = normalize(&src);
    let destination = normalize(&dst);
    if !allow_system && is_protected(&s) {
        return Err(protected_err(&s));
    }
    if !allow_system && is_protected(&destination) {
        return Err(protected_err(&destination));
    }
    move_path(&s, &destination).map_err(|e| e.to_string())
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
    if !allow_system && is_protected(&dst_dir) {
        return Err(protected_err(&dst_dir));
    }
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
pub fn create_folder(parent: String, name: String, allow_system: bool) -> Result<String, String> {
    let dir = normalize(&parent).join(name.trim());
    if !allow_system && is_protected(&dir) {
        return Err(protected_err(&dir));
    }
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

/// Ask Finder to connect an SMB share. Authentication remains in macOS
/// Keychain/Finder; Clive deliberately never receives or stores a password.
#[tauri::command]
pub fn connect_smb(endpoint: String) -> Result<(), String> {
    let endpoint = endpoint.trim();
    validate_smb_endpoint(endpoint)?;
    let status = std::process::Command::new("open")
        .arg(endpoint)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("macOS could not open the SMB endpoint".to_string()) }
}

fn validate_smb_endpoint(endpoint: &str) -> Result<(), String> {
    if !endpoint.starts_with("smb://") || endpoint.len() <= 6 || endpoint.chars().any(|c| c.is_whitespace() || c.is_control()) {
        Err("Invalid SMB endpoint".to_string())
    } else {
        Ok(())
    }
}

/// Unmount only a direct child of /Volumes. This avoids allowing a remote
/// mapping to turn into an arbitrary diskutil invocation.
#[tauri::command]
pub fn disconnect_volume(path: String) -> Result<(), String> {
    let p = normalize(&path);
    validate_volume_mount(&p)?;
    let output = std::process::Command::new("diskutil")
        .args(["unmount", path.trim()])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if detail.is_empty() { "macOS could not disconnect the volume".to_string() } else { detail })
    }
}

fn validate_volume_mount(path: &Path) -> Result<(), String> {
    if path.parent() != Some(Path::new("/Volumes")) || path.file_name().is_none() {
        Err("Only volumes mounted directly under /Volumes can be disconnected".to_string())
    } else {
        Ok(())
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

/// A mounted volume as shown in the Volumes UI (status-bar popover + sidebar).
#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    pub name: String,
    pub mount_point: String,
    pub device: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    /// "internal" (boot volume), "network" (//host/share) or "external".
    pub kind: String,
    pub ejectable: bool,
}

/// Parse `df -kP` output into user-visible volumes. Keeps only the boot volume
/// (`/`) and direct `/Volumes/<name>` mounts (external disks, disk images,
/// network shares); APFS clone/synthetic lines (`/System/Volumes/*`,
/// `map auto_home`, …) are dropped so the container is not duplicated.
/// For the internal volume `used = total - free`: df's own "Used" column
/// counts only the read-only system volume, while Finder reports the whole
/// APFS container. `df -P` escapes spaces in mount points as `\040`.
pub fn parse_volumes(df_out: &str, root_name: &str) -> Vec<Volume> {
    let mut out = Vec::new();
    for line in df_out.lines().skip(1) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 6 {
            continue;
        }
        let Ok(blocks_kb) = cols[1].parse::<u64>() else { continue };
        let Ok(used_kb) = cols[2].parse::<u64>() else { continue };
        let Ok(avail_kb) = cols[3].parse::<u64>() else { continue };
        let mount = cols[5..].join(" ").replace("\\040", " ");
        let source = cols[0];
        let (name, kind) = if mount == "/" {
            (root_name.to_string(), "internal")
        } else if let Some(rest) = mount.strip_prefix("/Volumes/") {
            if rest.is_empty() || rest.contains('/') || rest.starts_with('.') {
                continue;
            }
            let kind = if source.starts_with("//") || source.starts_with("smb://") { "network" } else { "external" };
            (rest.to_string(), kind)
        } else {
            continue;
        };
        let total = blocks_kb * 1024;
        let free = avail_kb * 1024;
        let used = if kind == "internal" { total.saturating_sub(free) } else { used_kb * 1024 };
        out.push(Volume {
            name,
            device: source.to_string(),
            mount_point: mount,
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            kind: kind.to_string(),
            ejectable: kind != "internal",
        });
    }
    // Boot volume first, then alphabetical for a stable, predictable list.
    out.sort_by(|a, b| {
        (a.kind != "internal", a.name.to_lowercase()).cmp(&(b.kind != "internal", b.name.to_lowercase()))
    });
    out
}

/// Name of the boot volume: `/Volumes/<name>` is a symlink to `/` on macOS.
fn boot_volume_name() -> String {
    if let Ok(rd) = fs::read_dir("/Volumes") {
        for entry in rd.flatten() {
            let Ok(target) = fs::read_link(entry.path()) else { continue };
            if target == Path::new("/") {
                if let Some(n) = entry.file_name().to_str() {
                    return n.to_string();
                }
            }
        }
    }
    "Macintosh HD".to_string()
}

/// Tauri command: all visible mounted volumes with usage numbers.
#[tauri::command]
pub fn list_volumes() -> Result<Vec<Volume>, String> {
    let out = std::process::Command::new("df")
        .arg("-kP")
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("df failed".to_string());
    }
    Ok(parse_volumes(&String::from_utf8_lossy(&out.stdout), &boot_volume_name()))
}

/// Mount must be a direct child of /Volumes with a printable name — no root,
/// no traversal, no hidden entries, no nested submounts.
fn validate_eject_mount(mount: &str) -> Result<PathBuf, String> {
    let m = mount.trim();
    let p = PathBuf::from(m);
    let comps: Vec<_> = p.components().collect();
    if comps.len() != 3 {
        return Err(format!("invalid mount '{m}'"));
    }
    if comps[0] != std::path::Component::RootDir || comps[1] != std::path::Component::Normal("Volumes".as_ref()) {
        return Err(format!("invalid mount '{m}'"));
    }
    let name = match comps[2] {
        std::path::Component::Normal(n) => n.to_string_lossy().into_owned(),
        _ => return Err(format!("invalid mount '{m}'")),
    };
    if name.is_empty() || name.starts_with('.') || name.contains("..") {
        return Err(format!("invalid mount '{m}'"));
    }
    Ok(p)
}

/// Tauri command: eject/unmount a volume under /Volumes. The boot volume is
/// unreachable by validation (mount `/` has 1 component); network shares are
/// unmounted, disks and images ejected.
#[tauri::command]
pub fn eject_volume(mount: String) -> Result<(), String> {
    let path = validate_eject_mount(&mount)?;
    let vols = list_volumes()?;
    let vol = vols
        .iter()
        .find(|v| v.mount_point == path.to_string_lossy())
        .ok_or_else(|| format!("'{mount}' is not a mounted volume"))?;
    if !vol.ejectable {
        return Err(format!("'{}' cannot be ejected", vol.name));
    }
    let action = if vol.kind == "network" { "unmount" } else { "eject" };
    let status = std::process::Command::new("/usr/sbin/diskutil")
        .arg(action)
        .arg(mount.trim())
        .output()
        .map_err(|e| e.to_string())?;
    if !status.status.success() {
        let out_s = String::from_utf8_lossy(&status.stdout).into_owned();
        let err_s = String::from_utf8_lossy(&status.stderr).into_owned();
        let first = out_s
            .lines()
            .chain(err_s.lines())
            .find(|l| !l.trim().is_empty())
            .unwrap_or("eject failed")
            .to_string();
        return Err(first);
    }
    Ok(())
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
    fn remote_inputs_are_narrowly_validated() {
        assert!(validate_smb_endpoint("smb://nas.local/NAS").is_ok());
        assert!(validate_smb_endpoint("https://nas.local/NAS").is_err());
        assert!(validate_smb_endpoint("smb://nas.local/my share").is_err());
        assert!(validate_volume_mount(Path::new("/Volumes/NAS")).is_ok());
        assert!(validate_volume_mount(Path::new("/Volumes/NAS/Docs")).is_err());
        assert!(validate_volume_mount(Path::new("/Users/me")).is_err());
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
        assert!(copy_file("/Users/me/source".into(), "/Library".into(), false).is_err());
        assert!(move_file("/Users/me/source".into(), "/Applications".into(), false).is_err());
        assert!(create_folder("/".into(), "System".into(), false).is_err());
    }
}

#[cfg(test)]
mod volume_tests {
    use super::*;

    const DF: &str = "\
Filesystem                                  1024-blocks       Used  Available Capacity  Mounted on
/dev/disk3s1s1                                239362496   12346716   31859956    28%    /
devfs                                               217        217          0   100%    /dev
/dev/disk3s6                                  239362496    4194768   31859956    12%    /System/Volumes/VM
/dev/disk3s5                                  239362496  180766332   31859956    86%    /System/Volumes/Data
map auto_home                                         0          0          0   100%    /System/Volumes/Data/home
/dev/disk5s2                                   50331648   10485760   39845888    21%    /Volumes/USB\\040DISK
//demo@nas._smb._tcp.local/downloads  3840802072 2750676924 1090125148    72%    /Volumes/downloads
/dev/disk7s1                                    2048000      10240    2037760     1%    /Volumes/Clive
/dev/disk8s1                                    2048000      10240    2037760     1%    /Volumes/.hidden
/dev/disk9s1                                    2048000      10240    2037760     1%    /Volumes/outer/sub
";

    #[test]
    fn parses_only_user_visible_volumes() {
        let v = parse_volumes(DF, "Macintosh HD");
        let mounts: Vec<_> = v.iter().map(|x| x.mount_point.as_str()).collect();
        assert_eq!(mounts, ["/", "/Volumes/Clive", "/Volumes/downloads", "/Volumes/USB DISK"]);
    }

    #[test]
    fn internal_used_is_container_math() {
        let v = parse_volumes(DF, "Macintosh HD");
        let boot = &v[0];
        assert_eq!(boot.kind, "internal");
        assert_eq!(boot.total_bytes, 239362496 * 1024);
        assert_eq!(boot.free_bytes, 31859956 * 1024);
        assert_eq!(boot.used_bytes, boot.total_bytes - boot.free_bytes);
        assert!(!boot.ejectable);
    }

    #[test]
    fn classifies_kinds_and_escapes() {
        let v = parse_volumes(DF, "Macintosh HD");
        let usb = v.iter().find(|x| x.name == "USB DISK").unwrap();
        assert_eq!(usb.kind, "external");
        assert!(usb.ejectable);
        let smb = v.iter().find(|x| x.name == "downloads").unwrap();
        assert_eq!(smb.kind, "network");
        assert_eq!(smb.device, "//demo@nas._smb._tcp.local/downloads");
    }

    #[test]
    fn hidden_and_nested_and_clones_are_skipped() {
        let v = parse_volumes(DF, "Macintosh HD");
        assert!(v.iter().all(|x| !x.name.starts_with('.')));
        assert!(v.iter().all(|x| x.name != "sub" && x.name != "Data" && x.name != "home"));
    }

    #[test]
    fn root_name_falls_back_and_sorts_boot_first() {
        let mut v = parse_volumes(DF, "SSD interna");
        assert_eq!(v[0].name, "SSD interna");
        v.sort_by(|a, b| b.name.cmp(&a.name));
        assert_ne!(v[0].kind, "internal"); // sort inside parse is by (non-internal, name)
        let v = parse_volumes(DF, "X");
        assert_eq!(v[0].kind, "internal");
        assert_eq!(v[1].name, "Clive");
    }

    #[test]
    fn eject_mount_guard_rejects_everything_but_direct_children() {
        assert!(validate_eject_mount("/").is_err());
        assert!(validate_eject_mount("/Volumes").is_err());
        assert!(validate_eject_mount("/Volumes/../USB").is_err());
        assert!(validate_eject_mount("/Volumes/a/b").is_err());
        assert!(validate_eject_mount("/Volumes/.hidden").is_err());
        assert!(validate_eject_mount("/home/x").is_err());
        assert!(validate_eject_mount("/Volumes/USB DISK").is_ok());
    }
}

/// Max bytes `read_file_bytes` will transfer (previews only; bigger files are
/// meant for Quick Look / external apps).
pub const PREVIEW_MAX_BYTES: u64 = 32 * 1024 * 1024;

/// Tauri command: file content as base64 for the in-app preview panel.
/// Directories are rejected; files over `PREVIEW_MAX_BYTES` error out BEFORE
/// any read so a huge video never crosses the IPC boundary.
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<String, String> {
    let p = normalize(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("cannot read '{path}': {e}"))?;
    if meta.is_dir() {
        return Err(format!("'{path}' is a directory"));
    }
    if meta.len() > PREVIEW_MAX_BYTES {
        return Err(format!("too-large:{}", meta.len()));
    }
    let bytes = fs::read(&p).map_err(|e| format!("cannot read '{path}': {e}"))?;
    Ok(base64_encode(&bytes))
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Minimal standard-alphabet base64 (no extra deps; input is a Vec<u8>).
pub(crate) fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        out.push(B64[(n >> 18 & 63) as usize] as char);
        out.push(B64[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[(n & 63) as usize] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod preview_tests {
    use super::*;

    #[test]
    fn base64_encode_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(&[0u8, 255, 128, 64]), "AP+AQA==");
    }

    #[test]
    fn read_file_bytes_roundtrip_and_dir_reject() {
        let dir = std::env::temp_dir().join(format!("clive-prev-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.bin");
        std::fs::write(&f, b"hello preview").unwrap();
        let got = read_file_bytes(f.to_string_lossy().into_owned()).unwrap();
        assert_eq!(got, base64_encode(b"hello preview"));
        assert!(read_file_bytes(dir.to_string_lossy().into_owned()).is_err());
        let missing = read_file_bytes(dir.join("nope").to_string_lossy().into_owned()).unwrap_err();
        assert!(missing.contains("cannot read"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
