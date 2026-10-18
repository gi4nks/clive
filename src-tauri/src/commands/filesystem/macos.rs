#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    std::env::var_os("HOME")
        .map(|h| h.to_string_lossy().into_owned())
        .ok_or_else(|| "HOME not set".to_string())
}

#[cfg(test)]
mod tests {
    use super::home_dir;

    #[test]
    fn returns_the_configured_home_directory() {
        let home = std::env::var("HOME").unwrap();
        assert_eq!(home_dir().unwrap(), home);
    }
}
