use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::commands::filesystem::{is_protected, move_path, normalize, protected_err};

/// A single trashed item tracked by clive's own recycle bin.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    pub id: String,
    pub original_path: String,
    pub deleted_at: u64,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Root of clive's recycle bin: `~/.clive/trash` (overridable via `CLIVE_TRASH_DIR`, used by tests).
fn trash_root() -> PathBuf {
    if let Some(dir) = std::env::var_os("CLIVE_TRASH_DIR") {
        return PathBuf::from(dir);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
    home.join(".clive").join("trash")
}

fn journal_path() -> PathBuf {
    trash_root().join("journal.json")
}

/// Read the journal (empty if missing/corrupt).
fn read_journal(jpath: &Path) -> Vec<TrashItem> {
    fs::read_to_string(jpath)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<TrashItem>>(&s).ok())
        .unwrap_or_default()
}

/// Write the journal atomically with restrictive permissions.
fn write_journal(jpath: &Path, items: &[TrashItem]) -> Result<(), String> {
    if let Some(parent) = jpath.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
    let tmp = jpath.with_extension("json.tmp");
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&tmp, jpath).map_err(|e| e.to_string())?;
    Ok(())
}

/// A unique opaque slot filename; avoids collisions with existing slots.
fn slot_name(dir: &Path) -> String {
    loop {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let id = format!("{:x}{:x}", nanos, n);
        if !dir.join(&id).exists() {
            return id;
        }
    }
}

/// Split a name into (stem, extension-with-dot). Dirs treat whole name as stem.
fn split_name(name: &str, is_dir: bool) -> (String, String) {
    if is_dir {
        return (name.to_string(), String::new());
    }
    match name.rfind('.') {
        Some(dot) if dot > 0 => (name[..dot].to_string(), name[dot..].to_string()),
        _ => (name.to_string(), String::new()),
    }
}

/// Resolve where a restored item should land, never clobbering an existing path.
/// `exists` injects the filesystem check so it can be unit-tested.
pub fn restore_target(original: &Path, exists: impl Fn(&Path) -> bool) -> PathBuf {
    if !exists(original) {
        return original.to_path_buf();
    }
    let parent = original.parent().unwrap_or_else(|| Path::new("/"));
    let file_name = original.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "item".to_string());
    let (stem, ext) = split_name(&file_name, false);
    let mut i = 1;
    loop {
        let cand = if i == 1 {
            format!("{stem} (restored){ext}")
        } else {
            format!("{stem} (restored {i}){ext}")
        };
        let path = parent.join(cand);
        if !exists(&path) {
            return path;
        }
        i += 1;
    }
}

/// Move an item into clive's recycle bin and record it in the journal.
/// (Replaces the old `trash::delete`; `api.ts` keeps calling `delete_to_trash`.)
#[tauri::command]
pub fn delete_to_trash(path: String, allow_system: bool) -> Result<(), String> {
    let src = normalize(&path);
    if !allow_system && is_protected(&src) {
        return Err(protected_err(&src));
    }
    let meta = fs::metadata(&src).map_err(|e| format!("cannot access {}: {e}", src.display()))?;
    let root = trash_root();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let id = slot_name(&root);
    let slot = root.join(&id);
    move_path(&src, &slot).map_err(|e| format!("Move to trash failed: {e}"))?;

    let item = TrashItem {
        id,
        original_path: src.to_string_lossy().into_owned(),
        deleted_at: now_secs(),
        is_dir: meta.is_dir(),
        size: if meta.is_file() { meta.len() } else { 0 },
        modified: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0),
    };
    let jpath = journal_path();
    let mut items = read_journal(&jpath);
    items.push(item);
    write_journal(&jpath, &items)
}

/// List trash items, dropping records whose slot file no longer exists.
#[tauri::command]
pub fn trash_list() -> Vec<TrashItem> {
    let jpath = journal_path();
    let raw = read_journal(&jpath);
    let root = trash_root();
    let mut items: Vec<TrashItem> = raw.iter().filter(|i| root.join(&i.id).exists()).cloned().collect();
    // Persist the pruned view so stale entries don't linger.
    if items.len() != raw.len() {
        let _ = write_journal(&jpath, &items);
    }
    items.sort_by_key(|i| std::cmp::Reverse(i.deleted_at));
    items
}

/// Restore an item to its original location (recreating parents; never clobbering).
#[tauri::command]
pub fn trash_restore(id: String) -> Result<String, String> {
    let jpath = journal_path();
    let mut items = read_journal(&jpath);
    let idx = items.iter().position(|i| i.id == id).ok_or("not found")?;
    let item = items[idx].clone();
    let slot = trash_root().join(&item.id);
    if !slot.exists() {
        items.remove(idx);
        write_journal(&jpath, &items)?;
        return Err("Item is no longer in the trash".to_string());
    }
    let original = PathBuf::from(&item.original_path);
    if let Some(parent) = original.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let target = restore_target(&original, |p| p.exists());
    move_path(&slot, &target).map_err(|e| format!("Restore failed: {e}"))?;
    items.remove(idx);
    write_journal(&jpath, &items)?;
    Ok(target.to_string_lossy().into_owned())
}

/// Permanently delete a single trash item.
#[tauri::command]
pub fn trash_delete_forever(id: String) -> Result<(), String> {
    let jpath = journal_path();
    let mut items = read_journal(&jpath);
    if let Some(idx) = items.iter().position(|i| i.id == id) {
        let item = items.remove(idx);
        remove_slot(&trash_root().join(&item.id))?;
        write_journal(&jpath, &items)?;
    }
    Ok(())
}

/// Permanently delete every item and clear the journal.
#[tauri::command]
pub fn trash_empty() -> Result<(), String> {
    let jpath = journal_path();
    let items = read_journal(&jpath);
    let root = trash_root();
    for item in &items {
        let _ = remove_slot(&root.join(&item.id));
    }
    write_journal(&jpath, &[])?;
    Ok(())
}

fn remove_slot(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// Debug view of the trash dir (unused by UI, handy for troubleshooting).
#[allow(dead_code)]
pub fn trash_root_json() -> serde_json::Value {
    json!({ "trashRoot": trash_root().to_string_lossy() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn restore_target_uses_original_when_free() {
        let p = Path::new("/a/b/file.txt");
        assert_eq!(restore_target(p, |_| false), p.to_path_buf());
    }

    #[test]
    fn restore_target_appends_suffix_when_taken() {
        let taken: HashSet<String> = [
            "/a/b/file.txt".to_string(),
            "/a/b/file (restored).txt".to_string(),
        ]
        .into_iter()
        .collect();
        let exists = |p: &Path| taken.contains(&p.to_string_lossy().into_owned());
        assert_eq!(
            restore_target(Path::new("/a/b/file.txt"), exists),
            PathBuf::from("/a/b/file (restored 2).txt")
        );
    }

    #[test]
    fn restore_target_dir_without_ext() {
        let taken: HashSet<String> = ["/a/b".to_string(), "/a/b (restored)".to_string()]
            .into_iter()
            .collect();
        let exists = |p: &Path| taken.contains(&p.to_string_lossy().into_owned());
        // dir named "b" (no dot) → stem "b"
        assert_eq!(
            restore_target(Path::new("/a/b"), exists),
            PathBuf::from("/a/b (restored 2)")
        );
    }

    #[test]
    fn journal_roundtrips_atomically() {
        let dir = std::env::temp_dir().join(format!("clive-j-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let jpath = dir.join("journal.json");
        let items = vec![TrashItem {
            id: "x1".into(),
            original_path: "/orig/x.txt".into(),
            deleted_at: 10,
            is_dir: false,
            size: 5,
            modified: 9,
        }];
        write_journal(&jpath, &items).unwrap();
        assert_eq!(read_journal(&jpath), items);
        assert!(read_journal(Path::new("/nonexistent/journal.json")).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn slot_names_are_unique() {
        let dir = std::env::temp_dir();
        assert_ne!(slot_name(&dir), slot_name(&dir));
    }

    #[test]
    fn delete_restore_and_delete_forever_roundtrip() {
        let base = std::env::temp_dir().join(format!("clive-trash-rt-{}", std::process::id()));
        let tdir = base.join("trash");
        let home = base.join("home");
        fs::create_dir_all(&home).unwrap();
        std::env::set_var("CLIVE_TRASH_DIR", &tdir);

        let f = home.join("note.txt");
        fs::write(&f, b"hello").unwrap();

        // delete → original gone, item appears in list
        delete_to_trash(f.to_string_lossy().into_owned(), true).unwrap();
        assert!(!f.exists());
        let items = trash_list();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].original_path, f.to_string_lossy());

        // restore → back at original path, list empty
        let restored = trash_restore(items[0].id.clone()).unwrap();
        assert_eq!(PathBuf::from(&restored), f);
        assert!(f.exists());
        assert!(fs::read_to_string(&f).unwrap() == "hello");
        assert!(trash_list().is_empty());

        // delete again, then delete-forever → slot removed, original stays gone
        delete_to_trash(f.to_string_lossy().into_owned(), true).unwrap();
        let items = trash_list();
        assert_eq!(items.len(), 1);
        trash_delete_forever(items[0].id.clone()).unwrap();
        assert!(trash_list().is_empty());
        assert!(!f.exists());

        std::env::remove_var("CLIVE_TRASH_DIR");
        let _ = fs::remove_dir_all(&base);
    }
}
