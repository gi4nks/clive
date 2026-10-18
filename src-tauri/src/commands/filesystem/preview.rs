use super::path_safety::normalize;
use std::fs;

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(normalize(&path)).map_err(|e| e.to_string())
}

/// Max bytes `read_file_bytes` will transfer (previews only; bigger files are
/// meant for Quick Look / external apps).
pub const PREVIEW_MAX_BYTES: u64 = 32 * 1024 * 1024;

/// Tauri command: file content as base64 for the in-app preview panel.
/// Directories are rejected; files over `PREVIEW_MAX_BYTES` error out BEFORE
/// any read so a huge video never crosses the IPC boundary.
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<String, String> {
    let p = normalize(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("cannot read '{path}': {e}"))?;
    if meta.is_dir() {
        return Err(format!("'{path}' is a directory"));
    }
    if meta.len() > PREVIEW_MAX_BYTES {
        return Err(format!("too-large:{}", meta.len()));
    }
    let bytes = fs::read(&p).map_err(|e| format!("cannot read '{path}': {e}"))?;
    Ok(base64_encode(&bytes))
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Minimal standard-alphabet base64 (no extra deps; input is a Vec<u8>).
pub(crate) fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        out.push(B64[(n >> 18 & 63) as usize] as char);
        out.push(B64[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            B64[(n >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod preview_tests {
    use super::*;

    #[test]
    fn base64_encode_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(&[0u8, 255, 128, 64]), "AP+AQA==");
    }

    #[test]
    fn read_file_bytes_roundtrip_and_dir_reject() {
        let dir = std::env::temp_dir().join(format!("clive-prev-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("a.bin");
        std::fs::write(&f, b"hello preview").unwrap();
        let got = read_file_bytes(f.to_string_lossy().into_owned()).unwrap();
        assert_eq!(got, base64_encode(b"hello preview"));
        assert!(read_file_bytes(dir.to_string_lossy().into_owned()).is_err());
        let missing = read_file_bytes(dir.join("nope").to_string_lossy().into_owned()).unwrap_err();
        assert!(missing.contains("cannot read"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
