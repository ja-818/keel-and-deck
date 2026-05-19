//! Custom-agent generator — single LLM call that designs the entire
//! agent (name, description, CLAUDE.md, 1-2 skills, optional routine)
//! from a user intent + the toolkit stack the recommender already
//! produced.
//!
//! Why one call: each `claude -p` round-trip costs 20-50s. Splitting
//! into "generate CLAUDE.md", "generate skills", "generate routine"
//! would 3x the wait without 3x the quality. The prompt is structured
//! tightly enough that the model can emit a single well-formed JSON.
//!
//! Failure modes are honest: if the LLM call errors, times out, or
//! returns un-parseable JSON, the caller surfaces the underlying
//! message — we do NOT fall back to a generic template (the user
//! pressed a button asking for a custom agent; giving them a generic
//! one would be misleading).

use super::provider_cli::run_provider;
use super::types::StackEntry;
use houston_terminal_manager::Provider;
use serde::{Deserialize, Serialize};

/// Public request shape. `stack` is the primary stack the recommender
/// returned — re-passed here so the LLM doesn't have to re-derive it.
#[derive(Debug, Clone)]
pub struct GenerateCustomRequest {
    pub intent: String,
    pub stack: Vec<StackEntry>,
    pub provider: Provider,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedSkill {
    /// Slug-like name. Used as the SKILL.md folder name AND the slash
    /// command. Prefixed with the agent slug to avoid collisions with
    /// other agents' skills in the same workspace.
    pub name: String,
    pub description: String,
    /// Full SKILL.md body (YAML frontmatter NOT included — the engine
    /// generates that from name + description).
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedRoutine {
    pub name: String,
    pub description: String,
    /// Prompt sent to the agent when the routine fires.
    pub prompt: String,
    /// 5-field cron expression (`"0 9 * * 1-5"` etc).
    pub schedule: String,
    #[serde(default = "default_true")]
    pub suppress_when_silent: bool,
    #[serde(default)]
    pub timezone: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateCustomResponse {
    /// Agent name (1-3 words, no emoji). Frontend lets the user edit
    /// before final submit.
    pub name: String,
    /// One-sentence description for the agent card.
    pub description: String,
    /// Full CLAUDE.md content. Sections: `## Instructions`, `## Tools`,
    /// `## Learnings`, `## Examples`. The prompt enforces this; the
    /// engine writes the string verbatim to the agent folder.
    pub claude_md: String,
    /// 0-2 skills the agent will start with. May be empty.
    pub skills: Vec<GeneratedSkill>,
    /// Routine spec, present only when the intent had a temporal cue
    /// (e.g. "daily", "every monday", "cada mañana"). Otherwise None.
    pub routine: Option<GeneratedRoutine>,
}

#[derive(Debug, thiserror::Error)]
pub enum GenerateError {
    #[error("intent must not be empty")]
    EmptyIntent,
    #[error("stack must not be empty")]
    EmptyStack,
    #[error("LLM call failed: {0}")]
    LlmCallFailed(String),
    #[error("failed to parse LLM response: {0}")]
    ParseFailed(String),
}

/// Entry point. Single round-trip to the provider CLI; the response is
/// the entire agent bundle.
pub async fn generate_custom(
    req: GenerateCustomRequest,
) -> Result<GenerateCustomResponse, GenerateError> {
    let intent = req.intent.trim();
    if intent.is_empty() {
        return Err(GenerateError::EmptyIntent);
    }
    if req.stack.is_empty() {
        return Err(GenerateError::EmptyStack);
    }

    let prompt = build_generate_prompt(intent, &req.stack);
    let started = std::time::Instant::now();
    let raw = match run_provider(&prompt, req.provider).await {
        Ok(text) => {
            tracing::info!(
                provider = %req.provider,
                ms = started.elapsed().as_millis() as u64,
                response_len = text.len(),
                "generate_custom: LLM returned"
            );
            text
        }
        Err(e) => {
            tracing::warn!(
                provider = %req.provider,
                ms = started.elapsed().as_millis() as u64,
                error = %e,
                "generate_custom: LLM call failed"
            );
            return Err(GenerateError::LlmCallFailed(e));
        }
    };

    let raw_parsed = parse_response(&raw)?;
    Ok(validate(raw_parsed))
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

fn build_generate_prompt(intent: &str, stack: &[StackEntry]) -> String {
    let stack_block: Vec<String> = stack
        .iter()
        .map(|e| {
            format!(
                "- {slug} ({name}) — role: {role}; reason: {reason}",
                slug = e.toolkit,
                name = e.name,
                role = e.role,
                reason = e.reason
            )
        })
        .collect();

    format!(
        "You design custom AI agents for non-technical users. The user already named what they want; the recommender already picked the tools. Your job: produce the full agent bundle as ONE JSON object.\n\n\
         === USER INTENT ===\n\
         {intent}\n\n\
         === TOOL STACK THE RECOMMENDER PICKED ===\n\
         {stack_block}\n\n\
         === WHAT YOU MUST PRODUCE ===\n\n\
         1. **name** — 1-3 words, no emoji, no quotes, no punctuation. Language matches the intent (Spanish intent → Spanish name; English → English; Portuguese → Portuguese). Examples: \"Daily AI News\", \"Lead Pipeline\", \"Code Watcher\".\n\n\
         2. **description** — one sentence, ≤140 chars, same language as intent. Describes what the agent does in plain language.\n\n\
         3. **claudeMd** — full CLAUDE.md content with EXACTLY these four sections in this order:\n\
            ```\n\
            ## Instructions\n\
            <multi-paragraph instructions: who this agent is, what it does, how it talks to the user, when to use each tool from the stack. Reference the toolkit names directly. Same language as intent.>\n\n\
            ## Tools\n\
            <one bullet per toolkit in the stack: `- {{name}}: when to use it`. Same language as intent.>\n\n\
            ## Learnings\n\
            <leave empty — the agent will add learnings here over time>\n\n\
            ## Examples\n\
            <1-2 concrete example interactions showing the agent doing its job with the tools. Same language as intent.>\n\
            ```\n\
            Do NOT add or rename sections. Do NOT use markdown fences inside this field.\n\n\
         4. **skills** — array of 0, 1, or 2 skills. Prefer 1. Each skill is a self-contained capability that uses one or more toolkits from the stack. Each entry:\n\
            - `name`: slug-style, lowercase, hyphens only, 2-4 words. PREFIX with a short agent slug so it doesn't collide with skills from other agents. Example: if the agent is \"Daily AI News\", a skill might be `dailyainews-fetch-articles`.\n\
            - `description`: one short sentence in the user's language.\n\
            - `content`: the SKILL.md body (NOT including the YAML frontmatter — the engine adds that). Should be 10-50 lines of markdown explaining when to invoke this skill and the concrete steps. Same language as intent.\n\
            Return [] (empty array) if the intent is so simple no skill is warranted.\n\n\
         5. **routine** — object OR null. Set it to a routine ONLY when the intent contains a clear temporal cue. Cues include (in any of en/es/pt): daily, weekly, every monday/tuesday/.../sunday, cada día/cada semana/cada lunes/.../domingo, todos los días, todas las mañanas, todas las noches, every morning, every evening, todo dia, toda manhã, cada hora, every hour, recordatorio, reminder, schedule, programa, automatically. If the intent has NO such cue, return `\"routine\": null`. If it does, the routine object has:\n\
            - `name`: 2-4 words describing what fires.\n\
            - `description`: one sentence.\n\
            - `prompt`: the instruction the agent receives when the routine fires. Should reference the tools concretely.\n\
            - `schedule`: a STRICT 5-field cron expression: `\"minute hour day-of-month month day-of-week\"`. Examples: `\"0 9 * * *\"` (daily 9am), `\"0 9 * * 1\"` (Monday 9am), `\"0 8 * * 1-5\"` (weekdays 8am), `\"0 */6 * * *\"` (every 6 hours). Use sensible defaults if the intent is fuzzy on timing: morning = 9am, evening = 19h.\n\
            - `suppressWhenSilent`: usually true (runs that finish quietly don't notify).\n\
            - `timezone`: omit unless the intent names one.\n\n\
         === HARD RULES ===\n\
         - Use the EXACT toolkit slugs from the stack list above — do not invent or rename.\n\
         - Do NOT recommend any LLM-API toolkit (the host IS the LLM).\n\
         - All user-visible text (name, description, claudeMd body, skill content, routine prompt) MUST match the intent's language.\n\
         - Return ONLY the JSON object below, no markdown fences, no commentary before or after.\n\n\
         === OUTPUT SHAPE ===\n\
         {{\n\
           \"name\": \"...\",\n\
           \"description\": \"...\",\n\
           \"claudeMd\": \"## Instructions\\n\\n...\\n\\n## Tools\\n\\n...\\n\\n## Learnings\\n\\n## Examples\\n\\n...\",\n\
           \"skills\": [\n\
             {{ \"name\": \"slug-style-name\", \"description\": \"...\", \"content\": \"...SKILL.md body...\" }}\n\
           ],\n\
           \"routine\": null\n\
         }}",
        intent = intent.trim(),
        stack_block = stack_block.join("\n"),
    )
}

// ---------------------------------------------------------------------------
// Parse + validate
// ---------------------------------------------------------------------------

fn parse_response(raw: &str) -> Result<GenerateCustomResponse, GenerateError> {
    let trimmed = raw.trim();
    let cleaned = if let Some(rest) = trimmed.strip_prefix("```json") {
        rest.trim_start().trim_end_matches("```").trim()
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest.trim_start().trim_end_matches("```").trim()
    } else {
        trimmed
    };
    serde_json::from_str::<GenerateCustomResponse>(cleaned)
        .map_err(|e| GenerateError::ParseFailed(format!("invalid JSON: {e}")))
}

/// Post-parse sanitization. We don't return errors for soft issues —
/// we just drop the invalid parts. Hard errors (empty name / empty
/// claude_md) bubble up via `Err`. A routine with an invalid cron is
/// downgraded to `None` because dropping the whole bundle for a bad
/// cron would lose the rest of the work.
fn validate(mut r: GenerateCustomResponse) -> GenerateCustomResponse {
    r.name = r.name.trim().to_string();
    r.description = r.description.trim().to_string();
    r.skills.retain(|s| {
        !s.name.trim().is_empty() && !s.content.trim().is_empty()
    });
    if let Some(ref rt) = r.routine {
        if !is_valid_cron_5_field(&rt.schedule) {
            tracing::warn!(
                schedule = %rt.schedule,
                "generate_custom: routine cron failed 5-field check, dropping routine"
            );
            r.routine = None;
        }
    }
    r
}

/// Minimal 5-field cron sanity check: exactly 5 whitespace-separated
/// non-empty tokens. We do NOT validate ranges (the scheduler does
/// that on insert); we just catch cases where the LLM emitted "0 9 * *"
/// or "0 9 * * * *" by mistake.
fn is_valid_cron_5_field(s: &str) -> bool {
    let parts: Vec<&str> = s.split_whitespace().collect();
    parts.len() == 5 && parts.iter().all(|p| !p.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_terminal_manager::Provider;

    fn dummy_stack() -> Vec<StackEntry> {
        vec![StackEntry {
            toolkit: "github".into(),
            name: "GitHub".into(),
            role: "code source".into(),
            reason: "...".into(),
            connected: false,
            logo_url: "https://logo".into(),
        }]
    }

    #[test]
    fn parse_response_strips_fences() {
        let raw = "```json\n{\"name\":\"X\",\"description\":\"d\",\"claudeMd\":\"## Instructions\\n\\n## Tools\\n\\n## Learnings\\n\\n## Examples\\n\",\"skills\":[],\"routine\":null}\n```";
        let r = parse_response(raw).unwrap();
        assert_eq!(r.name, "X");
        assert!(r.routine.is_none());
    }

    #[test]
    fn parse_accepts_null_routine() {
        let raw = "{\"name\":\"X\",\"description\":\"d\",\"claudeMd\":\"body\",\"skills\":[],\"routine\":null}";
        let r = parse_response(raw).unwrap();
        assert!(r.routine.is_none());
    }

    #[test]
    fn parse_accepts_routine_object() {
        let raw = "{\"name\":\"X\",\"description\":\"d\",\"claudeMd\":\"body\",\"skills\":[],\"routine\":{\"name\":\"daily\",\"description\":\"d\",\"prompt\":\"p\",\"schedule\":\"0 9 * * *\",\"suppressWhenSilent\":true}}";
        let r = parse_response(raw).unwrap();
        assert!(r.routine.is_some());
        assert_eq!(r.routine.unwrap().schedule, "0 9 * * *");
    }

    #[test]
    fn parse_rejects_malformed() {
        let raw = "{not json";
        assert!(matches!(parse_response(raw), Err(GenerateError::ParseFailed(_))));
    }

    #[test]
    fn validate_drops_invalid_cron() {
        let mut r = GenerateCustomResponse {
            name: "X".into(),
            description: "d".into(),
            claude_md: "body".into(),
            skills: vec![],
            routine: Some(GeneratedRoutine {
                name: "r".into(),
                description: "d".into(),
                prompt: "p".into(),
                schedule: "0 9 * *".into(), // 4 fields — invalid
                suppress_when_silent: true,
                timezone: None,
            }),
        };
        r = validate(r);
        assert!(r.routine.is_none());
    }

    #[test]
    fn validate_keeps_valid_cron() {
        let mut r = GenerateCustomResponse {
            name: "X".into(),
            description: "d".into(),
            claude_md: "body".into(),
            skills: vec![],
            routine: Some(GeneratedRoutine {
                name: "r".into(),
                description: "d".into(),
                prompt: "p".into(),
                schedule: "0 9 * * 1-5".into(),
                suppress_when_silent: true,
                timezone: None,
            }),
        };
        r = validate(r);
        assert!(r.routine.is_some());
    }

    #[test]
    fn validate_drops_skills_with_empty_content() {
        let mut r = GenerateCustomResponse {
            name: "X".into(),
            description: "d".into(),
            claude_md: "body".into(),
            skills: vec![
                GeneratedSkill {
                    name: "good".into(),
                    description: "d".into(),
                    content: "body".into(),
                },
                GeneratedSkill {
                    name: "bad".into(),
                    description: "d".into(),
                    content: "  ".into(), // empty after trim
                },
                GeneratedSkill {
                    name: "  ".into(), // empty name
                    description: "d".into(),
                    content: "body".into(),
                },
            ],
            routine: None,
        };
        r = validate(r);
        assert_eq!(r.skills.len(), 1);
        assert_eq!(r.skills[0].name, "good");
    }

    #[tokio::test]
    async fn empty_intent_rejected() {
        let r = generate_custom(GenerateCustomRequest {
            intent: "   ".into(),
            stack: dummy_stack(),
            provider: Provider::default(),
        })
        .await;
        assert!(matches!(r, Err(GenerateError::EmptyIntent)));
    }

    #[tokio::test]
    async fn empty_stack_rejected() {
        let r = generate_custom(GenerateCustomRequest {
            intent: "do a thing".into(),
            stack: vec![],
            provider: Provider::default(),
        })
        .await;
        assert!(matches!(r, Err(GenerateError::EmptyStack)));
    }
}
