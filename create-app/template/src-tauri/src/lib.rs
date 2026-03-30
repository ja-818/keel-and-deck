use keel_tauri::state::AppState;
use keel_tauri::keel_db::{self, Database, Project, Issue};
use tauri::State;

// ---------------------------------------------------------------------------
// Commands: Projects
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    state.db.list_projects().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_project(
    state: State<'_, AppState>,
    name: String,
    folder_path: String,
) -> Result<Project, String> {
    state
        .db
        .create_project(&name, &folder_path)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Commands: Issues
// ---------------------------------------------------------------------------

#[tauri::command]
async fn list_issues(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<Issue>, String> {
    state
        .db
        .list_issues(&project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_issue(
    state: State<'_, AppState>,
    project_id: String,
    title: String,
    description: String,
) -> Result<Issue, String> {
    state
        .db
        .create_issue(&project_id, &title, &description, None)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Commands: Sessions
// ---------------------------------------------------------------------------

#[tauri::command]
async fn start_session(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    prompt: String,
) -> Result<String, String> {
    use keel_tauri::keel_sessions::{SessionManager, SessionUpdate};
    use keel_tauri::events::KeelEvent;
    use tauri::Emitter;

    // Look up project for working directory.
    let project = state
        .db
        .get_project(&project_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let session_key = uuid::Uuid::new_v4().to_string();
    let working_dir = std::path::PathBuf::from(&project.folder_path);

    let (mut rx, _handle) = SessionManager::spawn_session(
        prompt,
        None,           // resume_session_id
        Some(working_dir),
        None,           // model
        None,           // effort
        None,           // system_prompt
        None,           // mcp_config
        false,          // disable_builtin_tools
        false,          // disable_all_tools
    );

    let key = session_key.clone();
    let handle = app_handle.clone();
    tokio::spawn(async move {
        while let Some(update) = rx.recv().await {
            match update {
                SessionUpdate::Feed(item) => {
                    let _ = handle.emit(
                        "keel-event",
                        KeelEvent::FeedItem {
                            session_key: key.clone(),
                            item,
                        },
                    );
                }
                SessionUpdate::Status(status) => {
                    let (status_str, error) = match &status {
                        keel_tauri::keel_sessions::SessionStatus::Starting => {
                            ("starting".to_string(), None)
                        }
                        keel_tauri::keel_sessions::SessionStatus::Running => {
                            ("running".to_string(), None)
                        }
                        keel_tauri::keel_sessions::SessionStatus::Completed => {
                            ("completed".to_string(), None)
                        }
                        keel_tauri::keel_sessions::SessionStatus::Error(e) => {
                            ("error".to_string(), Some(e.clone()))
                        }
                    };
                    let _ = handle.emit(
                        "keel-event",
                        KeelEvent::SessionStatus {
                            session_key: key.clone(),
                            status: status_str,
                            error,
                        },
                    );
                }
                _ => {}
            }
        }
    });

    Ok(session_key)
}

// ---------------------------------------------------------------------------
// Tauri setup
// ---------------------------------------------------------------------------

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = keel_db::db::default_data_dir("{{APP_NAME_SNAKE}}");
            let db_path = data_dir.join("{{APP_NAME_SNAKE}}.db");

            let db = tauri::async_runtime::block_on(async {
                Database::connect(&db_path)
                    .await
                    .expect("Failed to open database")
            });

            app.manage(AppState { db });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            list_issues,
            create_issue,
            start_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
