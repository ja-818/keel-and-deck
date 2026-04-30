use serde::{Deserialize, Serialize};

const TITLE_MAX_CHARS: usize = 40;
pub const DESCRIPTION_MAX_CHARS: usize = 120;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct SummarizeResult {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
struct RawSummary {
    title: Option<String>,
    description: Option<String>,
}

pub(super) fn parse_summary(
    raw: &str,
    fallback: &SummarizeResult,
) -> Result<SummarizeResult, String> {
    let json = json_object(raw).ok_or_else(|| "missing JSON object".to_string())?;
    let parsed: RawSummary = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let title = parsed
        .title
        .and_then(|t| clean_title(&t))
        .unwrap_or_else(|| fallback.title.clone());
    let description = parsed
        .description
        .map(|d| truncate_chars(&normalize_spaces(&d), DESCRIPTION_MAX_CHARS))
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| fallback.description.clone());
    Ok(SummarizeResult { title, description })
}

pub(super) fn fallback_summary(message: &str) -> SummarizeResult {
    let normalized = normalize_spaces(message);
    let title = fallback_title(&normalized);
    let description = if normalized.is_empty() {
        title.clone()
    } else {
        truncate_chars(&normalized, DESCRIPTION_MAX_CHARS)
    };
    SummarizeResult { title, description }
}

pub(super) fn normalize_spaces(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(super) fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn json_object(raw: &str) -> Option<&str> {
    let trimmed = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    (start <= end).then_some(&trimmed[start..=end])
}

fn fallback_title(message: &str) -> String {
    if message.is_empty() {
        return "New mission".to_string();
    }
    truncate_on_word_boundary(message, TITLE_MAX_CHARS)
}

fn clean_title(raw: &str) -> Option<String> {
    let normalized = normalize_spaces(raw)
        .trim_matches(['"', '\'', '`'])
        .trim_end_matches(['.', ':', ';'])
        .trim()
        .to_string();
    if normalized.is_empty() {
        return None;
    }
    let words: Vec<&str> = normalized.split_whitespace().take(6).collect();
    let title = words.join(" ");
    Some(truncate_chars(&title, 64))
}

fn truncate_on_word_boundary(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut cut = truncate_chars(value, max_chars);
    if let Some(idx) = cut.rfind(' ') {
        cut.truncate(idx);
    }
    format!("{}...", cut.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_title_trims_on_word_boundary() {
        let summary = fallback_summary("Please write a long investor update for the whole team");

        assert_eq!(summary.title, "Please write a long investor update for...");
    }

    #[test]
    fn fallback_title_handles_empty_message() {
        let summary = fallback_summary("   \n\t  ");

        assert_eq!(summary.title, "New mission");
        assert_eq!(summary.description, "New mission");
    }

    #[test]
    fn parse_summary_accepts_fenced_json_and_limits_title_words() {
        let fallback = fallback_summary("fallback text");
        let parsed = parse_summary(
            "```json\n{\"title\":\"Plan the launch email campaign today please\",\"description\":\"Draft launch copy.\"}\n```",
            &fallback,
        )
        .unwrap();

        assert_eq!(parsed.title, "Plan the launch email campaign today");
        assert_eq!(parsed.description, "Draft launch copy.");
    }

    #[test]
    fn parse_summary_uses_fallback_when_title_empty() {
        let fallback = fallback_summary("Find better leads");
        let parsed = parse_summary("{\"title\":\" \",\"description\":\" \"}", &fallback).unwrap();

        assert_eq!(parsed.title, "Find better leads");
        assert_eq!(parsed.description, "Find better leads");
    }
}
