fn main() {
    tauri_build::build();
    // Compile-time epoch so the running app can prove which backend build it is
    // (a stale/hot-reloaded frontend can't fake it). Shown in Settings.
    let epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    println!("cargo:rustc-env=CLIVE_BUILD_EPOCH={epoch}");

    // Single source of truth for the version is tauri.conf.json; Cargo.toml and
    // the frontend package.json must match it or the build fails loudly.
    let conf = std::fs::read_to_string("tauri.conf.json").expect("tauri.conf.json not found");
    let conf_version = conf
        .split("\"version\"")
        .nth(1)
        .and_then(|s| s.split('\"').nth(1).map(str::to_string))
        .expect("version in tauri.conf.json");
    let cargo = std::fs::read_to_string("Cargo.toml").unwrap();
    let cargo_version = cargo
        .lines()
        .find_map(|l| {
            l.trim()
                .strip_prefix("version = \"")
                .and_then(|r| r.split('\"').next().map(str::to_string))
        })
        .unwrap();
    let pkg = std::fs::read_to_string("frontend/package.json").unwrap();
    let pkg_version = pkg
        .lines()
        .find_map(|l| {
            l.contains("\"version\":")
                .then(|| l.split('\"').nth(3).map(str::to_string))
                .flatten()
        })
        .unwrap();
    assert_eq!(
        conf_version, cargo_version,
        "version drift: tauri.conf.json != Cargo.toml"
    );
    assert_eq!(
        conf_version, pkg_version,
        "version drift: tauri.conf.json != package.json"
    );
    println!("cargo:rustc-env=CLIVE_VERSION={conf_version}");

    // Provenance: short git commit + branch ("unknown" outside a checkout).
    let git = |args: &[&str]| -> String {
        std::process::Command::new("git")
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "unknown".to_string())
    };
    println!(
        "cargo:rustc-env=CLIVE_GIT_COMMIT={}",
        git(&["rev-parse", "--short", "HEAD"])
    );
    println!(
        "cargo:rustc-env=CLIVE_GIT_BRANCH={}",
        git(&["rev-parse", "--abbrev-ref", "HEAD"])
    );
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=Cargo.toml");
    println!("cargo:rerun-if-changed=frontend/package.json");
    println!("cargo:rerun-if-changed=src");
}
