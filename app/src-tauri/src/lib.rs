mod commands;
mod workspace;

use commands::workspaces::WorkspaceRoot;
use houston_tauri::agent_sessions::AgentSessionMap;
use houston_tauri::houston_db::Database;
use houston_tauri::state::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = houston_tauri::houston_db::db::default_data_dir("houston");
            let db_path = data_dir.join("houston.db");

            let db = tauri::async_runtime::block_on(async {
                Database::connect(&db_path)
                    .await
                    .expect("Failed to open database")
            });

            let docs = dirs::document_dir().expect("No Documents directory found");
            let root = docs.join("Houston");
            std::fs::create_dir_all(&root).ok();

            app.manage(AppState {
                db,
                event_queue: None,
                scheduler: None,
            });
            app.manage(AgentSessionMap::default());
            app.manage(WorkspaceRoot(root));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Workspace CRUD
            commands::workspaces::list_workspaces,
            commands::workspaces::create_workspace,
            commands::workspaces::delete_workspace,
            commands::workspaces::rename_workspace,
            commands::workspaces::update_workspace_opened,
            // Experiences
            commands::experiences::list_installed_experiences,
            // Sessions
            commands::sessions::start_session,
            commands::sessions::stop_session,
            commands::sessions::load_chat_history,
            // Workspace store — tasks, routines, goals, channels, skills, log, config
            houston_tauri::workspace_store::commands::list_tasks,
            houston_tauri::workspace_store::commands::create_task,
            houston_tauri::workspace_store::commands::update_task,
            houston_tauri::workspace_store::commands::delete_task,
            houston_tauri::workspace_store::commands::list_routines,
            houston_tauri::workspace_store::commands::create_routine,
            houston_tauri::workspace_store::commands::update_routine,
            houston_tauri::workspace_store::commands::delete_routine,
            houston_tauri::workspace_store::commands::list_goals,
            houston_tauri::workspace_store::commands::create_goal,
            houston_tauri::workspace_store::commands::update_goal,
            houston_tauri::workspace_store::commands::delete_goal,
            houston_tauri::workspace_store::commands::list_channels_config,
            houston_tauri::workspace_store::commands::add_channel_config,
            houston_tauri::workspace_store::commands::remove_channel_config,
            houston_tauri::workspace_store::commands::list_skills,
            houston_tauri::workspace_store::commands::read_skill,
            houston_tauri::workspace_store::commands::write_skill,
            houston_tauri::workspace_store::commands::delete_skill,
            houston_tauri::workspace_store::commands::append_log,
            houston_tauri::workspace_store::commands::read_log,
            houston_tauri::workspace_store::commands::read_config,
            houston_tauri::workspace_store::commands::write_config,
            // Workspace file operations
            houston_tauri::workspace_commands::list_project_files,
            houston_tauri::workspace_commands::open_file,
            houston_tauri::workspace_commands::reveal_file,
            houston_tauri::workspace_commands::delete_file,
            houston_tauri::workspace_commands::rename_file,
            houston_tauri::workspace_commands::create_workspace_folder,
            houston_tauri::workspace_commands::reveal_workspace,
            houston_tauri::workspace_commands::import_files,
            houston_tauri::workspace_commands::open_url,
            houston_tauri::workspace_commands::write_file_bytes,
            houston_tauri::workspace_commands::read_project_file,
            houston_tauri::workspace_commands::search_sessions,
            houston_tauri::workspace_commands::list_recent_sessions,
            houston_tauri::workspace_commands::load_session_feed,
            // Composio integrations
            houston_tauri::composio_commands::list_composio_connections,
            houston_tauri::composio_commands::start_composio_oauth,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
