#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands {
    pub mod archives;
    pub mod clipboard;
    pub mod filesystem;
    pub mod plan;
    pub mod trash;
}

mod gateway;

use commands::clipboard::ClipboardState;
use gateway::GatewayHandle;

/// Build info reported by the running backend (proves how fresh the Rust binary is).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildInfo {
    version: String,
    build_epoch: u64,
    commit: String,
    branch: String,
}

#[tauri::command]
fn build_info() -> BuildInfo {
    BuildInfo {
        version: env!("CLIVE_VERSION").to_string(),
        build_epoch: env!("CLIVE_BUILD_EPOCH").parse::<u64>().unwrap_or(0),
        commit: env!("CLIVE_GIT_COMMIT").to_string(),
        branch: env!("CLIVE_GIT_BRANCH").to_string(),
    }
}

fn main() {
    // Load provider vars (CLIVE_*/API keys) from a `.env` (searches upward;
    // never overrides vars already in the shell). Enables launching outside dev.
    let _ = dotenvy::dotenv();

    let gw = GatewayHandle::new();
    let gw_for_setup = gw.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(ClipboardState::new())
        .manage(gw)
        .setup(move |_app| {
            let handle = gw_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = gateway::start(handle.clone()).await {
                    eprintln!("AI gateway failed to start: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::listing::list_dir,
            commands::filesystem::macos::home_dir,
            commands::filesystem::metadata::file_info,
            commands::filesystem::tags::get_file_tags,
            commands::filesystem::tags::set_files_tags,
            commands::filesystem::transfers::copy_file,
            commands::filesystem::transfers::move_file,
            commands::filesystem::transfers::rename,
            commands::trash::delete_to_trash,
            commands::trash::trash_list,
            commands::trash::trash_restore,
            commands::trash::trash_delete_forever,
            commands::trash::trash_empty,
            commands::filesystem::transfers::create_folder,
            commands::filesystem::preview::read_text_file,
            commands::filesystem::desktop::reveal_in_finder,
            commands::filesystem::desktop::open_path,
            commands::filesystem::volumes::connect_smb,
            commands::filesystem::volumes::disconnect_volume,
            commands::filesystem::desktop::quick_look,
            commands::filesystem::volumes::disk_space,
            commands::filesystem::preview::read_file_bytes,
            commands::archives::zip_list,
            commands::archives::zip_read,
            commands::archives::zip_extract,
            commands::filesystem::volumes::list_volumes,
            commands::filesystem::volumes::eject_volume,
            commands::filesystem::desktop::open_terminal,
            commands::filesystem::transfers::transfer_items,
            commands::clipboard::copy_paths,
            commands::clipboard::cut_paths,
            commands::clipboard::paste_paths,
            commands::clipboard::clipboard_info,
            commands::clipboard::clear_clipboard,
            commands::plan::apply_plan,
            commands::plan::undo_plan,
            gateway::gateway_base,
            gateway::ai_get_config,
            gateway::ai_set_provider,
            gateway::ai_add_provider,
            gateway::ai_remove_provider,
            build_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod version_tests {
    #[test]
    fn build_version_is_consistent() {
        assert_eq!(env!("CLIVE_VERSION"), env!("CARGO_PKG_VERSION"));
    }
}
