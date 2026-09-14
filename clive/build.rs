fn main() {
    tauri_build::build();
    // Compile-time epoch so the running app can prove which backend build it is
    // (a stale/hot-reloaded frontend can't fake it). Shown in Settings.
    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    println!("cargo:rustc-env=CLIVE_BUILD_EPOCH={epoch}");
    println!("cargo:rerun-if-changed=src");
}
