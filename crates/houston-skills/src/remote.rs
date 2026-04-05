//! Install skills from GitHub repositories via skills.sh.
//!
//! Requires the `remote` feature flag (adds `reqwest`).
//!
//! Provides three operations:
//! - `search_skills()` — query the skills.sh directory
//! - `install_skill()` — install a single skill from a GitHub repo
//! - `install_from_repo()` — install all skills from a repo's `skills/` dir

use crate::{CreateSkillInput, SkillError};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;

// ── Public types ──────────────────────────────────────────────────

/// A skill returned by the skills.sh search API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunitySkill {
    pub id: String,
    #[serde(rename = "skillId")]
    pub skill_id: String,
    pub name: String,
    pub installs: u64,
    pub source: String,
}

#[derive(Deserialize)]
struct SearchResponse {
    skills: Vec<CommunitySkill>,
}

// ── GitHub API types ──────────────────────────────────────────────

#[derive(Deserialize)]
struct GithubEntry {
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
}

// ── Parsed SKILL.md ───────────────────────────────────────────────

struct ParsedSkillMd {
    name: String,
    description: String,
    content: String,
}

// ── Public API ────────────────────────────────────────────────────

/// Search the skills.sh community directory.
pub async fn search_skills(query: &str) -> Result<Vec<CommunitySkill>, SkillError> {
    let client = build_client()?;
    let resp = client
        .get("https://skills.sh/api/search")
        .query(&[("q", query)])
        .send()
        .await
        .map_err(|e| SkillError::Io(format!("Search failed: {e}")))?;

    if !resp.status().is_success() {
        return Err(SkillError::Io(format!(
            "Skills search failed ({})",
            resp.status()
        )));
    }

    let result: SearchResponse = resp
        .json()
        .await
        .map_err(|e| SkillError::Io(format!("Failed to parse results: {e}")))?;

    Ok(result.skills)
}

/// Install a single community skill by fetching its SKILL.md from GitHub.
///
/// `source` is the GitHub `owner/repo`, `skill_id` is the skill directory name.
/// Returns the installed skill's local name.
pub async fn install_skill(
    skills_dir: &Path,
    source: &str,
    skill_id: &str,
) -> Result<String, SkillError> {
    std::fs::create_dir_all(skills_dir)
        .map_err(|e| SkillError::Io(e.to_string()))?;

    let client = build_client()?;
    let raw_md = fetch_skill_md(&client, source, skill_id).await?;
    let parsed = parse_skill_md(&raw_md, skill_id);

    // Use skill_id as the directory name (already kebab-case),
    // not the parsed heading which may have uppercase/spaces.
    let install_name = skill_id.to_string();

    // Don't overwrite existing
    if skills_dir.join(&install_name).exists() {
        return Err(SkillError::AlreadyExists(install_name));
    }

    crate::create_skill(
        skills_dir,
        CreateSkillInput {
            name: install_name.clone(),
            description: parsed.description,
            content: parsed.content,
            tags: vec![],
        },
    )?;

    Ok(install_name)
}

/// Install all skills from a GitHub repo's `skills/` directory.
///
/// `source` is a GitHub `owner/repo` string (e.g. `"ja-818/houston"`).
/// Returns the names of all successfully installed skills.
pub async fn install_from_repo(
    skills_dir: &Path,
    source: &str,
) -> Result<Vec<String>, SkillError> {
    let client = build_client()?;
    let skill_ids = list_repo_skills(&client, source).await?;

    if skill_ids.is_empty() {
        return Err(SkillError::Io(format!(
            "No skills found in {source}/skills/"
        )));
    }

    std::fs::create_dir_all(skills_dir)
        .map_err(|e| SkillError::Io(e.to_string()))?;

    let mut installed = Vec::new();
    for skill_id in &skill_ids {
        if skills_dir.join(skill_id).exists() {
            installed.push(skill_id.clone());
            continue;
        }

        match fetch_skill_md(&client, source, skill_id).await {
            Ok(raw_md) => {
                let parsed = parse_skill_md(&raw_md, skill_id);
                let input = CreateSkillInput {
                    name: skill_id.clone(),
                    description: parsed.description,
                    content: parsed.content,
                    tags: vec![],
                };
                match crate::create_skill(skills_dir, input) {
                    Ok(()) => installed.push(skill_id.clone()),
                    Err(e) => eprintln!("[houston-skills] skip {skill_id}: {e}"),
                }
            }
            Err(e) => eprintln!("[houston-skills] skip {skill_id}: {e}"),
        }
    }

    Ok(installed)
}

// ── Internals ─────────────────────────────────────────────────────

fn build_client() -> Result<Client, SkillError> {
    Client::builder()
        .user_agent("houston-skills/1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| SkillError::Io(format!("HTTP client error: {e}")))
}

async fn list_repo_skills(
    client: &Client,
    source: &str,
) -> Result<Vec<String>, SkillError> {
    let url = format!(
        "https://api.github.com/repos/{source}/contents/skills"
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| SkillError::Io(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(SkillError::Io(format!(
            "GitHub API returned {} for {url}",
            resp.status()
        )));
    }

    let entries: Vec<GithubEntry> = resp
        .json()
        .await
        .map_err(|e| SkillError::Io(e.to_string()))?;

    Ok(entries
        .into_iter()
        .filter(|e| e.entry_type == "dir")
        .map(|e| e.name)
        .collect())
}

async fn fetch_skill_md(
    client: &Client,
    source: &str,
    skill_id: &str,
) -> Result<String, SkillError> {
    let attempts = [
        format!("https://raw.githubusercontent.com/{source}/main/skills/{skill_id}/SKILL.md"),
        format!("https://raw.githubusercontent.com/{source}/master/skills/{skill_id}/SKILL.md"),
        format!("https://raw.githubusercontent.com/{source}/main/SKILL.md"),
        format!("https://raw.githubusercontent.com/{source}/master/SKILL.md"),
    ];

    for url in &attempts {
        if let Ok(resp) = client.get(url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    return Ok(text);
                }
            }
        }
    }

    Err(SkillError::Io(format!(
        "Could not find SKILL.md for '{skill_id}' in {source}"
    )))
}

fn parse_skill_md(content: &str, fallback_id: &str) -> ParsedSkillMd {
    let mut description = String::new();
    let mut body_lines: Vec<&str> = Vec::new();
    let mut in_frontmatter = false;
    let mut frontmatter_done = false;

    for line in content.lines() {
        if line.trim() == "---" && !frontmatter_done {
            if in_frontmatter {
                frontmatter_done = true;
            } else {
                in_frontmatter = true;
            }
            continue;
        }

        if in_frontmatter && !frontmatter_done {
            if let Some(desc) = line.strip_prefix("description:") {
                description = desc.trim().trim_matches('"').to_string();
            }
        } else if frontmatter_done {
            body_lines.push(line);
        }
    }

    if !frontmatter_done {
        body_lines = content.lines().collect();
    }

    let mut name = String::new();
    for line in &body_lines {
        if let Some(title) = line.strip_prefix("# ") {
            name = title.trim().to_string();
            break;
        }
    }

    if name.is_empty() {
        name = kebab_to_title(fallback_id);
    }

    if description.len() > 200 {
        if let Some(pos) = description[..200].rfind(". ") {
            description = description[..=pos].to_string();
        } else {
            description.truncate(200);
        }
    }

    ParsedSkillMd {
        name,
        description,
        content: body_lines.join("\n").trim().to_string(),
    }
}

fn kebab_to_title(s: &str) -> String {
    s.split('-')
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(first) => {
                    format!("{}{}", first.to_uppercase(), c.collect::<String>())
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_with_frontmatter() {
        let content = "\
---
name: my-skill
description: A test skill for testing
license: MIT
---

# My Awesome Skill

## When to Use
Use this when testing.

## Steps
1. Do thing
2. Do other thing";

        let parsed = parse_skill_md(content, "my-skill");
        assert_eq!(parsed.name, "My Awesome Skill");
        assert_eq!(parsed.description, "A test skill for testing");
        assert!(parsed.content.contains("## When to Use"));
        assert!(parsed.content.contains("1. Do thing"));
    }

    #[test]
    fn parse_no_frontmatter() {
        let content = "# Plain Skill\n\nJust some instructions.";
        let parsed = parse_skill_md(content, "plain-skill");
        assert_eq!(parsed.name, "Plain Skill");
        assert!(parsed.description.is_empty());
        assert!(parsed.content.contains("Just some instructions"));
    }

    #[test]
    fn parse_no_title_falls_back_to_kebab() {
        let content = "\
---
name: no-title-skill
description: No title heading here
---

Some content without a heading.";

        let parsed = parse_skill_md(content, "no-title-skill");
        assert_eq!(parsed.name, "No Title Skill");
        assert_eq!(parsed.description, "No title heading here");
    }

    #[test]
    fn kebab_to_title_basic() {
        assert_eq!(kebab_to_title("react-best-practices"), "React Best Practices");
        assert_eq!(kebab_to_title("single"), "Single");
    }

    #[test]
    fn truncates_long_description() {
        let long = format!("Short sentence. {}", "word ".repeat(60));
        let content = format!("---\ndescription: {long}\n---\n# Test");
        let parsed = parse_skill_md(&content, "test");
        assert!(parsed.description.len() <= 201);
    }
}
