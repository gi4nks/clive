//! Read-only `.zip` archive support (feature: browse-zip-archives).
//! Entries are exposed with archive-relative names; the frontend composes
//! `archive.zip!/inner` pseudo-paths. Extraction is guarded against
//! zip-slip (traversal/absolute members) and silently skips symlink members.

use std::fs;
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use super::filesystem::preview::base64_encode;

/// Max entries listed before truncating (UI shows a "extract to browse" hint).
const LIST_CAP: usize = 10_000;
/// Max bytes `zip_read` will hand to the preview panel.
const READ_CAP: u64 = 16 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipEntry {
    /// Archive-relative path with '/' separators ("" never happens).
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipListing {
    pub entries: Vec<ZipEntry>,
    pub truncated: bool,
}

fn open_archive(path: &str) -> Result<zip::ZipArchive<fs::File>, String> {
    let file = fs::File::open(path).map_err(|e| format!("cannot open '{path}': {e}"))?;
    zip::ZipArchive::new(file).map_err(|_| "corrupt".to_string())
}

fn modified_epoch(f: &zip::read::ZipFile) -> u64 {
    f.last_modified()
        .and_then(|dt| time::OffsetDateTime::try_from(dt).ok())
        .map(|t| t.unix_timestamp().max(0) as u64)
        .unwrap_or(0)
}

/// Tauri command: list all members of a `.zip` (archive-relative names).
#[tauri::command]
pub fn zip_list(path: String) -> Result<ZipListing, String> {
    let mut ar = open_archive(&path)?;
    let total = ar.len();
    let cap = total.min(LIST_CAP);
    let mut entries = Vec::with_capacity(cap);
    for i in 0..cap {
        let f = ar.by_index(i).map_err(|_| "corrupt".to_string())?;
        if f.encrypted() {
            return Err("encrypted".to_string());
        }
        entries.push(ZipEntry {
            name: f.name().to_string(),
            is_dir: f.is_dir(),
            size: f.size(),
            modified: modified_epoch(&f),
        });
    }
    Ok(ZipListing {
        entries,
        truncated: total > LIST_CAP,
    })
}

/// Tauri command: read one member (base64) for the preview panel, size-capped.
#[tauri::command]
pub fn zip_read(path: String, inner: String) -> Result<String, String> {
    let mut ar = open_archive(&path)?;
    let mut f = ar
        .by_name(&inner)
        .map_err(|_| format!("not-found:{inner}"))?;
    if f.is_dir() {
        return Err(format!("not-found:{inner}"));
    }
    if f.encrypted() {
        return Err("encrypted".to_string());
    }
    if f.size() > READ_CAP {
        return Err(format!("too-large:{}", f.size()));
    }
    let mut buf = Vec::with_capacity(f.size().min(READ_CAP) as usize);
    f.read_to_end(&mut buf).map_err(|_| "corrupt".to_string())?;
    Ok(base64_encode(&buf))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractReport {
    pub extracted: usize,
    /// Members not written (symlink/unsafe), with the member name.
    pub skipped: Vec<String>,
}

/// Sanitize an archive member name to a relative path under `dest`.
/// Returns None for absolute or traversal members (zip-slip).
fn safe_join(dest: &Path, name: &str) -> Option<PathBuf> {
    let rel = Path::new(name);
    let mut out = dest.to_path_buf();
    for c in rel.components() {
        match c {
            Component::Normal(seg) => out.push(seg),
            Component::CurDir => {}
            // ParentDir, RootDir, PrefixDir on a "relative" member = zip-slip.
            _ => return None,
        }
    }
    if out == dest.to_path_buf() || name.is_empty() {
        return None;
    }
    out.starts_with(dest).then_some(out)
}

/// Tauri command: extract all (or the named subset of) members into `dest`.
/// Symlink members are skipped and reported; traversal members error out.
#[tauri::command]
pub fn zip_extract(
    path: String,
    dest: String,
    entries: Option<Vec<String>>,
) -> Result<ExtractReport, String> {
    let dest = PathBuf::from(dest.trim());
    fs::create_dir_all(&dest).map_err(|e| format!("cannot create '{dest:?}': {e}"))?;
    let dest = dest.canonicalize().map_err(|e| e.to_string())?;
    let mut ar = open_archive(&path)?;
    let wanted: Option<Vec<&str>> = entries
        .as_deref()
        .map(|v| v.iter().map(String::as_str).collect());
    let mut report = ExtractReport {
        extracted: 0,
        skipped: Vec::new(),
    };
    for i in 0..ar.len() {
        let mut f = ar.by_index(i).map_err(|_| "corrupt".to_string())?;
        if let Some(w) = &wanted {
            if !w.iter().any(|n| *n == f.name()) {
                continue;
            }
        }
        if f.is_dir() {
            if let Some(p) = safe_join(&dest, f.name()) {
                let _ = fs::create_dir_all(p);
            }
            continue;
        }
        if f.is_symlink() || f.encrypted() {
            report.skipped.push(f.name().to_string());
            continue;
        }
        let Some(target) = safe_join(&dest, f.name()) else {
            return Err(format!("zip-slip:{}", f.name()));
        };
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&target).map_err(|e| e.to_string())?;
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = f.read(&mut buf).map_err(|_| "corrupt".to_string())?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        }
        let _ = fs::set_permissions(&target, fs::Permissions::from_mode(0o644));
        report.extracted += 1;
    }
    if let Some(w) = wanted {
        if report.extracted + report.skipped.len() == 0 && !w.is_empty() {
            return Err("not-found".to_string());
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use zip::write::SimpleFileOptions;

    /// Build an in-memory zip from (name, bytes, is_dir) members.
    fn make_zip(items: &[(&str, &[u8], bool)]) -> Vec<u8> {
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let opts =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, data, dir) in items {
            if *dir {
                w.add_directory(format!("{name}/"), opts).unwrap();
            } else {
                w.start_file(*name, opts).unwrap();
                use std::io::Write;
                w.write_all(data).unwrap();
            }
        }
        w.finish().unwrap().into_inner()
    }

    fn tmp(name: &str, bytes: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("clive-zip-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn lists_members_with_flags() {
        let p = tmp(
            "list.zip",
            &make_zip(&[("a.txt", b"hello", false), ("docs/", b"", true)]),
        );
        let l = zip_list(p.to_string_lossy().into_owned()).unwrap();
        assert_eq!(l.entries.len(), 2);
        assert!(l.entries.iter().any(|e| e.name == "a.txt" && !e.is_dir));
        assert!(l.entries.iter().any(|e| e.is_dir));
        assert!(!l.truncated);
    }

    #[test]
    fn reads_member_and_errors() {
        let p = tmp(
            "read.zip",
            &make_zip(&[("in/x.txt", b"data".as_slice(), false)]),
        );
        let s = p.to_string_lossy().into_owned();
        let got = zip_read(s.clone(), "in/x.txt".into()).unwrap();
        assert_eq!(base64_encode(b"data"), got);
        assert!(zip_read(s.clone(), "nope".into())
            .unwrap_err()
            .starts_with("not-found"));
        assert!(zip_read(s.clone(), "in".into()).is_err()); // dir => not-found-ish
    }

    #[test]
    fn extract_happy_and_slip() {
        let good = tmp("ok.zip", &make_zip(&[("a/b.txt", b"hi".as_slice(), false)]));
        let out = std::env::temp_dir().join(format!("clive-ex-{}", std::process::id()));
        let r = zip_extract(
            good.to_string_lossy().into_owned(),
            out.to_string_lossy().into_owned(),
            None,
        )
        .unwrap();
        assert_eq!(r.extracted, 1);
        assert!(out.join("a/b.txt").exists());

        let slip = tmp(
            "slip.zip",
            &make_zip(&[("../evil.txt", b"x".as_slice(), false)]),
        );
        let err = zip_extract(
            slip.to_string_lossy().into_owned(),
            out.to_string_lossy().into_owned(),
            None,
        )
        .unwrap_err();
        assert!(err.starts_with("zip-slip"), "{err}");
        assert!(!std::env::temp_dir().join("evil.txt").exists());
    }

    #[test]
    fn rejects_missing_and_corrupt_archives() {
        assert!(open_archive("/tmp/clive-missing-archive.zip")
            .unwrap_err()
            .contains("cannot open"));
        let corrupt = tmp("corrupt.zip", b"not a zip archive");
        assert_eq!(
            open_archive(&corrupt.to_string_lossy()).unwrap_err(),
            "corrupt"
        );
        match zip_list(corrupt.to_string_lossy().into_owned()) {
            Err(error) => assert_eq!(error, "corrupt"),
            Ok(_) => panic!("corrupt archive unexpectedly listed"),
        }
    }

    #[test]
    fn safe_join_rejects_escape_and_empty_members() {
        let root = Path::new("/tmp/clive-safe-archive");
        assert_eq!(
            safe_join(root, "folder/file.txt"),
            Some(root.join("folder/file.txt"))
        );
        assert_eq!(
            safe_join(root, "folder/./file.txt"),
            Some(root.join("folder/file.txt"))
        );
        assert!(safe_join(root, "../outside").is_none());
        assert!(safe_join(root, "/absolute").is_none());
        assert!(safe_join(root, "").is_none());
    }

    #[test]
    fn extraction_can_select_members_and_reports_absent_selection() {
        let p = tmp(
            "subset.zip",
            &make_zip(&[
                ("docs/", b"", true),
                ("docs/a.txt", b"a", false),
                ("b.txt", b"b", false),
            ]),
        );
        let dest = std::env::temp_dir().join(format!("clive-ex-subset-{}", std::process::id()));
        let result = zip_extract(
            p.to_string_lossy().into_owned(),
            dest.to_string_lossy().into_owned(),
            Some(vec!["docs/a.txt".into()]),
        )
        .unwrap();
        assert_eq!(result.extracted, 1);
        assert!(dest.join("docs/a.txt").exists());
        assert!(!dest.join("b.txt").exists());
        let missing = zip_extract(
            p.to_string_lossy().into_owned(),
            dest.to_string_lossy().into_owned(),
            Some(vec!["absent".into()]),
        )
        .unwrap_err();
        assert_eq!(missing, "not-found");
    }

    #[test]
    fn extraction_skips_symlink_members() {
        let path = std::env::temp_dir().join(format!("clive-zip-link-{}.zip", std::process::id()));
        let file = fs::File::create(&path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        writer
            .add_symlink("link", "../outside", SimpleFileOptions::default())
            .unwrap();
        writer.finish().unwrap();

        let dest = std::env::temp_dir().join(format!("clive-zip-link-out-{}", std::process::id()));
        let result = zip_extract(
            path.to_string_lossy().into_owned(),
            dest.to_string_lossy().into_owned(),
            None,
        )
        .unwrap();
        assert_eq!(result.extracted, 0);
        assert_eq!(result.skipped, ["link"]);
        assert!(!dest.join("link").exists());
    }
}
