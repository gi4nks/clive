#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands {
    pub mod clipboard;
    pub mod filesystem;
    pub mod plan;
    pub mod trash;
    pub mod archives;
}

mod gateway;

use commands::clipboard::ClipboardState;
use gateway::GatewayHandle;

/// Build info reported by the running backend (proves how fresh the Rust binary is).
#[tauri::command]
fn build_info() -> serde_json::Value {
    serde_json::json!({
        "version": env!("CLIVE_VERSION"),
        "buildEpoch": env!("CLIVE_BUILD_EPOCH").parse::<u64>().unwrap_or(0),
        "commit": env!("CLIVE_GIT_COMMIT"),
        "branch": env!("CLIVE_GIT_BRANCH"),
    })
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
            commands::filesystem::list_dir,
            commands::filesystem::home_dir,
            commands::filesystem::file_info,
            commands::filesystem::get_file_tags,
            commands::filesystem::set_files_tags,
            commands::filesystem::copy_file,
            commands::filesystem::move_file,
            commands::filesystem::rename,
            commands::trash::delete_to_trash,
            commands::trash::trash_list,
            commands::trash::trash_restore,
            commands::trash::trash_delete_forever,
            commands::trash::trash_empty,
            commands::filesystem::create_folder,
            commands::filesystem::read_text_file,
            commands::filesystem::write_text_file,
            commands::filesystem::reveal_in_finder,
            commands::filesystem::open_path,
            commands::filesystem::connect_smb,
            commands::filesystem::disconnect_volume,
            commands::filesystem::quick_look,
            commands::filesystem::disk_space,
            commands::filesystem::read_file_bytes,
            commands::archives::zip_list,
            commands::archives::zip_read,
            commands::archives::zip_extract,
            commands::filesystem::list_volumes,
            commands::filesystem::eject_volume,
            commands::filesystem::open_terminal,
            commands::filesystem::transfer_items,
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
