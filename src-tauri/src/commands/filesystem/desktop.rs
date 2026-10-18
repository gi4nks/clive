use super::path_safety::normalize;

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(&p)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("open failed".to_string())
    }
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("open")
        .arg(&p)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("open failed".to_string())
    }
}

#[tauri::command]
pub fn quick_look(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("qlmanage")
        .arg("-p")
        .arg(&p)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("preview failed".to_string())
    }
}

#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    let p = normalize(&path);
    let status = std::process::Command::new("open")
        .arg("-a")
        .arg("Terminal")
        .arg(&p)
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("could not open terminal".to_string())
    }
}
