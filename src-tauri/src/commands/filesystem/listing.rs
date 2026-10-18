use super::finder_tags::{read_finder_tags, FileTag};
use super::path_safety::normalize;
use serde::Serialize;
use std::fs;
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
    pub tags: Vec<FileTag>,
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
            tags: read_finder_tags(&p).unwrap_or_default(),
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::list_dir;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn temp_dir() -> PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "clive-listing-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn lists_visible_entries_with_metadata_and_directories_first() {
        let root = temp_dir();
        fs::write(root.join("zeta.txt"), "hello").unwrap();
        fs::write(root.join("Alpha.txt"), "ab").unwrap();
        fs::create_dir(root.join("beta")).unwrap();
        fs::write(root.join(".hidden"), "secret").unwrap();

        let entries = list_dir(root.to_string_lossy().into_owned(), None).unwrap();
        assert_eq!(
            entries.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
            ["beta", "Alpha.txt", "zeta.txt"]
        );
        let alpha = &entries[1];
        assert_eq!(alpha.size, 2);
        assert_eq!(alpha.extension.as_deref(), Some("txt"));
        assert!(!alpha.is_dir);
        assert_eq!(alpha.path, root.join("Alpha.txt").to_string_lossy());
        assert!(!entries.iter().any(|e| e.name == ".hidden"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn includes_hidden_entries_only_when_requested() {
        let root = temp_dir();
        fs::write(root.join(".profile"), "x").unwrap();

        let entries = list_dir(root.to_string_lossy().into_owned(), Some(true)).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, ".profile");
        assert_eq!(entries[0].size, 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_non_directories() {
        let root = temp_dir();
        let file = root.join("file");
        fs::write(&file, "x").unwrap();
        let error = list_dir(file.to_string_lossy().into_owned(), None).unwrap_err();
        assert!(error.contains("Not a directory"));
        fs::remove_dir_all(root).unwrap();
    }
}
