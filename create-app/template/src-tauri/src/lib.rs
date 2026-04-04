mod agent_sessions;
mod commands;
mod workspace;

pub use agent_sessions::AgentSessionMap;

use keel_tauri::keel_db::Database;
use keel_tauri::state::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = keel_tauri::keel_db::db::default_data_dir("{{APP_NAME}}");
            let db_path = data_dir.join("{{APP_NAME}}.db");

            let db = tauri::async_runtime::block_on(async {
                Database::connect(&db_path)
                    .await
                    .expect("Failed to open database")
            });

            app.manage(AppState {
                db,
                event_queue: None,
                scheduler: None,
            });
            app.manage(AgentSessionMap::default());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::create_project,
            commands::sessions::ensure_workspace,
            commands::sessions::start_session,
            commands::sessions::load_chat_feed,
            commands::workspace::list_workspace_files,
            commands::workspace::read_workspace_file,
            commands::workspace::write_workspace_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
