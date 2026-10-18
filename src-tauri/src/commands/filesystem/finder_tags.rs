use serde::Serialize;
use std::path::Path;

const FINDER_TAG_XATTR: &str = "com.apple.metadata:_kMDItemUserTags";
const XATTR_NOFOLLOW: i32 = 0x0001;

#[derive(Debug, Serialize, Clone, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileTag {
    pub name: String,
    /// Finder color index: 0 none, 1 gray, 2 green, 3 purple, 4 blue,
    /// 5 yellow, 6 red, 7 orange.
    pub color: u8,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTagsUpdate {
    pub path: String,
    pub tags: Vec<FileTag>,
}

#[cfg(target_os = "macos")]
pub(super) fn read_finder_tags(path: &Path) -> Result<Vec<FileTag>, String> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let path_c = CString::new(path.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
    let name = CString::new(FINDER_TAG_XATTR).unwrap();
    let size = unsafe {
        getxattr(
            path_c.as_ptr(),
            name.as_ptr(),
            std::ptr::null_mut(),
            0,
            0,
            XATTR_NOFOLLOW,
        )
    };
    if size < 0 {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() == Some(93) {
            return Ok(Vec::new());
        }
        return Err(err.to_string());
    }
    let mut data = vec![0u8; size as usize];
    let read = unsafe {
        getxattr(
            path_c.as_ptr(),
            name.as_ptr(),
            data.as_mut_ptr().cast(),
            data.len(),
            0,
            XATTR_NOFOLLOW,
        )
    };
    if read < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    data.truncate(read as usize);
    let values: Vec<String> = plist::from_bytes(&data).map_err(|e| e.to_string())?;
    Ok(values
        .into_iter()
        .filter_map(|value| {
            let (name, color) = value
                .rsplit_once('\n')
                .map(|(n, c)| (n, c.parse::<u8>().unwrap_or(0)))
                .unwrap_or((&value, 0));
            (!name.is_empty()).then(|| FileTag {
                name: name.to_string(),
                color: color.min(7),
            })
        })
        .collect())
}

#[cfg(not(target_os = "macos"))]
pub(super) fn read_finder_tags(_path: &Path) -> Result<Vec<FileTag>, String> {
    Ok(Vec::new())
}

#[cfg(target_os = "macos")]
pub(super) fn write_finder_tags(path: &Path, tags: &[FileTag]) -> Result<(), String> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let path_c = CString::new(path.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
    let name = CString::new(FINDER_TAG_XATTR).unwrap();
    if tags.is_empty() {
        let result = unsafe { removexattr(path_c.as_ptr(), name.as_ptr(), XATTR_NOFOLLOW) };
        if result < 0 {
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() != Some(93) {
                return Err(err.to_string());
            }
        }
        return Ok(());
    }
    let values: Vec<String> = tags
        .iter()
        .map(|tag| format!("{}\n{}", tag.name.trim(), tag.color.min(7)))
        .collect();
    let mut data = Vec::new();
    plist::to_writer_binary(&mut data, &values).map_err(|e| e.to_string())?;
    let result = unsafe {
        setxattr(
            path_c.as_ptr(),
            name.as_ptr(),
            data.as_ptr().cast(),
            data.len(),
            0,
            XATTR_NOFOLLOW,
        )
    };
    if result < 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(super) fn write_finder_tags(_path: &Path, _tags: &[FileTag]) -> Result<(), String> {
    Err("Finder tags are only supported on macOS".into())
}

#[cfg(target_os = "macos")]
#[link(name = "c")]
extern "C" {
    fn getxattr(
        path: *const std::ffi::c_char,
        name: *const std::ffi::c_char,
        value: *mut std::ffi::c_void,
        size: usize,
        position: u32,
        options: i32,
    ) -> isize;
    fn setxattr(
        path: *const std::ffi::c_char,
        name: *const std::ffi::c_char,
        value: *const std::ffi::c_void,
        size: usize,
        position: u32,
        options: i32,
    ) -> i32;
    fn removexattr(
        path: *const std::ffi::c_char,
        name: *const std::ffi::c_char,
        options: i32,
    ) -> i32;
}

#[cfg(test)]
mod tests {
    use super::{read_finder_tags, write_finder_tags, FileTag};
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn temp_file() -> (PathBuf, PathBuf) {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!(
            "clive-finder-tags-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("tagged.txt");
        fs::write(&file, "content").unwrap();
        (root, file)
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn finder_tags_roundtrip_and_removal_are_supported() {
        let (root, file) = temp_file();
        assert!(read_finder_tags(&file).unwrap().is_empty());
        let tags = vec![FileTag {
            name: " Review ".into(),
            color: 9,
        }];
        write_finder_tags(&file, &tags).unwrap();
        assert_eq!(
            read_finder_tags(&file).unwrap(),
            vec![FileTag {
                name: "Review".into(),
                color: 7
            }]
        );
        write_finder_tags(&file, &[]).unwrap();
        assert!(read_finder_tags(&file).unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn finder_tag_writes_explain_platform_limit() {
        let (root, file) = temp_file();
        let error = write_finder_tags(&file, &[]).unwrap_err();
        assert!(error.contains("only supported on macOS"));
        assert!(read_finder_tags(&file).unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
