use std::fs;
use std::path::{Path, PathBuf};

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
    "/",
    "/applications",
    "/library",
    "/system",
    "/usr",
    "/bin",
    "/sbin",
    "/private",
    "/etc",
    "/var",
    "/opt",
    "/cores",
    "/dev",
    "/home",
    "/mnt",
    "/volumes",
    "/network",
    "/automount",
    "/tmp",
    "/macos install data",
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

/// Refuse writes through a disconnected /Volumes mount, including restore
/// paths whose missing parents would otherwise be recreated on the boot disk.
pub(crate) fn require_mounted_path(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        require_mounted_path_at(path, Path::new("/Volumes"), |p| {
            fs::metadata(p).map(|meta| meta.dev())
        })?;
    }
    Ok(())
}

#[cfg(unix)]
fn require_mounted_path_at(
    path: &Path,
    volumes_root: &Path,
    device_of: impl Fn(&Path) -> std::io::Result<u64>,
) -> std::io::Result<()> {
    if let Ok(relative) = path.strip_prefix(volumes_root) {
        if let Some(std::path::Component::Normal(name)) = relative.components().next() {
            let mount = volumes_root.join(name);
            if device_of(&mount)? == device_of(volumes_root)? {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::NotConnected,
                    "Volume is not mounted",
                ));
            }
        }
    }
    Ok(())
}

/// Conservative mount identity: a remount requires a fresh operation/review.
pub(crate) fn mount_identity(path: &Path) -> Result<Option<String>, String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let Ok(relative) = path.strip_prefix("/Volumes") {
            if let Some(std::path::Component::Normal(name)) = relative.components().next() {
                require_mounted_path(path).map_err(|e| e.to_string())?;
                let meta =
                    fs::metadata(Path::new("/Volumes").join(name)).map_err(|e| e.to_string())?;
                let mount = Path::new("/Volumes").join(name);
                let output = std::process::Command::new("/sbin/mount")
                    .output()
                    .map_err(|e| e.to_string())?;
                if !output.status.success() {
                    return Err("Cannot inspect mounted volumes".into());
                }
                let table = String::from_utf8_lossy(&output.stdout);
                let source = mounted_source(&table, &mount).ok_or("Volume is not mounted")?;
                return Ok(Some(format!("{}:{}:{}", source, meta.dev(), meta.ino())));
            }
        }
    }
    Ok(None)
}

fn mounted_source<'a>(mount_table: &'a str, mount: &Path) -> Option<&'a str> {
    let marker = format!(" on {} (", mount.display());
    mount_table
        .lines()
        .find_map(|line| line.split_once(&marker).map(|(source, _)| source))
}

pub(crate) fn verify_mount_identity(path: &Path, expected: &Option<String>) -> Result<(), String> {
    if &mount_identity(path)? != expected {
        return Err(
            "Volume identity changed; reconnect the original volume and review again".into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_dir() -> PathBuf {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "clive-path-safety-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn lexical_paths_resolve_case_and_traversal() {
        assert_eq!(
            lexical_lower(Path::new("/System/../System/Library")),
            "/system/library"
        );
        assert_eq!(lexical_lower(Path::new("./A/../B")), "b");
        assert_eq!(lexical_lower(Path::new("/")), "/");
        assert!(is_protected(Path::new(
            "/Applications/../System/Volumes/Data"
        )));
        assert!(is_protected(Path::new("/uSr")));
        assert!(!is_protected(Path::new("/Users/gianluca/Projects")));
    }

    #[test]
    fn batch_guard_allows_override_and_reports_first_protected_source() {
        let sources = [PathBuf::from("/tmp/work"), PathBuf::from("/System/Library")];
        assert!(guard_move_sources(&sources, true).is_ok());
        let error = guard_move_sources(&sources, false).unwrap_err();
        assert!(error.contains("/System/Library"));
        assert!(protected_err(Path::new("/usr/bin")).contains("Protect system locations"));
        let safe_source = PathBuf::from("/Users/a");
        assert!(guard_move_sources([&safe_source], false).is_ok());
    }

    #[test]
    fn home_shortcut_is_expanded_and_missing_volume_is_rejected() {
        let home = std::env::var("HOME").unwrap();
        assert_eq!(
            normalize(" ~/Documents "),
            PathBuf::from(home).join("Documents")
        );
        assert!(
            require_mounted_path(Path::new("/Volumes/__clive_coverage_unmounted__/file")).is_err()
        );
        assert_eq!(
            mount_identity(Path::new("/Users/example/file")).unwrap(),
            None
        );
        assert!(verify_mount_identity(Path::new("/Users/example/file"), &None).is_ok());
        assert!(verify_mount_identity(
            Path::new("/Users/example/file"),
            &Some("old-volume".into())
        )
        .is_err());
        assert_eq!(normalize(" /tmp/example "), PathBuf::from("/tmp/example"));
        assert!(guard_move_sources::<_, PathBuf>([], false).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn mounted_path_check_distinguishes_mounts_from_unmounted_directories() {
        let root = temp_dir().join("Volumes");
        let mount = root.join("External Disk");
        fs::create_dir_all(&mount).unwrap();
        let child = mount.join("folder/file.txt");

        let not_mounted = require_mounted_path_at(&child, &root, |path| {
            assert!(path == mount || path == root);
            Ok(17)
        })
        .unwrap_err();
        assert_eq!(not_mounted.kind(), std::io::ErrorKind::NotConnected);

        require_mounted_path_at(
            &child,
            &root,
            |path| {
                if path == mount {
                    Ok(29)
                } else {
                    Ok(17)
                }
            },
        )
        .unwrap();

        require_mounted_path_at(Path::new("/Users/example/file"), &root, |_| {
            panic!("paths outside the volumes root need no mount check")
        })
        .unwrap();
        fs::remove_dir_all(root.parent().unwrap()).unwrap();
    }

    #[test]
    fn mounted_source_parser_matches_unicode_volume_names_and_spaces() {
        let table = "/dev/disk7s1 on /Volumes/Données 音楽 (apfs, local, nodev)\n";
        assert_eq!(
            mounted_source(table, Path::new("/Volumes/Données 音楽")),
            Some("/dev/disk7s1")
        );
        assert_eq!(mounted_source(table, Path::new("/Volumes/other")), None);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_to_protected_path_is_not_mistaken_for_a_protected_source_path() {
        use std::os::unix::fs::symlink;

        let root = temp_dir();
        let link = root.join("system-link");
        symlink("/System", &link).unwrap();

        // Path safety is lexical: moving the link moves the link itself and
        // does not traverse or mutate the protected target.
        assert!(!is_protected(&link));
        assert_eq!(fs::read_link(&link).unwrap(), PathBuf::from("/System"));
        fs::remove_file(link).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
