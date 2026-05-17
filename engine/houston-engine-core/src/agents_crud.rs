//! Workspace-scoped agent CRUD — relocated from
//! `app/src-tauri/src/commands/agents.rs`.
//!
//! Each agent lives at `<workspaces_root>/<workspace_name>/<agent_name>/`
//! with metadata in `.houston/agent.json`. Linked (external) projects use
//! a symlink whose target is the real path on disk.
//!
//! Transport-neutral: REST routes, CLI tools, and the Tauri adapter all
//! consume this module.

use crate::error::{CoreError, CoreResult};
use crate::paths::expand_tilde;
use crate::workspaces;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentMeta {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub config_id: String,
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub temporary: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<AgentOrigin>,
    pub created_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentOrigin {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role_fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_agent_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_session_key: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub config_id: String,
    pub color: Option<String>,
    pub temporary: bool,
    pub created_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgent {
    pub name: String,
    pub config_id: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub claude_md: Option<String>,
    #[serde(default)]
    pub installed_path: Option<String>,
    #[serde(default)]
    pub seeds: Option<HashMap<String, String>>,
    #[serde(default)]
    pub existing_path: Option<String>,
    #[serde(default)]
    pub temporary: bool,
    #[serde(default)]
    pub origin: Option<AgentOrigin>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentResult {
    pub agent: Agent,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgent {
    pub color: String,
}

fn houston_dir(folder: &Path) -> PathBuf {
    folder.join(".houston")
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn agent_json_path(folder: &Path) -> PathBuf {
    houston_dir(folder).join("agent.json")
}

fn read_agent_meta(folder: &Path) -> CoreResult<AgentMeta> {
    let path = agent_json_path(folder);
    let contents = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&contents)?)
}

fn write_agent_meta(folder: &Path, meta: &AgentMeta) -> CoreResult<()> {
    let dir = houston_dir(folder);
    fs::create_dir_all(&dir)?;
    let target = dir.join("agent.json");
    let tmp = dir.join("agent.json.tmp");
    let json = serde_json::to_string_pretty(meta)?;
    fs::write(&tmp, &json)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

fn meta_to_agent(folder: &Path, meta: &AgentMeta) -> Agent {
    let name = meta.name.clone().unwrap_or_else(|| {
        folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    });
    let real_path = fs::canonicalize(folder).unwrap_or_else(|_| folder.to_path_buf());
    Agent {
        id: meta.id.clone(),
        name,
        folder_path: real_path.to_string_lossy().to_string(),
        config_id: meta.config_id.clone(),
        color: meta.color.clone(),
        temporary: meta.temporary,
        created_at: meta.created_at.clone(),
        last_opened_at: meta.last_opened_at.clone(),
    }
}

fn find_agent_by_id(ws_dir: &Path, id: &str) -> CoreResult<PathBuf> {
    let entries = fs::read_dir(ws_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if !agent_json_path(&path).exists() {
            continue;
        }
        if let Ok(meta) = read_agent_meta(&path) {
            if meta.id == id {
                return Ok(path);
            }
        }
    }
    Err(CoreError::NotFound(format!("Agent not found: {id}")))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// Resolve the workspace folder from (root, workspace_id).
fn resolve_ws_folder(root: &Path, workspace_id: &str) -> CoreResult<PathBuf> {
    let workspaces = workspaces::read_all(root)?;
    let ws = workspaces
        .iter()
        .find(|w| w.id == workspace_id)
        .ok_or_else(|| CoreError::NotFound(format!("Workspace not found: {workspace_id}")))?;
    let folder = root.join(&ws.name);
    fs::create_dir_all(&folder)?;
    Ok(folder)
}

fn seed_json_if_missing(houston: &Path, filename: &str, content: &str) -> CoreResult<()> {
    let path = houston.join(filename);
    if !path.exists() {
        fs::write(&path, content)?;
    }
    Ok(())
}

fn is_activity_seed_path(path: &str) -> bool {
    matches!(
        path,
        ".houston/activity.json" | ".houston/activity/activity.json"
    )
}

fn temporary_folder_name(name: &str, id: &str) -> String {
    let suffix: String = id.chars().take(8).collect();
    format!("{name} ({suffix})")
}

pub fn generated_agent_origin(
    role_id: &str,
    name: &str,
    prompt: &str,
    parent_agent_path: &str,
    parent_session_key: &str,
) -> AgentOrigin {
    AgentOrigin {
        kind: "orchestration".into(),
        role_id: Some(normalize_identity(role_id)),
        role_fingerprint: Some(role_fingerprint(name, prompt)),
        parent_agent_path: Some(parent_agent_path.to_string()),
        parent_session_key: Some(parent_session_key.to_string()),
    }
}

fn role_fingerprint(name: &str, prompt: &str) -> String {
    let normalized = normalize_identity(&format!("{name}\n{prompt}"));
    format!("{:016x}", fnv1a64(normalized.as_bytes()))
}

fn normalize_identity(value: &str) -> String {
    let mut out = String::new();
    let mut last_was_space = true;
    for ch in value.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_was_space = false;
        } else if !last_was_space {
            out.push(' ');
            last_was_space = true;
        }
    }
    out.trim().to_string()
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn is_generated_config(config_id: &str) -> bool {
    matches!(config_id, "generated-custom" | "custom")
}

fn legacy_generated_origin(folder: &Path, meta: &AgentMeta) -> AgentOrigin {
    let name = meta_to_agent(folder, meta).name;
    let prompt = fs::read_to_string(folder.join("CLAUDE.md")).unwrap_or_default();
    AgentOrigin {
        kind: "orchestration".into(),
        role_id: Some(normalize_identity(&name)),
        role_fingerprint: Some(role_fingerprint(&name, &prompt)),
        parent_agent_path: None,
        parent_session_key: None,
    }
}

fn migrate_generated_agents(ws_dir: &Path) -> CoreResult<()> {
    let mut generated = Vec::new();
    for entry in fs::read_dir(ws_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() || !agent_json_path(&path).exists() {
            continue;
        }
        let mut meta = read_agent_meta(&path)?;
        let mut changed = false;
        if is_generated_config(&meta.config_id) {
            if meta.config_id == "custom" {
                meta.config_id = "generated-custom".into();
                changed = true;
            }
            if meta.origin.is_none() {
                meta.origin = Some(legacy_generated_origin(&path, &meta));
                changed = true;
            }
            if changed {
                write_agent_meta(&path, &meta)?;
            }
            generated.push((path, meta));
        }
    }

    let mut by_fingerprint: HashMap<String, Vec<(PathBuf, AgentMeta)>> = HashMap::new();
    for (path, meta) in generated {
        if meta.temporary {
            continue;
        }
        let Some(fingerprint) = meta
            .origin
            .as_ref()
            .and_then(|origin| origin.role_fingerprint.clone())
        else {
            continue;
        };
        by_fingerprint
            .entry(fingerprint)
            .or_default()
            .push((path, meta));
    }

    for entries in by_fingerprint.values_mut() {
        if entries.len() < 2 {
            continue;
        }
        entries.sort_by(|(_, a), (_, b)| {
            let a_time = a.last_opened_at.as_deref().unwrap_or(&a.created_at);
            let b_time = b.last_opened_at.as_deref().unwrap_or(&b.created_at);
            b_time.cmp(a_time)
        });
        for (path, meta) in entries.iter_mut().skip(1) {
            meta.temporary = true;
            write_agent_meta(path, meta)?;
        }
    }
    Ok(())
}

/// List agents within a workspace folder.
pub fn list(root: &Path, workspace_id: &str) -> CoreResult<Vec<Agent>> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    migrate_generated_agents(&ws_dir)?;
    let entries = fs::read_dir(&ws_dir)?;
    let mut agents = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_symlink() && !path.exists() {
            tracing::warn!("[agents] removing dangling symlink: {name}");
            let _ = fs::remove_file(&path);
            continue;
        }
        if !path.is_dir() {
            continue;
        }
        if !agent_json_path(&path).exists() {
            continue;
        }
        match read_agent_meta(&path) {
            Ok(meta) => agents.push(meta_to_agent(&path, &meta)),
            Err(e) => tracing::warn!("[agents] skipping {name}: {e}"),
        }
    }

    agents.sort_by(|a, b| {
        let a_time = a.last_opened_at.as_deref().unwrap_or("");
        let b_time = b.last_opened_at.as_deref().unwrap_or("");
        b_time.cmp(a_time)
    });

    Ok(agents)
}

pub fn create(root: &Path, workspace_id: &str, req: CreateAgent) -> CoreResult<CreateAgentResult> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let id = Uuid::new_v4().to_string();

    let is_linked = req.existing_path.is_some();
    let folder = if let Some(ref ep) = req.existing_path {
        let p = expand_tilde(Path::new(ep));
        if !p.exists() {
            return Err(CoreError::BadRequest(format!(
                "Directory does not exist: {}",
                p.display()
            )));
        }
        let link_path = ws_dir.join(&req.name);
        if link_path.exists() {
            return Err(CoreError::Conflict(format!(
                "An agent named \"{}\" already exists",
                req.name
            )));
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&p, &link_path)?;
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&p, &link_path)?;
        p
    } else {
        let folder_name = if req.temporary {
            temporary_folder_name(&req.name, &id)
        } else {
            req.name.clone()
        };
        let f = ws_dir.join(folder_name);
        if f.exists() {
            return Err(CoreError::Conflict(format!(
                "An agent named \"{}\" already exists",
                req.name
            )));
        }
        fs::create_dir_all(&f)?;
        f
    };

    fs::create_dir_all(folder.join(".agents/skills"))?;
    if let Some(installed_path) = req.installed_path.as_ref() {
        let packaged_skills = PathBuf::from(installed_path).join(".agents").join("skills");
        if packaged_skills.exists() {
            crate::store::copy_dir_all(&packaged_skills, &folder.join(".agents/skills"))?;
        }
    }

    let now = now_iso();
    let meta = AgentMeta {
        id,
        name: if is_linked || req.temporary {
            Some(req.name.clone())
        } else {
            None
        },
        config_id: req.config_id.clone(),
        color: req.color,
        temporary: req.temporary,
        origin: req.origin,
        created_at: now.clone(),
        last_opened_at: Some(now),
    };
    write_agent_meta(&folder, &meta)?;

    let claude_md_path = folder.join("CLAUDE.md");
    if !claude_md_path.exists() {
        let content = req
            .claude_md
            .or_else(|| {
                req.installed_path
                    .as_ref()
                    .and_then(|p| fs::read_to_string(PathBuf::from(p).join("CLAUDE.md")).ok())
            })
            .unwrap_or_else(|| "## Instructions\n\n## Learnings\n".to_string());
        fs::write(&claude_md_path, &content)?;
    }

    if let Some(seed_files) = req.seeds {
        for (path, content) in &seed_files {
            if is_activity_seed_path(path) {
                continue;
            }
            let target = folder.join(path);
            if !target.exists() {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&target, content)?;
            }
        }
    }

    crate::agents::prompt::seed_agent(&folder).map_err(CoreError::Internal)?;

    let houston = houston_dir(&folder);
    seed_json_if_missing(&houston, "activity.json", "[]")?;
    seed_json_if_missing(&houston, "config.json", "{}")?;

    Ok(CreateAgentResult {
        agent: meta_to_agent(&folder, &meta),
    })
}

pub fn delete(root: &Path, workspace_id: &str, id: &str) -> CoreResult<()> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let folder = find_agent_by_id(&ws_dir, id)?;
    if folder.is_symlink() {
        fs::remove_file(&folder)?;
    } else {
        fs::remove_dir_all(&folder)?;
    }
    Ok(())
}

pub fn rename(root: &Path, workspace_id: &str, id: &str, new_name: &str) -> CoreResult<Agent> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let old_folder = find_agent_by_id(&ws_dir, id)?;
    let new_link = ws_dir.join(new_name);

    if new_link.exists() {
        return Err(CoreError::Conflict(format!(
            "An agent named \"{new_name}\" already exists"
        )));
    }

    if old_folder.is_symlink() {
        let target = fs::read_link(&old_folder)?;
        fs::remove_file(&old_folder)?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &new_link)?;
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&target, &new_link)?;
        let mut meta = read_agent_meta(&new_link)?;
        meta.name = Some(new_name.to_string());
        write_agent_meta(&new_link, &meta)?;
        Ok(meta_to_agent(&new_link, &meta))
    } else {
        fs::rename(&old_folder, &new_link)?;
        let meta = read_agent_meta(&new_link)?;
        Ok(meta_to_agent(&new_link, &meta))
    }
}

pub fn update(root: &Path, workspace_id: &str, id: &str, req: UpdateAgent) -> CoreResult<Agent> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let folder = find_agent_by_id(&ws_dir, id)?;
    let color = req.color.trim();
    if color.is_empty() {
        return Err(CoreError::BadRequest("Agent color is required".into()));
    }

    let mut meta = read_agent_meta(&folder)?;
    meta.color = Some(color.to_string());
    write_agent_meta(&folder, &meta)?;
    Ok(meta_to_agent(&folder, &meta))
}

pub fn save_temporary(
    root: &Path,
    workspace_id: &str,
    agent_paths: &[PathBuf],
) -> CoreResult<Vec<Agent>> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    migrate_generated_agents(&ws_dir)?;
    let mut saved = Vec::with_capacity(agent_paths.len());
    for folder in agent_paths {
        let mut meta = read_agent_meta(folder)?;
        normalize_generated_meta(folder, &mut meta)?;
        if let Some(existing) = find_saved_generated_agent(&ws_dir, folder, &meta)? {
            update_saved_generated_agent(&existing, folder, &meta.origin)?;
            let existing_meta = read_agent_meta(&existing)?;
            saved.push(meta_to_agent(&existing, &existing_meta));
            continue;
        }
        meta.temporary = false;
        meta.config_id = "generated-custom".into();
        meta.last_opened_at = Some(now_iso());
        write_agent_meta(folder, &meta)?;
        saved.push(meta_to_agent(folder, &meta));
    }
    Ok(saved)
}

fn normalize_generated_meta(folder: &Path, meta: &mut AgentMeta) -> CoreResult<()> {
    let mut changed = false;
    if meta.config_id == "custom" {
        meta.config_id = "generated-custom".into();
        changed = true;
    }
    if meta.origin.is_none() {
        meta.origin = Some(legacy_generated_origin(folder, meta));
        changed = true;
    }
    if changed {
        write_agent_meta(folder, meta)?;
    }
    Ok(())
}

fn find_saved_generated_agent(
    ws_dir: &Path,
    temporary_folder: &Path,
    temporary_meta: &AgentMeta,
) -> CoreResult<Option<PathBuf>> {
    let temporary_name = meta_to_agent(temporary_folder, temporary_meta).name;
    let temporary_fingerprint = temporary_meta
        .origin
        .as_ref()
        .and_then(|origin| origin.role_fingerprint.as_deref());
    let temporary_role_id = temporary_meta
        .origin
        .as_ref()
        .and_then(|origin| origin.role_id.as_deref());
    for entry in fs::read_dir(ws_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path == temporary_folder || !path.is_dir() || !agent_json_path(&path).exists() {
            continue;
        }
        let meta = read_agent_meta(&path)?;
        let agent = meta_to_agent(&path, &meta);
        if meta.temporary || !is_generated_config(&meta.config_id) {
            continue;
        }
        let existing_fingerprint = meta
            .origin
            .as_ref()
            .and_then(|origin| origin.role_fingerprint.as_deref());
        let existing_role_id = meta
            .origin
            .as_ref()
            .and_then(|origin| origin.role_id.as_deref());
        if temporary_role_id.is_some() && temporary_role_id == existing_role_id {
            return Ok(Some(path));
        }
        if temporary_fingerprint.is_some() && temporary_fingerprint == existing_fingerprint {
            return Ok(Some(path));
        }
        if agent.name == temporary_name {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn update_saved_generated_agent(
    saved_folder: &Path,
    temporary_folder: &Path,
    origin: &Option<AgentOrigin>,
) -> CoreResult<()> {
    let source_prompt = temporary_folder.join("CLAUDE.md");
    if source_prompt.exists() {
        fs::copy(&source_prompt, saved_folder.join("CLAUDE.md"))?;
    }
    let mut meta = read_agent_meta(saved_folder)?;
    meta.config_id = "generated-custom".into();
    if origin.is_some() {
        meta.origin = origin.clone();
    }
    meta.last_opened_at = Some(now_iso());
    write_agent_meta(saved_folder, &meta)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspaces::CreateWorkspace;
    use tempfile::TempDir;

    fn setup_ws(root: &Path) -> String {
        workspaces::create(
            root,
            CreateWorkspace {
                name: "alpha".into(),
                provider: None,
                model: None,
            },
        )
        .unwrap()
        .id
    }

    #[test]
    fn create_and_list() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let res = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "first".into(),
                config_id: "blank".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: false,
                origin: None,
            },
        )
        .unwrap();
        assert_eq!(res.agent.name, "first");
        assert_eq!(
            fs::read_to_string(d.path().join("alpha/first/.houston/activity.json")).unwrap(),
            "[]"
        );

        let all = list(d.path(), &ws_id).unwrap();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn create_ignores_template_activity_seed() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let mut seeds = HashMap::new();
        seeds.insert(
            ".houston/activity.json".to_string(),
            r#"[{"id":"seeded","title":"Start anywhere - I'll ask for what I need","description":"No upfront onboarding.","status":"needs_you"}]"#.to_string(),
        );

        create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "store-agent".into(),
                config_id: "engineering".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: Some(seeds),
                existing_path: None,
                temporary: false,
                origin: None,
            },
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(d.path().join("alpha/store-agent/.houston/activity.json")).unwrap(),
            "[]"
        );
    }

    #[test]
    fn temporary_agents_can_reuse_display_names() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let make = || CreateAgent {
            name: "Worker".into(),
            config_id: "blank".into(),
            color: None,
            claude_md: None,
            installed_path: None,
            seeds: None,
            existing_path: None,
            temporary: true,
            origin: None,
        };

        let first = create(d.path(), &ws_id, make()).unwrap();
        let second = create(d.path(), &ws_id, make()).unwrap();

        assert_eq!(first.agent.name, "Worker");
        assert_eq!(second.agent.name, "Worker");
        assert_ne!(first.agent.folder_path, second.agent.folder_path);
        assert!(Path::new(&first.agent.folder_path)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("Worker ("));
    }

    #[test]
    fn save_temporary_updates_existing_custom_agent_without_duplication() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let saved = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "Writer".into(),
                config_id: "custom".into(),
                color: None,
                claude_md: Some("old prompt".into()),
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: false,
                origin: None,
            },
        )
        .unwrap();
        let temporary = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "Writer".into(),
                config_id: "custom".into(),
                color: None,
                claude_md: Some("new prompt".into()),
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: true,
                origin: None,
            },
        )
        .unwrap();

        let result = save_temporary(
            d.path(),
            &ws_id,
            &[PathBuf::from(&temporary.agent.folder_path)],
        )
        .unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, saved.agent.id);
        assert_eq!(
            fs::read_to_string(PathBuf::from(saved.agent.folder_path).join("CLAUDE.md")).unwrap(),
            "new prompt"
        );
        let agents = list(d.path(), &ws_id).unwrap();
        assert_eq!(
            agents
                .iter()
                .filter(|agent| agent.name == "Writer" && !agent.temporary)
                .count(),
            1
        );
        assert_eq!(
            agents
                .iter()
                .filter(|agent| agent.name == "Writer" && agent.temporary)
                .count(),
            1
        );
    }

    #[test]
    fn save_temporary_never_updates_non_custom_agents() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let system_like = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "Writer".into(),
                config_id: "personal-assistant".into(),
                color: None,
                claude_md: Some("system prompt".into()),
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: false,
                origin: None,
            },
        )
        .unwrap();
        let temporary = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "Writer".into(),
                config_id: "custom".into(),
                color: None,
                claude_md: Some("user prompt".into()),
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: true,
                origin: None,
            },
        )
        .unwrap();

        let result = save_temporary(
            d.path(),
            &ws_id,
            &[PathBuf::from(&temporary.agent.folder_path)],
        )
        .unwrap();

        assert_ne!(result[0].id, system_like.agent.id);
        assert_eq!(
            fs::read_to_string(PathBuf::from(system_like.agent.folder_path).join("CLAUDE.md"))
                .unwrap(),
            "system prompt"
        );
    }

    #[test]
    fn save_temporary_updates_generated_agent_by_role_id_when_name_changes() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let saved = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "Post Builder".into(),
                config_id: "generated-custom".into(),
                color: None,
                claude_md: Some("old prompt".into()),
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: false,
                origin: Some(generated_agent_origin(
                    "posts",
                    "Post Builder",
                    "old prompt",
                    "/parent",
                    "chat-parent",
                )),
            },
        )
        .unwrap();
        let temporary = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "Facebook Copywriter".into(),
                config_id: "generated-custom".into(),
                color: None,
                claude_md: Some("new prompt".into()),
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: true,
                origin: Some(generated_agent_origin(
                    "posts",
                    "Facebook Copywriter",
                    "new prompt",
                    "/parent",
                    "chat-parent",
                )),
            },
        )
        .unwrap();

        let result = save_temporary(
            d.path(),
            &ws_id,
            &[PathBuf::from(&temporary.agent.folder_path)],
        )
        .unwrap();

        assert_eq!(result[0].id, saved.agent.id);
        assert_eq!(result[0].config_id, "generated-custom");
        assert_eq!(
            fs::read_to_string(PathBuf::from(saved.agent.folder_path).join("CLAUDE.md")).unwrap(),
            "new prompt"
        );
        let agents = list(d.path(), &ws_id).unwrap();
        assert_eq!(agents.iter().filter(|agent| !agent.temporary).count(), 1);
    }

    #[test]
    fn list_migrates_legacy_custom_generated_agents_to_real_config() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let legacy = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "Legacy generated".into(),
                config_id: "custom".into(),
                color: None,
                claude_md: Some("legacy prompt".into()),
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: false,
                origin: None,
            },
        )
        .unwrap();

        let agents = list(d.path(), &ws_id).unwrap();

        assert_eq!(agents[0].config_id, "generated-custom");
        let meta = read_agent_meta(Path::new(&legacy.agent.folder_path)).unwrap();
        assert_eq!(meta.config_id, "generated-custom");
        assert_eq!(
            meta.origin.as_ref().map(|origin| origin.kind.as_str()),
            Some("orchestration")
        );
    }

    #[test]
    fn rename_and_delete() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let res = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "n".into(),
                config_id: "gmail".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: false,
                origin: None,
            },
        )
        .unwrap();
        let renamed = rename(d.path(), &ws_id, &res.agent.id, "m").unwrap();
        assert_eq!(renamed.name, "m");
        delete(d.path(), &ws_id, &res.agent.id).unwrap();
        assert!(list(d.path(), &ws_id).unwrap().is_empty());
    }

    #[test]
    fn update_color_persists() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let res = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "n".into(),
                config_id: "gmail".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                temporary: false,
                origin: None,
            },
        )
        .unwrap();

        let updated = update(
            d.path(),
            &ws_id,
            &res.agent.id,
            UpdateAgent {
                color: "forest".into(),
            },
        )
        .unwrap();

        assert_eq!(updated.color.as_deref(), Some("forest"));
        let all = list(d.path(), &ws_id).unwrap();
        assert_eq!(all[0].color.as_deref(), Some("forest"));
    }
}
