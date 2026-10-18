use super::path_safety::normalize;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

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
    if status.success() {
        Ok(())
    } else {
        Err("macOS could not open the SMB endpoint".to_string())
    }
}

pub(crate) fn validate_smb_endpoint(endpoint: &str) -> Result<(), String> {
    if !endpoint.starts_with("smb://")
        || endpoint.len() <= 6
        || endpoint
            .chars()
            .any(|c| c.is_whitespace() || c.is_control())
    {
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
    let volumes = list_volumes()?;
    validate_disconnect_target(&p, &volumes)?;
    let output = std::process::Command::new("diskutil")
        .args(["unmount", p.to_string_lossy().as_ref()])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if detail.is_empty() {
            "macOS could not disconnect the volume".to_string()
        } else {
            detail
        })
    }
}

pub(crate) fn validate_volume_mount(path: &Path) -> Result<(), String> {
    if validate_eject_mount(&path.to_string_lossy()).is_err() {
        Err("Only volumes mounted directly under /Volumes can be disconnected".to_string())
    } else {
        Ok(())
    }
}

fn validate_disconnect_target(path: &Path, volumes: &[Volume]) -> Result<(), String> {
    validate_volume_mount(path)?;
    let mount = path.to_string_lossy();
    let volume = volumes
        .iter()
        .find(|volume| volume.mount_point == mount)
        .ok_or_else(|| format!("'{}' is not a mounted volume", mount))?;
    if volume.kind != "network" {
        return Err(format!("'{}' is not a network volume", volume.name));
    }
    Ok(())
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
    parse_disk_space_output(&String::from_utf8_lossy(&out.stdout))
}

fn parse_disk_space_output(stdout: &str) -> Result<DiskSpace, String> {
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
    let mount = cols[5..].join(" ").replace("\\040", " ");
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
        let Ok(blocks_kb) = cols[1].parse::<u64>() else {
            continue;
        };
        let Ok(used_kb) = cols[2].parse::<u64>() else {
            continue;
        };
        let Ok(avail_kb) = cols[3].parse::<u64>() else {
            continue;
        };
        let mount = cols[5..].join(" ").replace("\\040", " ");
        let source = cols[0];
        let (name, kind) = if mount == "/" {
            (root_name.to_string(), "internal")
        } else if let Some(rest) = mount.strip_prefix("/Volumes/") {
            if rest.is_empty() || rest.contains('/') || rest.starts_with('.') {
                continue;
            }
            let kind = if source.starts_with("//") || source.starts_with("smb://") {
                "network"
            } else {
                "external"
            };
            (rest.to_string(), kind)
        } else {
            continue;
        };
        let total = blocks_kb * 1024;
        let free = avail_kb * 1024;
        let used = if kind == "internal" {
            total.saturating_sub(free)
        } else {
            used_kb * 1024
        };
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
        (a.kind != "internal", a.name.to_lowercase())
            .cmp(&(b.kind != "internal", b.name.to_lowercase()))
    });
    out
}

/// Name of the boot volume: `/Volumes/<name>` is a symlink to `/` on macOS.
fn boot_volume_name() -> String {
    if let Ok(rd) = fs::read_dir("/Volumes") {
        for entry in rd.flatten() {
            let Ok(target) = fs::read_link(entry.path()) else {
                continue;
            };
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
    Ok(parse_volumes(
        &String::from_utf8_lossy(&out.stdout),
        &boot_volume_name(),
    ))
}

/// Mount must be a direct child of /Volumes with a printable name — no root,
/// no traversal, no hidden entries, no nested submounts.
pub(crate) fn validate_eject_mount(mount: &str) -> Result<PathBuf, String> {
    let m = mount.trim();
    let p = PathBuf::from(m);
    let comps: Vec<_> = p.components().collect();
    if comps.len() != 3 {
        return Err(format!("invalid mount '{m}'"));
    }
    if comps[0] != std::path::Component::RootDir
        || comps[1] != std::path::Component::Normal("Volumes".as_ref())
    {
        return Err(format!("invalid mount '{m}'"));
    }
    let name = match comps[2] {
        std::path::Component::Normal(n) => n.to_string_lossy().into_owned(),
        _ => return Err(format!("invalid mount '{m}'")),
    };
    if name.is_empty()
        || name.starts_with('.')
        || name == ".."
        || name.chars().any(char::is_control)
    {
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
    let action = if vol.kind == "network" {
        "unmount"
    } else {
        "eject"
    };
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
        assert_eq!(
            mounts,
            [
                "/",
                "/Volumes/Clive",
                "/Volumes/downloads",
                "/Volumes/USB DISK"
            ]
        );
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
        assert!(v
            .iter()
            .all(|x| x.name != "sub" && x.name != "Data" && x.name != "home"));
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
        assert!(validate_volume_mount(Path::new("/Volumes/USB DISK")).is_ok());
        assert!(validate_volume_mount(Path::new("/Volumes/USB/nested")).is_err());
        assert!(validate_volume_mount(Path::new("/Volumes")).is_err());
        assert!(validate_eject_mount("/Volumes/line\nbreak").is_err());
        assert!(validate_eject_mount("/Volumes/backup..archive").is_ok());
    }

    #[test]
    fn disconnect_only_accepts_a_mounted_network_volume() {
        let volumes = vec![
            Volume {
                name: "NAS Dati 音楽".into(),
                mount_point: "/Volumes/NAS Dati 音楽".into(),
                device: "//nas/share".into(),
                total_bytes: 1,
                used_bytes: 1,
                free_bytes: 0,
                kind: "network".into(),
                ejectable: false,
            },
            Volume {
                name: "Backup".into(),
                mount_point: "/Volumes/Backup".into(),
                device: "/dev/disk5s1".into(),
                total_bytes: 1,
                used_bytes: 1,
                free_bytes: 0,
                kind: "external".into(),
                ejectable: true,
            },
        ];

        assert!(validate_disconnect_target(Path::new("/Volumes/NAS Dati 音楽"), &volumes).is_ok());
        assert!(validate_disconnect_target(Path::new("/Volumes/Backup"), &volumes).is_err());
        assert!(validate_disconnect_target(Path::new("/Volumes/Macintosh HD"), &volumes).is_err());
        assert!(validate_disconnect_target(Path::new("/Volumes/unmounted"), &volumes).is_err());
        assert!(validate_disconnect_target(Path::new("/Volumes/.hidden"), &volumes).is_err());
    }

    #[test]
    fn malformed_df_rows_are_ignored_without_panicking() {
        let rows = "Filesystem 1024-blocks Used Available Capacity Mounted on\nshort row\n/dev/a nope 2 3 4% /Volumes/bad-size\n/dev/b 10 nope 3 4% /Volumes/bad-used\n/dev/c 10 2 nope 4% /Volumes/bad-free\n/dev/d 10 2 3 4% /tmp\n/dev/e 10 2 3 4% /Volumes/nested/path\n/dev/f 10 2 3 4% /Volumes/.hidden\n/dev/g 10 2 3 4% /Volumes/";
        assert!(parse_volumes(rows, "Disk").is_empty());
    }

    #[test]
    fn parses_unicode_volume_names_without_loss() {
        let rows = "Filesystem 1024-blocks Used Available Capacity Mounted on\n//nas/share 100 20 80 20% /Volumes/Données 音楽";
        let volumes = parse_volumes(rows, "Macintosh HD");
        assert_eq!(volumes.len(), 1);
        assert_eq!(volumes[0].name, "Données 音楽");
        assert_eq!(volumes[0].mount_point, "/Volumes/Données 音楽");
    }

    #[test]
    fn smb_endpoint_validation_requires_clean_smb_urls() {
        assert!(validate_smb_endpoint("smb://server/share").is_ok());
        assert!(validate_smb_endpoint(" http://server/share ").is_err());
        assert!(validate_smb_endpoint("smb://").is_err());
        assert!(validate_smb_endpoint("smb://server/my share").is_err());
        assert!(validate_smb_endpoint("smb://server/\nshare").is_err());
    }

    #[test]
    fn disk_space_reads_real_filesystem_usage() {
        let space = disk_space("/".to_string()).unwrap();
        assert!(space.total_bytes > 0);
        assert!(space.free_bytes <= space.total_bytes);
        assert!(space.used_bytes + space.free_bytes <= space.total_bytes);
        assert_eq!(space.volume_name, "/");
    }

    #[test]
    fn parses_disk_space_output_and_unescapes_mount_names() {
        let output = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk5s1 100 30 70 30% /Volumes/USB\\040DISK";
        let space = parse_disk_space_output(output).unwrap();
        assert_eq!(space.total_bytes, 100 * 1024);
        assert_eq!(space.used_bytes, 30 * 1024);
        assert_eq!(space.free_bytes, 70 * 1024);
        assert_eq!(space.volume_name, "/Volumes/USB DISK");
    }

    #[test]
    fn rejects_malformed_disk_space_output_with_contextual_errors() {
        assert_eq!(
            parse_disk_space_output("Filesystem blocks used available").unwrap_err(),
            "df: no data",
        );
        assert_eq!(
            parse_disk_space_output(
                "Filesystem blocks used available capacity mounted\n/dev/a 1 2"
            )
            .unwrap_err(),
            "df: unexpected output",
        );
        assert_eq!(
            parse_disk_space_output(
                "Filesystem blocks used available capacity mounted\n/dev/a bad 2 3 4% /"
            )
            .unwrap_err(),
            "df: bad size",
        );
        assert_eq!(
            parse_disk_space_output(
                "Filesystem blocks used available capacity mounted\n/dev/a 1 bad 3 4% /"
            )
            .unwrap_err(),
            "df: bad used",
        );
        assert_eq!(
            parse_disk_space_output(
                "Filesystem blocks used available capacity mounted\n/dev/a 1 2 bad 4% /"
            )
            .unwrap_err(),
            "df: bad avail",
        );
    }

    #[test]
    fn list_volumes_reads_and_sorts_real_mounts() {
        let volumes = list_volumes().unwrap();
        assert!(!volumes.is_empty());
        assert_eq!(volumes[0].kind, "internal");
        assert_eq!(volumes[0].mount_point, "/");
    }
}
