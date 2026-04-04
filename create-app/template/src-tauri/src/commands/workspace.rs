use keel_tauri::paths::expand_tilde;
use keel_tauri::state::AppState;
use keel_tauri::workspace as kw;
use std::path::PathBuf;
use tauri::State;

#[tauri::command]
pub async fn list_workspace_files(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<kw::WorkspaceFileInfo>, String> {
    let dir = get_workspace_dir(&state, &project_id).await?;
    Ok(kw::list_files(&dir, crate::workspace::KNOWN_FILES))
}

#[tauri::command]
pub async fn read_workspace_file(
    state: State<'_, AppState>,
    project_id: String,
    file_name: String,
) -> Result<String, String> {
    let dir = get_workspace_dir(&state, &project_id).await?;
    let allowed: Vec<&str> = crate::workspace::KNOWN_FILES.iter().map(|(n, _)| *n).collect();
    kw::read_file(&dir, &file_name, &allowed)
}

#[tauri::command]
pub async fn write_workspace_file(
    state: State<'_, AppState>,
    project_id: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    let dir = get_workspace_dir(&state, &project_id).await?;
    let allowed: Vec<&str> = crate::workspace::KNOWN_FILES.iter().map(|(n, _)| *n).collect();
    if !allowed.contains(&file_name.as_str()) {
        return Err(format!("Unknown workspace file: {file_name}"));
    }
    std::fs::write(dir.join(&file_name), &content)
        .map_err(|e| format!("Failed to write {file_name}: {e}"))
}

async fn get_workspace_dir(state: &AppState, project_id: &str) -> Result<PathBuf, String> {
    let project = state.db.get_project(project_id).await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    Ok(expand_tilde(&PathBuf::from(&project.folder_path)))
}
