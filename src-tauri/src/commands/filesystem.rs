//! Filesystem command namespace; implementations are grouped by capability.

pub(crate) mod desktop;
pub(crate) mod finder_tags;
pub(crate) mod listing;
pub(crate) mod macos;
pub(crate) mod metadata;
pub(crate) mod path_safety;
pub(crate) mod preview;
pub(crate) mod tags;
pub(crate) mod transfers;
pub(crate) mod volumes;

#[cfg(test)]
mod guard_tests {
    use crate::commands::filesystem::{
        metadata::file_info_sync,
        path_safety::{guard_move_sources, is_protected, verify_mount_identity},
        transfers::{copy_file, create_folder, move_file, rename, transfer_items},
        volumes::{validate_smb_endpoint, validate_volume_mount},
    };
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn file_info_reports_file_and_folder_metadata() {
        let root = std::env::temp_dir().join(format!("clive-file-info-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("sample.txt");
        fs::write(&file, "hello").unwrap();
        let nested = root.join("nested");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("inside.bin"), "123").unwrap();

        let file_details = file_info_sync(file.to_string_lossy().into_owned()).unwrap();
        assert_eq!(file_details.name, "sample.txt");
        assert!(!file_details.is_dir);
        assert_eq!(file_details.size, Some(5));
        assert!(file_details.created.is_some());
        assert!(file_details.child_count.is_none());

        let folder_info = file_info_sync(root.to_string_lossy().into_owned()).unwrap();
        assert!(folder_info.is_dir);
        assert_eq!(folder_info.size, Some(8));
        assert_eq!(folder_info.child_count, Some(2));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_mount_cannot_be_recreated_by_writes() {
        let path = format!("/Volumes/clive-absent-test-{}/docs", std::process::id());
        assert!(!Path::new(&path).exists());
        assert!(create_folder(path.clone(), "child".into(), false).is_err());
        assert!(!Path::new(&path).exists());
    }

    #[test]
    fn identity_mismatch_is_rejected_without_mutation() {
        let expected = Some("previous-server:1:2".to_string());
        assert!(verify_mount_identity(Path::new("/tmp"), &expected).is_err());
        assert!(verify_mount_identity(Path::new("/tmp"), &None).is_ok());
        assert!(verify_mount_identity(
            Path::new("/Volumes/clive-absent-identity-test/file"),
            &expected
        )
        .is_err());
    }

    #[test]
    fn protects_top_level_roots() {
        for p in [
            "/",
            "/Applications",
            "/Library",
            "/usr",
            "/etc",
            "/Volumes",
            "/tmp",
            "/private",
        ] {
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
        assert!(transfer_items(
            vec!["/System/Fonts".into()],
            "/".into(),
            "move".into(),
            false
        )
        .is_err());
        assert!(copy_file("/Users/me/source".into(), "/Library".into(), false).is_err());
        assert!(move_file("/Users/me/source".into(), "/Applications".into(), false).is_err());
        assert!(create_folder("/".into(), "System".into(), false).is_err());
    }
}
