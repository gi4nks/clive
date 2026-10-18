use super::path_safety::{normalize, require_mounted_path};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: u64,
    pub created: Option<u64>,
    pub permissions: String,
    pub child_count: Option<u64>,
}

#[tauri::command]
pub async fn file_info(path: String) -> Result<FileInfo, String> {
    tokio::task::spawn_blocking(move || file_info_sync(path))
        .await
        .map_err(|e| format!("file information task failed: {e}"))?
}

pub(crate) fn file_info_sync(path: String) -> Result<FileInfo, String> {
    let p = normalize(&path);
    require_mounted_path(&p).map_err(|e| e.to_string())?;
    let meta = fs::metadata(&p).map_err(|e| format!("cannot inspect '{}': {e}", p.display()))?;
    let epoch = |time: std::io::Result<std::time::SystemTime>| {
        time.ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
    };
    let child_count = if meta.is_dir() {
        fs::read_dir(&p)
            .ok()
            .map(|entries| entries.flatten().count() as u64)
    } else {
        None
    };
    let size = if meta.is_dir() {
        directory_size(&p).ok()
    } else if meta.is_file() {
        Some(meta.len())
    } else {
        Some(0)
    };
    #[cfg(unix)]
    let permissions = {
        use std::os::unix::fs::PermissionsExt;
        format!("{:04o}", meta.permissions().mode() & 0o7777)
    };
    #[cfg(not(unix))]
    let permissions = if meta.permissions().readonly() {
        "read-only"
    } else {
        "read/write"
    }
    .to_string();

    Ok(FileInfo {
        name: p
            .file_name()
            .unwrap_or(p.as_os_str())
            .to_string_lossy()
            .into_owned(),
        path: p.to_string_lossy().into_owned(),
        is_dir: meta.is_dir(),
        size,
        modified: epoch(meta.modified()).unwrap_or(0),
        created: epoch(meta.created()),
        permissions,
        child_count,
    })
}

fn directory_size(root: &Path) -> std::io::Result<u64> {
    let mut total = 0u64;
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path)?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                pending.push(path);
            } else if metadata.is_file() {
                total = total.saturating_add(metadata.len());
            }
        }
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn temp_dir() -> PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "clive-metadata-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn reports_file_and_recursive_directory_metadata() {
        let root = temp_dir();
        fs::write(root.join("one.txt"), "abc").unwrap();
        fs::create_dir(root.join("nested")).unwrap();
        fs::write(root.join("nested/two"), "de").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.join("one.txt"), root.join("linked.txt")).unwrap();

        let file = file_info_sync(root.join("one.txt").to_string_lossy().into_owned()).unwrap();
        assert_eq!(file.name, "one.txt");
        assert_eq!(file.size, Some(3));
        assert!(!file.is_dir);
        assert!(file.permissions.len() >= 3);

        let dir = file_info_sync(root.to_string_lossy().into_owned()).unwrap();
        assert!(dir.is_dir);
        assert_eq!(dir.child_count, Some(if cfg!(unix) { 3 } else { 2 }));
        assert_eq!(dir.size, Some(5)); // nested files count; symlinks do not
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_path_returns_a_contextual_error() {
        let error =
            file_info_sync("/tmp/clive-metadata-path-that-does-not-exist".into()).unwrap_err();
        assert!(error.contains("cannot inspect"));
    }
}
