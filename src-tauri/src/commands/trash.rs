use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::commands::filesystem::path_safety::{is_protected, normalize, protected_err};
use crate::commands::filesystem::transfers::move_path;

/// A single trashed item tracked by clive's own recycle bin.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    #[serde(default)]
    pub mount_identity: Option<String>,
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

#[allow(dead_code)]
static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Serializes every test that mutates process-global trash env vars, shared
/// across command modules (trash + plan) so parallel threads can't leak.
#[cfg(test)]
pub(crate) static TRASH_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Directory where trashed FILES live so they appear in the macOS (Dock) Trash:
/// `~/.Trash` (overridable via `CLIVE_TRASH_DIR`, used by tests).
pub(crate) fn trash_slot_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CLIVE_TRASH_DIR") {
        return PathBuf::from(dir);
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"));
    home.join(".Trash")
}

/// Journal of clive-tracked items. Kept OUTSIDE `~/.Trash` so it never pollutes
/// the real trash. `~/.clive/trash/journal.json` (overridable via
/// `CLIVE_TRASH_JOURNAL`, used by tests).
fn journal_path() -> PathBuf {
    if let Some(p) = std::env::var_os("CLIVE_TRASH_JOURNAL") {
        return PathBuf::from(p);
    }
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"));
    home.join(".clive").join("trash").join("journal.json")
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
#[allow(dead_code)]
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

/// A unique destination name inside `dir`, macOS-style: `name.ext`, `name 2.ext`, …
pub fn unique_in_dir(dir: &Path, desired_name: &str, is_dir: bool) -> String {
    if !dir.join(desired_name).exists() {
        return desired_name.to_string();
    }
    let (stem, ext) = split_name(desired_name, is_dir);
    let mut i = 2;
    loop {
        let cand = format!("{stem} {i}{ext}");
        if !dir.join(&cand).exists() {
            return cand;
        }
        i += 1;
    }
}

/// Resolve where a restored item should land, never clobbering an existing path.
/// `exists` injects the filesystem check so it can be unit-tested.
pub fn restore_target(original: &Path, exists: impl Fn(&Path) -> bool) -> PathBuf {
    if !exists(original) {
        return original.to_path_buf();
    }
    let parent = original.parent().unwrap_or_else(|| Path::new("/"));
    let file_name = original
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "item".to_string());
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
    let root = trash_slot_dir();
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let desired = src
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "item".to_string());
    let id = unique_in_dir(&root, &desired, meta.is_dir());
    let slot = root.join(&id);
    let mount_identity = crate::commands::filesystem::path_safety::mount_identity(&src)?;

    let item = TrashItem {
        mount_identity,
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
    move_to_trash_and_record(
        &src,
        &slot,
        item,
        &jpath,
        |from, to| move_path(from, to).map_err(|e| e.to_string()),
        read_journal,
        write_journal,
    )
}

/// List trash items, dropping records whose slot file no longer exists.
#[tauri::command]
pub fn trash_list() -> Vec<TrashItem> {
    let jpath = journal_path();
    let raw = read_journal(&jpath);
    let root = trash_slot_dir();
    let mut items: Vec<TrashItem> = raw
        .iter()
        .filter(|i| root.join(&i.id).exists())
        .cloned()
        .collect();
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
    let slot = trash_slot_dir().join(&item.id);
    if !slot.exists() {
        items.remove(idx);
        write_journal(&jpath, &items)?;
        return Err("Item is no longer in the trash".to_string());
    }
    let original = PathBuf::from(&item.original_path);
    crate::commands::filesystem::path_safety::verify_mount_identity(
        &original,
        &item.mount_identity,
    )?;
    crate::commands::filesystem::path_safety::require_mounted_path(&original)
        .map_err(|e| e.to_string())?;
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
        remove_slot(&trash_slot_dir().join(&item.id))?;
        write_journal(&jpath, &items)?;
    }
    Ok(())
}

/// Permanently delete every item and clear the journal.
#[tauri::command]
pub fn trash_empty() -> Result<(), String> {
    let jpath = journal_path();
    let items = read_journal(&jpath);
    let root = trash_slot_dir();
    empty_trash_items(&items, &root, &jpath, remove_slot, write_journal)
}

fn move_to_trash_and_record(
    src: &Path,
    slot: &Path,
    item: TrashItem,
    jpath: &Path,
    move_item: impl Fn(&Path, &Path) -> Result<(), String>,
    read_items: impl Fn(&Path) -> Vec<TrashItem>,
    write_items: impl Fn(&Path, &[TrashItem]) -> Result<(), String>,
) -> Result<(), String> {
    let mut items = read_items(jpath);
    items.push(item.clone());
    write_items(jpath, &items)?;

    if let Err(move_error) = move_item(src, slot) {
        items.pop();
        if let Err(journal_error) = write_items(jpath, &items) {
            return Err(format!(
                "Move to trash failed: {move_error}; journal cleanup failed: {journal_error}"
            ));
        }
        return Err(format!("Move to trash failed: {move_error}"));
    }

    Ok(())
}

fn empty_trash_items(
    items: &[TrashItem],
    root: &Path,
    jpath: &Path,
    mut remove: impl FnMut(&Path) -> Result<(), String>,
    write_items: impl Fn(&Path, &[TrashItem]) -> Result<(), String>,
) -> Result<(), String> {
    let mut remaining = Vec::new();
    let mut first_error = None;

    for item in items {
        match remove(&root.join(&item.id)) {
            Ok(()) => {}
            Err(error) => {
                first_error.get_or_insert(error);
                remaining.push(item.clone());
            }
        }
    }

    write_items(jpath, &remaining)?;
    if let Some(error) = first_error {
        Err(format!("Could not remove every item from trash: {error}"))
    } else {
        Ok(())
    }
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
    json!({ "trashRoot": trash_slot_dir().to_string_lossy() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    // Env-locking static lives at module level (pub(crate), brought in via
    // `use super::*`) so plan.rs tests can share it: both modules mutate
    // CLIVE_TRASH_DIR process-globally.

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
            mount_identity: None,
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
    fn trash_empty_removes_all_slots_and_clears_journal() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = std::env::temp_dir().join(format!("clive-trash-empty-{}", std::process::id()));
        let tdir = base.join("trash");
        let home = base.join("home");
        fs::create_dir_all(&home).unwrap();
        std::env::set_var("CLIVE_TRASH_DIR", &tdir);
        std::env::set_var("CLIVE_TRASH_JOURNAL", base.join("journal.json"));

        // one file + one directory trashed
        let f = home.join("a.txt");
        fs::write(&f, b"x").unwrap();
        let d = home.join("sub");
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("inner"), b"y").unwrap();

        delete_to_trash(f.to_string_lossy().into_owned(), true).unwrap();
        delete_to_trash(d.to_string_lossy().into_owned(), true).unwrap();
        assert_eq!(trash_list().len(), 2);
        let slot_count = fs::read_dir(&tdir).map(|rd| rd.count()).unwrap_or(0);
        assert!(
            slot_count >= 2,
            "expected at least 2 slots, got {slot_count}"
        );

        trash_empty().unwrap();

        assert!(
            trash_list().is_empty(),
            "journal should be empty after empty"
        );
        // every slot file/dir must be gone (journal lives outside the slot dir)
        let leftover: Vec<_> = fs::read_dir(&tdir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(leftover.is_empty(), "slots not removed: {leftover:?}");

        std::env::remove_var("CLIVE_TRASH_DIR");
        std::env::remove_var("CLIVE_TRASH_JOURNAL");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn trash_empty_keeps_failed_removal_in_journal_and_can_retry() {
        let base =
            std::env::temp_dir().join(format!("clive-trash-empty-fail-{}", std::process::id()));
        let root = base.join("trash");
        let jpath = base.join("journal.json");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("failed.txt"), b"keep for retry").unwrap();
        fs::write(root.join("removed.txt"), b"remove").unwrap();
        let items = vec![test_item("failed.txt"), test_item("removed.txt")];
        write_journal(&jpath, &items).unwrap();

        let result = empty_trash_items(
            &items,
            &root,
            &jpath,
            |path| {
                if path.file_name().unwrap() == "failed.txt" {
                    Err("simulated permission error".to_string())
                } else {
                    remove_slot(path)
                }
            },
            write_journal,
        );

        assert!(result.is_err());
        assert!(root.join("failed.txt").exists());
        assert!(!root.join("removed.txt").exists());
        assert_eq!(read_journal(&jpath), vec![test_item("failed.txt")]);

        empty_trash_items(
            &read_journal(&jpath),
            &root,
            &jpath,
            remove_slot,
            write_journal,
        )
        .unwrap();
        assert!(!root.join("failed.txt").exists());
        assert!(read_journal(&jpath).is_empty());

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn trash_empty_journal_write_failure_leaves_retryable_records() {
        let base = std::env::temp_dir().join(format!(
            "clive-trash-empty-journal-fail-{}",
            std::process::id()
        ));
        let root = base.join("trash");
        let jpath = base.join("journal.json");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("removed.txt"), b"remove me").unwrap();
        fs::write(root.join("remaining.txt"), b"keep for retry").unwrap();
        let items = vec![test_item("removed.txt"), test_item("remaining.txt")];
        write_journal(&jpath, &items).unwrap();

        let result = empty_trash_items(
            &items,
            &root,
            &jpath,
            |path| {
                if path.file_name().unwrap() == "remaining.txt" {
                    Err("simulated permission error".to_string())
                } else {
                    remove_slot(path)
                }
            },
            |_, _| Err("simulated journal persistence failure".to_string()),
        );

        assert_eq!(result.unwrap_err(), "simulated journal persistence failure");
        assert!(!root.join("removed.txt").exists());
        assert!(root.join("remaining.txt").exists());
        // The prior journal still includes the removed slot. Missing slots are
        // idempotent on retry, while the surviving item remains recoverable.
        assert_eq!(read_journal(&jpath), items);

        empty_trash_items(
            &read_journal(&jpath),
            &root,
            &jpath,
            remove_slot,
            write_journal,
        )
        .unwrap();

        assert!(!root.join("remaining.txt").exists());
        assert!(read_journal(&jpath).is_empty());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn delete_to_trash_does_not_move_item_when_journal_write_fails() {
        let base =
            std::env::temp_dir().join(format!("clive-trash-journal-fail-{}", std::process::id()));
        let src = base.join("home").join("important.txt");
        let slot = base.join("trash").join("important.txt");
        let jpath = base.join("journal.json");
        fs::create_dir_all(src.parent().unwrap()).unwrap();
        fs::create_dir_all(slot.parent().unwrap()).unwrap();
        fs::write(&src, b"preserve me").unwrap();
        let item = test_item("important.txt");

        let result = move_to_trash_and_record(
            &src,
            &slot,
            item,
            &jpath,
            |from, to| move_path(from, to).map_err(|e| e.to_string()),
            |_| Vec::new(),
            |_, _| Err("simulated journal failure".to_string()),
        );

        assert_eq!(result.unwrap_err(), "simulated journal failure");
        assert_eq!(fs::read(&src).unwrap(), b"preserve me");
        assert!(!slot.exists());
        fs::remove_dir_all(base).unwrap();
    }

    fn test_item(id: &str) -> TrashItem {
        TrashItem {
            mount_identity: None,
            id: id.to_string(),
            original_path: format!("/original/{id}"),
            deleted_at: 1,
            is_dir: false,
            size: 1,
            modified: 1,
        }
    }

    #[test]
    fn delete_restore_and_delete_forever_roundtrip() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = std::env::temp_dir().join(format!("clive-trash-rt-{}", std::process::id()));
        let tdir = base.join("trash");
        let home = base.join("home");
        fs::create_dir_all(&home).unwrap();
        std::env::set_var("CLIVE_TRASH_DIR", &tdir);
        std::env::set_var("CLIVE_TRASH_JOURNAL", base.join("journal.json"));

        let f = home.join("note.txt");
        fs::write(&f, b"hello").unwrap();

        // delete → original gone, item appears in list (id is the human basename)
        delete_to_trash(f.to_string_lossy().into_owned(), true).unwrap();
        assert!(!f.exists());
        let items = trash_list();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "note.txt");
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
        std::env::remove_var("CLIVE_TRASH_JOURNAL");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn delete_uniquifies_colliding_names_in_slot_dir() {
        let _guard = TRASH_TEST_LOCK.lock().unwrap();
        let base = std::env::temp_dir().join(format!("clive-trash-collide-{}", std::process::id()));
        let tdir = base.join("trash");
        let home = base.join("home");
        fs::create_dir_all(&tdir).unwrap();
        fs::create_dir_all(&home).unwrap();
        std::env::set_var("CLIVE_TRASH_DIR", &tdir);
        std::env::set_var("CLIVE_TRASH_JOURNAL", base.join("journal.json"));

        // pre-existing decoy already living in the slot dir
        let decoy = tdir.join("dup.txt");
        fs::write(&decoy, b"decoy").unwrap();

        let f = home.join("dup.txt");
        fs::write(&f, b"real").unwrap();
        delete_to_trash(f.to_string_lossy().into_owned(), true).unwrap();

        let items = trash_list();
        assert_eq!(items.len(), 1);
        // macOS-style collision suffix
        assert_eq!(items[0].id, "dup 2.txt");
        // the decoy is untouched; our file landed under the uniquified name
        assert_eq!(fs::read_to_string(&decoy).unwrap(), "decoy");
        assert_eq!(fs::read_to_string(tdir.join("dup 2.txt")).unwrap(), "real");

        // restoring brings it back to the original path independently of the decoy
        let restored = trash_restore(items[0].id.clone()).unwrap();
        assert_eq!(PathBuf::from(&restored), f);
        assert!(f.exists());
        assert_eq!(fs::read_to_string(&decoy).unwrap(), "decoy");

        std::env::remove_var("CLIVE_TRASH_DIR");
        std::env::remove_var("CLIVE_TRASH_JOURNAL");
        let _ = fs::remove_dir_all(&base);
    }
}
