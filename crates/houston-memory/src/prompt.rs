use std::path::Path;

use crate::entries::{char_count, parse_entries, read_file_or_empty};
use crate::{LearningsConfig, MemoryError};

const SEPARATOR: &str =
    "\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\
     \u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\
     \u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\
     \u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}";

/// Format a number with comma separators (e.g. 1375 -> "1,375").
fn format_number(n: usize) -> String {
    let s = n.to_string();
    let mut result = String::new();
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            result.push(',');
        }
        result.push(ch);
    }
    result.chars().rev().collect()
}

/// Build formatted learnings block for system prompt injection.
///
/// Returns empty string if the file is empty/doesn't exist.
pub fn build_learnings_prompt(
    memory_dir: &Path,
    config: &LearningsConfig,
) -> Result<String, MemoryError> {
    let content = read_file_or_empty(memory_dir)?;
    let entries = parse_entries(&content);

    if entries.is_empty() {
        return Ok(String::new());
    }

    let chars = char_count(&entries);
    let limit = config.limit;
    let percent = if limit > 0 {
        (chars * 100) / limit
    } else {
        0
    };

    let label = format!(
        "LEARNINGS (what you've learned) [{}% \u{2014} {}/{} chars]",
        percent,
        format_number(chars),
        format_number(limit),
    );

    let body = entries.join(&format!("\n{}\n", crate::ENTRY_DELIMITER));

    Ok(format!("{}\n{}\n{}\n{}", SEPARATOR, label, SEPARATOR, body))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn format_number_small() {
        assert_eq!(format_number(42), "42");
    }

    #[test]
    fn format_number_with_commas() {
        assert_eq!(format_number(1375), "1,375");
        assert_eq!(format_number(2200), "2,200");
        assert_eq!(format_number(12345), "12,345");
    }

    #[test]
    fn build_learnings_prompt_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let memory_dir = dir.path().join("memory");
        fs::create_dir_all(&memory_dir).unwrap();

        let config = LearningsConfig::default();
        let result = build_learnings_prompt(&memory_dir, &config).unwrap();
        assert_eq!(result, "");
    }

    #[test]
    fn build_learnings_prompt_missing_dir() {
        let dir = tempfile::tempdir().unwrap();
        let memory_dir = dir.path().join("nonexistent");

        let config = LearningsConfig::default();
        let result = build_learnings_prompt(&memory_dir, &config).unwrap();
        assert_eq!(result, "");
    }

    #[test]
    fn build_learnings_prompt_with_entries() {
        let dir = tempfile::tempdir().unwrap();
        let memory_dir = dir.path().join("memory");
        fs::create_dir_all(&memory_dir).unwrap();

        fs::write(
            memory_dir.join("LEARNINGS.md"),
            "Environment: macOS\n\u{00a7}\nVPN required\n\u{00a7}\nName: James",
        )
        .unwrap();

        let config = LearningsConfig::default();
        let result = build_learnings_prompt(&memory_dir, &config).unwrap();

        assert!(result.contains("LEARNINGS (what you've learned)"));
        assert!(result.contains("chars]"));
        assert!(result.contains("Environment: macOS"));
        assert!(result.contains("VPN required"));
        assert!(result.contains("Name: James"));
    }

    #[test]
    fn build_learnings_prompt_single_entry() {
        let dir = tempfile::tempdir().unwrap();
        let memory_dir = dir.path().join("memory");
        fs::create_dir_all(&memory_dir).unwrap();

        fs::write(memory_dir.join("LEARNINGS.md"), "Some note").unwrap();

        let config = LearningsConfig::default();
        let result = build_learnings_prompt(&memory_dir, &config).unwrap();

        assert!(result.contains("LEARNINGS"));
        assert!(result.contains("Some note"));
    }
}
