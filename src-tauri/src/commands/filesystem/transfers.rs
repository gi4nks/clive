use super::path_safety::{
    guard_move_sources, is_protected, normalize, protected_err, require_mounted_path,
};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub fn copy_path(src: &Path, dst: &Path) -> std::io::Result<()> {
    require_mounted_path(src)?;
    require_mounted_path(dst)?;
    let metadata = fs::symlink_metadata(src)?;
    if metadata.file_type().is_symlink() {
        copy_symlink(src, dst)
    } else if metadata.is_dir() {
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
        let metadata = fs::symlink_metadata(&from)?;
        if metadata.file_type().is_symlink() {
            copy_symlink(&from, &to)?;
        } else if metadata.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn copy_symlink(src: &Path, dst: &Path) -> std::io::Result<()> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    let target = fs::read_link(src)?;
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, dst)
    }
    #[cfg(windows)]
    {
        if src.is_dir() {
            std::os::windows::fs::symlink_dir(target, dst)
        } else {
            std::os::windows::fs::symlink_file(target, dst)
        }
    }
}

/// Move a path and report whether the operation stayed on one filesystem.
/// Cross-device moves use copy-then-remove and are therefore not atomic.
pub fn move_path_with_mode(src: &Path, dst: &Path) -> std::io::Result<bool> {
    require_mounted_path(src)?;
    require_mounted_path(dst)?;
    move_path_with_ops(
        src,
        dst,
        |from, to| fs::rename(from, to),
        copy_path,
        remove_path,
    )
}

fn move_path_with_ops(
    src: &Path,
    dst: &Path,
    rename: impl Fn(&Path, &Path) -> std::io::Result<()>,
    copy: impl Fn(&Path, &Path) -> std::io::Result<()>,
    remove: impl Fn(&Path) -> std::io::Result<()>,
) -> std::io::Result<bool> {
    match fs::symlink_metadata(dst) {
        Ok(_) => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                format!("Destination already exists: {}", dst.display()),
            ));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }

    match rename(src, dst) {
        Ok(()) => Ok(true),
        Err(rename_err) if rename_err.kind() == std::io::ErrorKind::CrossesDevices => {
            // Cross-device fallback: copy then remove
            if let Err(copy_err) = copy(src, dst) {
                let message = match remove(dst) {
                    Ok(()) => format!("copy fallback after rename ({rename_err}): {copy_err}"),
                    Err(cleanup_err) => format!(
                        "copy fallback after rename ({rename_err}) failed: {copy_err}; partial destination cleanup failed: {cleanup_err}"
                    ),
                };
                return Err(std::io::Error::new(copy_err.kind(), message));
            }

            match remove(src) {
                Ok(()) => Ok(false),
                Err(remove_err) => {
                    let message = match remove(dst) {
                        Ok(()) => format!(
                            "source removal after cross-device copy failed; destination copy rolled back: {remove_err}"
                        ),
                        Err(cleanup_err) => format!(
                            "source removal after cross-device copy failed: {remove_err}; destination cleanup also failed: {cleanup_err}"
                        ),
                    };
                    Err(std::io::Error::new(remove_err.kind(), message))
                }
            }
        }
        Err(rename_err) => Err(rename_err),
    }
}

fn remove_path(path: &Path) -> std::io::Result<()> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if metadata.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

pub fn move_path(src: &Path, dst: &Path) -> std::io::Result<()> {
    move_path_with_mode(src, dst).map(|_| ())
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
fn unique_dst(
    dst_dir: &Path,
    name: &str,
    is_dir: bool,
    claimed: &mut std::collections::HashSet<String>,
) -> PathBuf {
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
    /// True when at least one move used copy-then-remove across filesystems.
    pub non_atomic: bool,
}

/// Batch copy/move of `paths` into `dst_dir` with collision-free naming — one
/// round-trip instead of N `copy_file`/`move_file` calls.
#[tauri::command]
pub fn transfer_items(
    paths: Vec<String>,
    dst_dir: String,
    mode: String,
    allow_system: bool,
) -> Result<TransferResult, String> {
    if mode != "copy" && mode != "move" {
        return Err("Invalid transfer mode".to_string());
    }
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
        return Err(format!(
            "Destination is not a directory: {}",
            dst_dir.display()
        ));
    }
    let mut applied = 0;
    let mut failures = Vec::new();
    let mut non_atomic = false;
    let mut claimed: std::collections::HashSet<String> = std::collections::HashSet::new();
    for src_str in &paths {
        let src = normalize(src_str);
        let name = match src.file_name() {
            Some(n) => n.to_string_lossy().into_owned(),
            None => {
                failures.push(TransferFailure {
                    src: src_str.clone(),
                    error: "invalid source".into(),
                });
                continue;
            }
        };
        let dst = unique_dst(&dst_dir, &name, src.is_dir(), &mut claimed);
        let res = if copy {
            copy_path(&src, &dst).map(|()| true)
        } else {
            move_path_with_mode(&src, &dst)
        };
        match res {
            Ok(atomic) => {
                applied += 1;
                if !copy && !atomic {
                    non_atomic = true;
                }
            }
            Err(e) => failures.push(TransferFailure {
                src: src_str.clone(),
                error: e.to_string(),
            }),
        }
    }
    Ok(TransferResult {
        applied,
        failures,
        non_atomic,
    })
}

#[tauri::command]
pub fn rename(path: String, new_name: String, allow_system: bool) -> Result<(), String> {
    let src = normalize(&path);
    require_mounted_path(&src).map_err(|e| e.to_string())?;
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
    require_mounted_path(&dir).map_err(|e| e.to_string())?;
    if !allow_system && is_protected(&dir) {
        return Err(protected_err(&dir));
    }
    fs::create_dir(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        copy_path, create_folder, move_path_with_mode, move_path_with_ops, remove_path, rename,
        transfer_items,
    };
    use std::{
        collections::HashSet,
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn temp_dir() -> PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "clive-transfer-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn recursively_copies_directories_and_reports_missing_sources() {
        let root = temp_dir();
        let source = root.join("source");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("nested/file.txt"), "payload").unwrap();
        let destination = root.join("copy");

        copy_path(&source, &destination).unwrap();
        assert_eq!(
            fs::read_to_string(destination.join("nested/file.txt")).unwrap(),
            "payload"
        );
        let error = copy_path(&root.join("missing"), &root.join("missing-copy")).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn recursive_copy_preserves_symlinks_without_following_directory_cycles() {
        use std::os::unix::fs::symlink;

        let root = temp_dir();
        let source = root.join("source");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("nested/file.txt"), b"payload").unwrap();
        symlink("nested", source.join("nested-link")).unwrap();
        symlink("..", source.join("nested/parent-link")).unwrap();
        let destination = root.join("copy");

        copy_path(&source, &destination).unwrap();

        assert_eq!(
            fs::read(destination.join("nested/file.txt")).unwrap(),
            b"payload"
        );
        assert!(fs::symlink_metadata(destination.join("nested-link"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read_link(destination.join("nested-link")).unwrap(),
            PathBuf::from("nested")
        );
        assert!(fs::symlink_metadata(destination.join("nested/parent-link"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read_link(destination.join("nested/parent-link")).unwrap(),
            PathBuf::from("..")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn copy_preserves_unicode_names_and_resolves_unicode_collisions() {
        let root = temp_dir();
        let source = root.join("Résumé 音楽.txt");
        let destination = root.join("destination");
        fs::create_dir(&destination).unwrap();
        fs::write(&source, b"unicode").unwrap();
        fs::write(destination.join("Résumé 音楽.txt"), b"existing").unwrap();

        let result = transfer_items(
            vec![source.to_string_lossy().into_owned()],
            destination.to_string_lossy().into_owned(),
            "copy".into(),
            false,
        )
        .unwrap();

        assert_eq!(result.applied, 1);
        assert_eq!(
            fs::read(destination.join("Résumé 音楽 copy 1.txt")).unwrap(),
            b"unicode"
        );
        assert_eq!(
            fs::read(destination.join("Résumé 音楽.txt")).unwrap(),
            b"existing"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn moves_path_and_reports_same_filesystem_mode() {
        let root = temp_dir();
        let source = root.join("before.txt");
        let destination = root.join("after.txt");
        fs::write(&source, "move me").unwrap();

        assert!(move_path_with_mode(&source, &destination).unwrap());
        assert!(!source.exists());
        assert_eq!(fs::read_to_string(destination).unwrap(), "move me");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cross_device_move_copies_then_removes_source_and_reports_non_atomic() {
        let root = temp_dir();
        let source = root.join("source.txt");
        let destination = root.join("destination.txt");
        fs::write(&source, b"payload").unwrap();

        let atomic = move_path_with_ops(
            &source,
            &destination,
            |_, _| Err(std::io::Error::from(std::io::ErrorKind::CrossesDevices)),
            copy_path,
            remove_path,
        )
        .unwrap();

        assert!(
            !atomic,
            "cross-device fallback must be reported as non-atomic"
        );
        assert!(!source.exists());
        assert_eq!(fs::read(&destination).unwrap(), b"payload");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cross_device_move_does_not_overwrite_existing_destination() {
        let root = temp_dir();
        let source = root.join("source.txt");
        let destination = root.join("destination.txt");
        fs::write(&source, b"source data").unwrap();
        fs::write(&destination, b"existing data").unwrap();

        let error = move_path_with_ops(
            &source,
            &destination,
            |_, _| panic!("must reject collision before rename"),
            |_, _| panic!("must reject collision before copy"),
            remove_path,
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(&source).unwrap(), b"source data");
        assert_eq!(fs::read(&destination).unwrap(), b"existing data");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cross_device_copy_failure_cleans_partial_destination_and_keeps_source() {
        let root = temp_dir();
        let source = root.join("source.txt");
        let destination = root.join("destination.txt");
        fs::write(&source, b"original").unwrap();

        let error = move_path_with_ops(
            &source,
            &destination,
            |_, _| Err(std::io::Error::from(std::io::ErrorKind::CrossesDevices)),
            |_, dst| {
                fs::write(dst, b"partial")?;
                Err(std::io::Error::from(std::io::ErrorKind::StorageFull))
            },
            remove_path,
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::StorageFull);
        assert_eq!(fs::read(&source).unwrap(), b"original");
        assert!(!destination.exists(), "partial copy must be removed");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cross_device_copy_failure_reports_when_partial_destination_cannot_be_removed() {
        let root = temp_dir();
        let source = root.join("source.txt");
        let destination = root.join("destination.txt");
        fs::write(&source, b"original").unwrap();

        let error = move_path_with_ops(
            &source,
            &destination,
            |_, _| Err(std::io::Error::from(std::io::ErrorKind::CrossesDevices)),
            |_, dst| {
                fs::write(dst, b"partial")?;
                Err(std::io::Error::from(std::io::ErrorKind::StorageFull))
            },
            |path| {
                if path == destination {
                    Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied))
                } else {
                    remove_path(path)
                }
            },
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::StorageFull);
        assert!(error
            .to_string()
            .contains("partial destination cleanup failed"));
        assert_eq!(fs::read(&source).unwrap(), b"original");
        assert_eq!(fs::read(&destination).unwrap(), b"partial");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cross_device_source_removal_failure_rolls_back_destination_copy() {
        let root = temp_dir();
        let source = root.join("source.txt");
        let destination = root.join("destination.txt");
        fs::write(&source, b"original").unwrap();

        let error = move_path_with_ops(
            &source,
            &destination,
            |_, _| Err(std::io::Error::from(std::io::ErrorKind::CrossesDevices)),
            copy_path,
            |path| {
                if path == source {
                    Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied))
                } else {
                    remove_path(path)
                }
            },
        )
        .unwrap_err();

        assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);
        assert_eq!(fs::read(&source).unwrap(), b"original");
        assert!(
            !destination.exists(),
            "destination copy must be rolled back"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn batch_copy_resolves_existing_and_same_batch_collisions() {
        let root = temp_dir();
        let src = root.join("src");
        let dst = root.join("dst");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dst).unwrap();
        let file = src.join("report.txt");
        fs::write(&file, "new").unwrap();
        fs::write(dst.join("report.txt"), "existing").unwrap();

        let result = transfer_items(
            vec![
                file.to_string_lossy().into_owned(),
                file.to_string_lossy().into_owned(),
            ],
            dst.to_string_lossy().into_owned(),
            "copy".into(),
            false,
        )
        .unwrap();
        assert_eq!(result.applied, 2);
        assert!(result.failures.is_empty());
        assert!(!result.non_atomic);
        assert_eq!(
            fs::read_to_string(dst.join("report copy 1.txt")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(dst.join("report copy 2.txt")).unwrap(),
            "new"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn batch_copy_keeps_successes_and_reports_missing_items() {
        let root = temp_dir();
        let dst = root.join("dst");
        fs::create_dir(&dst).unwrap();
        let source = root.join("ok.bin");
        fs::write(&source, "ok").unwrap();

        let result = transfer_items(
            vec![
                source.to_string_lossy().into_owned(),
                root.join("gone").to_string_lossy().into_owned(),
            ],
            dst.to_string_lossy().into_owned(),
            "copy".into(),
            false,
        )
        .unwrap();
        assert_eq!(result.applied, 1);
        assert_eq!(result.failures.len(), 1);
        assert_eq!(result.failures[0].src, root.join("gone").to_string_lossy());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn batch_move_removes_sources_and_rejects_invalid_requests() {
        let root = temp_dir();
        let src = root.join("move.txt");
        let dst = root.join("dst");
        fs::create_dir(&dst).unwrap();
        fs::write(&src, "move").unwrap();

        let result = transfer_items(
            vec![src.to_string_lossy().into_owned()],
            dst.to_string_lossy().into_owned(),
            "move".into(),
            false,
        )
        .unwrap();
        assert_eq!(result.applied, 1);
        assert!(result.failures.is_empty());
        assert!(!result.non_atomic);
        assert!(!src.exists());
        assert!(transfer_items(
            vec![],
            dst.to_string_lossy().into_owned(),
            "link".into(),
            false
        )
        .is_err());
        assert!(transfer_items(
            vec![],
            root.join("missing").to_string_lossy().into_owned(),
            "copy".into(),
            false
        )
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn batch_move_reports_partial_failure_and_preserves_failed_source() {
        let root = temp_dir();
        let destination = root.join("destination");
        fs::create_dir(&destination).unwrap();
        let first = root.join("first.txt");
        let missing = root.join("missing.txt");
        let last = root.join("last.txt");
        fs::write(&first, b"first payload").unwrap();
        fs::write(&last, b"last payload").unwrap();

        let result = transfer_items(
            vec![
                first.to_string_lossy().into_owned(),
                missing.to_string_lossy().into_owned(),
                last.to_string_lossy().into_owned(),
            ],
            destination.to_string_lossy().into_owned(),
            "move".into(),
            false,
        )
        .unwrap();

        assert_eq!(result.applied, 2);
        assert_eq!(result.failures.len(), 1);
        assert_eq!(result.failures[0].src, missing.to_string_lossy());
        assert!(!result.non_atomic);
        assert!(!first.exists());
        assert!(!last.exists());
        assert!(!missing.exists());
        assert_eq!(
            fs::read(destination.join("first.txt")).unwrap(),
            b"first payload"
        );
        assert_eq!(
            fs::read(destination.join("last.txt")).unwrap(),
            b"last payload"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_validates_names_and_handles_noop_and_conflict() {
        let root = temp_dir();
        let source = root.join("a.txt");
        fs::write(&source, "a").unwrap();
        fs::write(root.join("taken.txt"), "b").unwrap();

        assert!(rename(
            source.to_string_lossy().into_owned(),
            "../escape".into(),
            true
        )
        .is_err());
        assert!(rename(source.to_string_lossy().into_owned(), "".into(), true).is_err());
        rename(source.to_string_lossy().into_owned(), "a.txt".into(), true).unwrap();
        assert!(rename(
            source.to_string_lossy().into_owned(),
            "taken.txt".into(),
            true
        )
        .is_err());
        rename(
            source.to_string_lossy().into_owned(),
            "renamed.txt".into(),
            true,
        )
        .unwrap();
        assert_eq!(fs::read_to_string(root.join("renamed.txt")).unwrap(), "a");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn creates_folder_and_rejects_existing_folder() {
        let root = temp_dir();
        let created =
            create_folder(root.to_string_lossy().into_owned(), "child".into(), true).unwrap();
        assert!(PathBuf::from(&created).is_dir());
        assert!(create_folder(root.to_string_lossy().into_owned(), "child".into(), true).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn read_only_directory_rejects_folder_creation() {
        use std::os::unix::fs::PermissionsExt;

        let root = temp_dir();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o555)).unwrap();
        let result = create_folder(root.to_string_lossy().into_owned(), "blocked".into(), true);
        fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();

        assert!(result.is_err());
        assert!(!root.join("blocked").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn directory_names_keep_dots_while_file_extensions_are_preserved() {
        let root = temp_dir();
        let dst = root.join("dst");
        fs::create_dir(&dst).unwrap();
        fs::create_dir(root.join("bundle.v1")).unwrap();
        fs::write(root.join(".env"), "secret").unwrap();

        let result = transfer_items(
            vec![
                root.join("bundle.v1").to_string_lossy().into_owned(),
                root.join(".env").to_string_lossy().into_owned(),
            ],
            dst.to_string_lossy().into_owned(),
            "copy".into(),
            false,
        )
        .unwrap();
        assert_eq!(result.applied, 2);
        assert!(dst.join("bundle.v1").is_dir());
        assert!(dst.join(".env").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicate_claimed_names_are_unique() {
        let root = temp_dir();
        let dst = root.join("dst");
        fs::create_dir(&dst).unwrap();
        let first = root.join("one");
        let second = root.join("two");
        fs::create_dir(&first).unwrap();
        fs::create_dir(&second).unwrap();
        fs::write(first.join("item"), "1").unwrap();
        fs::write(second.join("item"), "2").unwrap();
        let mut claimed = HashSet::new();
        assert_eq!(
            super::unique_dst(&dst, "item", false, &mut claimed),
            dst.join("item")
        );
        assert_eq!(
            super::unique_dst(&dst, "item", false, &mut claimed),
            dst.join("item copy 1")
        );
        fs::remove_dir_all(root).unwrap();
    }
}
