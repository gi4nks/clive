use super::finder_tags::{read_finder_tags, write_finder_tags, FileTag, FileTagsUpdate};
use super::path_safety::{is_protected, normalize, protected_err, require_mounted_path};

#[tauri::command]
pub fn get_file_tags(paths: Vec<String>) -> Result<Vec<(String, Vec<FileTag>)>, String> {
    paths
        .into_iter()
        .map(|path| {
            let p = normalize(&path);
            require_mounted_path(&p).map_err(|e| e.to_string())?;
            if !p.exists() {
                return Err(format!("File does not exist: {}", p.display()));
            }
            Ok((path, read_finder_tags(&p)?))
        })
        .collect()
}

#[tauri::command]
pub fn set_files_tags(updates: Vec<FileTagsUpdate>, allow_system: bool) -> Result<(), String> {
    let mut prepared = Vec::with_capacity(updates.len());
    for update in updates {
        let path = normalize(&update.path);
        require_mounted_path(&path).map_err(|e| e.to_string())?;
        if !path.exists() {
            return Err(format!("File does not exist: {}", path.display()));
        }
        if !allow_system && is_protected(&path) {
            return Err(protected_err(&path));
        }
        let mut tags: Vec<FileTag> = Vec::new();
        for tag in update.tags {
            let name = tag.name.trim();
            if name.is_empty() {
                continue;
            }
            if name.contains('\n') || name.contains('\r') {
                return Err("invalid-tag-name".into());
            }
            if let Some(existing) = tags
                .iter_mut()
                .find(|current| current.name.eq_ignore_ascii_case(name))
            {
                existing.color = tag.color.min(7);
            } else {
                tags.push(FileTag {
                    name: name.to_string(),
                    color: tag.color.min(7),
                });
            }
        }
        let previous = read_finder_tags(&path)?;
        prepared.push((path, tags, previous));
    }
    for index in 0..prepared.len() {
        let (path, tags, _) = &prepared[index];
        if let Err(error) = write_finder_tags(path, tags) {
            let rollback_errors: Vec<String> = prepared[..index]
                .iter()
                .rev()
                .filter_map(|(path, _, previous)| {
                    write_finder_tags(path, previous)
                        .err()
                        .map(|e| format!("{}: {e}", path.display()))
                })
                .collect();
            if rollback_errors.is_empty() {
                return Err(error);
            }
            return Err(format!(
                "{error}; rollback failed for {}",
                rollback_errors.join(", ")
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{get_file_tags, set_files_tags};
    use crate::commands::filesystem::finder_tags::{FileTag, FileTagsUpdate};
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn temp_file() -> (PathBuf, PathBuf) {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!(
            "clive-tags-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("sample.txt");
        fs::write(&file, "data").unwrap();
        (root, file)
    }

    #[test]
    fn reads_tags_and_rejects_missing_paths() {
        let (root, file) = temp_file();
        let results = get_file_tags(vec![file.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, file.to_string_lossy());
        assert!(get_file_tags(vec![root.join("missing").to_string_lossy().into_owned()]).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn trims_deduplicates_and_clamps_tags_then_clears_them() {
        let (root, file) = temp_file();
        set_files_tags(
            vec![FileTagsUpdate {
                path: file.to_string_lossy().into_owned(),
                tags: vec![
                    FileTag {
                        name: "  Work ".into(),
                        color: 9,
                    },
                    FileTag {
                        name: "work".into(),
                        color: 3,
                    },
                    FileTag {
                        name: "   ".into(),
                        color: 2,
                    },
                ],
            }],
            true,
        )
        .unwrap();
        let tags = get_file_tags(vec![file.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(
            tags[0].1,
            vec![FileTag {
                name: "Work".into(),
                color: 3
            }]
        );

        set_files_tags(
            vec![FileTagsUpdate {
                path: file.to_string_lossy().into_owned(),
                tags: vec![],
            }],
            true,
        )
        .unwrap();
        assert!(
            get_file_tags(vec![file.to_string_lossy().into_owned()]).unwrap()[0]
                .1
                .is_empty()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_invalid_tag_names_before_writing_any_file() {
        let (root, file) = temp_file();
        let error = set_files_tags(
            vec![FileTagsUpdate {
                path: file.to_string_lossy().into_owned(),
                tags: vec![FileTag {
                    name: "line\nbreak".into(),
                    color: 1,
                }],
            }],
            true,
        )
        .unwrap_err();
        assert_eq!(error, "invalid-tag-name");
        fs::remove_dir_all(root).unwrap();
    }
}
