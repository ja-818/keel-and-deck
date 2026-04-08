//! Hermes-style self-improving skills for AI agents.
//!
//! Skills are directories containing a `SKILL.md` file with frontmatter metadata
//! and a markdown body. Stored under a skills directory (typically `.houston/skills/`).

pub mod format;
pub mod index;
pub mod patch;
#[cfg(feature = "remote")]
pub mod remote;
mod validate;

use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum SkillError {
    #[error("IO error: {0}")]
    Io(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Skill not found: {0}")]
    NotFound(String),
    #[error("Skill already exists: {0}")]
    AlreadyExists(String),
    #[error("Patch failed: old text not found")]
    PatchNotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSummary {
    pub name: String,
    pub description: String,
    pub version: u32,
    pub tags: Vec<String>,
    pub created: Option<String>,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Skill {
    pub summary: SkillSummary,
    pub content: String,
}

pub struct CreateSkillInput {
    pub name: String,
    pub description: String,
    pub content: String,
    pub tags: Vec<String>,
}

// ── Public API ─────────────────────────────────────────────────────

/// List all skills. Returns name + description only (progressive disclosure).
pub fn list_skills(skills_dir: &Path) -> Result<Vec<SkillSummary>, SkillError> {
    if !skills_dir.exists() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(skills_dir).map_err(|e| SkillError::Io(e.to_string()))?;
    let mut summaries = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        match format::parse_file(&skill_md) {
            Ok((summary, _body)) => summaries.push(summary),
            Err(e) => tracing::warn!("[houston-skills] skipping {}: {e}", path.display()),
        }
    }
    summaries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(summaries)
}

/// Load a skill's full content. Updates `last_used` in frontmatter.
pub fn load_skill(skills_dir: &Path, name: &str) -> Result<Skill, SkillError> {
    let skill_dir = skills_dir.join(name);
    let skill_md = skill_dir.join("SKILL.md");
    if !skill_md.exists() {
        return Err(SkillError::NotFound(name.to_string()));
    }
    let (mut summary, body) = format::parse_file(&skill_md)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    summary.last_used = Some(today);
    let updated = format::serialize(&summary, &body);
    std::fs::write(&skill_md, &updated).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(Skill {
        summary,
        content: body,
    })
}

/// Create a new skill directory with SKILL.md.
pub fn create_skill(skills_dir: &Path, input: CreateSkillInput) -> Result<(), SkillError> {
    validate::name(&input.name)?;
    validate::description(&input.description)?;
    validate::content(&input.content)?;

    let skill_dir = skills_dir.join(&input.name);
    if skill_dir.exists() {
        return Err(SkillError::AlreadyExists(input.name));
    }
    std::fs::create_dir_all(&skill_dir).map_err(|e| SkillError::Io(e.to_string()))?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let summary = SkillSummary {
        name: input.name,
        description: input.description,
        version: 1,
        tags: input.tags,
        created: Some(today.clone()),
        last_used: Some(today),
    };
    let content = format::serialize(&summary, &input.content);
    let skill_md = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md, &content).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Fuzzy find-and-replace within a skill's content. Increments version.
pub fn patch_skill(
    skills_dir: &Path,
    name: &str,
    old_text: &str,
    new_text: &str,
) -> Result<(), SkillError> {
    let skill_md = skills_dir.join(name).join("SKILL.md");
    if !skill_md.exists() {
        return Err(SkillError::NotFound(name.to_string()));
    }
    let (mut summary, body) = format::parse_file(&skill_md)?;
    let patched_body = patch::fuzzy_replace(&body, old_text, new_text)
        .ok_or(SkillError::PatchNotFound)?;
    validate::content(&patched_body)?;
    summary.version += 1;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    summary.last_used = Some(today);
    let content = format::serialize(&summary, &patched_body);
    std::fs::write(&skill_md, &content).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Full rewrite of skill content (preserves frontmatter metadata, increments version).
pub fn edit_skill(skills_dir: &Path, name: &str, new_content: &str) -> Result<(), SkillError> {
    validate::content(new_content)?;
    let skill_md = skills_dir.join(name).join("SKILL.md");
    if !skill_md.exists() {
        return Err(SkillError::NotFound(name.to_string()));
    }
    let (mut summary, _old_body) = format::parse_file(&skill_md)?;
    summary.version += 1;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    summary.last_used = Some(today);
    let content = format::serialize(&summary, new_content);
    std::fs::write(&skill_md, &content).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Delete a skill (removes entire directory).
pub fn delete_skill(skills_dir: &Path, name: &str) -> Result<(), SkillError> {
    let skill_dir = skills_dir.join(name);
    if !skill_dir.exists() {
        return Err(SkillError::NotFound(name.to_string()));
    }
    std::fs::remove_dir_all(&skill_dir).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Build compact skills index for system prompt injection.
pub fn build_skills_index(skills_dir: &Path) -> Result<String, SkillError> {
    index::build(skills_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn list_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let result = list_skills(tmp.path()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn list_nonexistent_dir() {
        let result = list_skills(Path::new("/nonexistent/path/skills"));
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn create_and_list() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "my-skill".into(),
            description: "Test skill".into(),
            content: "## Procedure\n\n1. Do stuff\n".into(),
            tags: vec!["test".into()],
        }).unwrap();

        let skills = list_skills(dir).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-skill");
        assert_eq!(skills[0].version, 1);
    }

    #[test]
    fn create_and_load() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "loader-test".into(),
            description: "Load test".into(),
            content: "## Procedure\nTest body".into(),
            tags: vec![],
        }).unwrap();

        let skill = load_skill(dir, "loader-test").unwrap();
        assert_eq!(skill.summary.name, "loader-test");
        assert!(skill.content.contains("Test body"));
    }

    #[test]
    fn create_duplicate_fails() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "dup".into(),
            description: "".into(),
            content: "body".into(),
            tags: vec![],
        }).unwrap();
        let result = create_skill(dir, CreateSkillInput {
            name: "dup".into(),
            description: "".into(),
            content: "body".into(),
            tags: vec![],
        });
        assert!(result.is_err());
    }

    #[test]
    fn edit_increments_version() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "editable".into(),
            description: "Edit me".into(),
            content: "v1 content".into(),
            tags: vec![],
        }).unwrap();

        edit_skill(dir, "editable", "v2 content").unwrap();
        let skill = load_skill(dir, "editable").unwrap();
        assert_eq!(skill.summary.version, 2);
        assert!(skill.content.contains("v2 content"));
    }

    #[test]
    fn patch_fuzzy() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "patchable".into(),
            description: "Patch me".into(),
            content: "1. First step\n2. Second step\n".into(),
            tags: vec![],
        }).unwrap();

        patch_skill(dir, "patchable", "Second step", "Updated step").unwrap();
        let skill = load_skill(dir, "patchable").unwrap();
        assert!(skill.content.contains("Updated step"));
        assert!(!skill.content.contains("Second step"));
        assert_eq!(skill.summary.version, 2);
    }

    #[test]
    fn delete_removes_dir() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "deleteme".into(),
            description: "".into(),
            content: "body".into(),
            tags: vec![],
        }).unwrap();
        assert!(dir.join("deleteme").exists());
        delete_skill(dir, "deleteme").unwrap();
        assert!(!dir.join("deleteme").exists());
    }

    #[test]
    fn delete_nonexistent_fails() {
        let tmp = TempDir::new().unwrap();
        let result = delete_skill(tmp.path(), "nope");
        assert!(result.is_err());
    }
}
