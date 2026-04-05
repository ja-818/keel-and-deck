mod commands;
mod memory_commands;
mod skill_commands;
mod workspace;

use houston_tauri::agent_sessions::AgentSessionMap;
use houston_tauri::houston_db::Database;
use houston_tauri::state::AppState;
use tauri::Manager;

/// The parent directory containing all agent workspaces.
pub struct WorkspaceRoot(pub String);

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = houston_tauri::houston_db::db::default_data_dir("{{APP_NAME}}");
            let db_path = data_dir.join("{{APP_NAME}}.db");

            let db = tauri::async_runtime::block_on(async {
                Database::connect(&db_path)
                    .await
                    .expect("Failed to open database")
            });

            let docs = dirs::document_dir().expect("No Documents directory found");
            let root = docs.join("{{APP_NAME_TITLE}}");
            std::fs::create_dir_all(&root).ok();

            app.manage(AppState {
                db,
                event_queue: None,
                scheduler: None,
            });
            app.manage(AgentSessionMap::default());
            app.manage(WorkspaceRoot(root.to_string_lossy().to_string()));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_agents,
            commands::create_agent,
            commands::rename_agent,
            commands::delete_agent,
            commands::send_message,
            commands::load_chat_history,
            commands::read_workspace_file,
            commands::write_workspace_file,
            skill_commands::list_skills,
            skill_commands::load_skill,
            skill_commands::create_skill,
            skill_commands::delete_skill,
            skill_commands::save_skill,
            skill_commands::install_skills_from_repo,
            skill_commands::search_community_skills,
            skill_commands::install_community_skill,
            memory_commands::load_learnings,
            memory_commands::add_learning,
            memory_commands::replace_learning,
            memory_commands::remove_learning,
            houston_tauri::workspace_commands::list_project_files,
            houston_tauri::workspace_commands::open_file,
            houston_tauri::workspace_commands::reveal_file,
            houston_tauri::workspace_commands::delete_file,
            houston_tauri::workspace_commands::rename_file,
            houston_tauri::workspace_commands::create_workspace_folder,
            houston_tauri::workspace_commands::reveal_workspace,
            houston_tauri::workspace_commands::import_files,
            houston_tauri::composio_commands::list_composio_connections,
            houston_tauri::composio_commands::start_composio_oauth,
            houston_tauri::workspace_commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
