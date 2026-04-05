use std::path::Path;

use crate::{LearningsConfig, MemoryError, ENTRY_DELIMITER};

const LEARNINGS_FILENAME: &str = "LEARNINGS.md";

/// Parse a learnings file into entries. Splits on "§" lines, trims whitespace, filters empty.
pub fn parse_entries(content: &str) -> Vec<String> {
    content
        .split(ENTRY_DELIMITER)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Serialize entries back to file format (joined with "\n§\n").
pub fn serialize_entries(entries: &[String]) -> String {
    entries.join(&format!("\n{}\n", ENTRY_DELIMITER))
}

/// Calculate total character count of the serialized form.
pub fn char_count(entries: &[String]) -> usize {
    if entries.is_empty() {
        return 0;
    }
    serialize_entries(entries).chars().count()
}

/// Read the learnings file, returning empty string if the file doesn't exist.
pub fn read_file_or_empty(memory_dir: &Path) -> Result<String, MemoryError> {
    let path = memory_dir.join(LEARNINGS_FILENAME);
    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(MemoryError::Io(e)),
    }
}

/// Write entries to the learnings file, creating the directory if needed.
pub fn write_entries(
    memory_dir: &Path,
    entries: &[String],
) -> Result<(), MemoryError> {
    std::fs::create_dir_all(memory_dir)?;
    let path = memory_dir.join(LEARNINGS_FILENAME);
    let content = serialize_entries(entries);
    std::fs::write(&path, content)?;
    Ok(())
}

/// Check if adding an entry would exceed the limit.
pub fn check_limit(
    entries: &[String],
    new_entry_text: &str,
    config: &LearningsConfig,
) -> Result<(), MemoryError> {
    let limit = config.limit;
    let mut proposed = entries.to_vec();
    proposed.push(new_entry_text.trim().to_string());
    let proposed_chars = char_count(&proposed);

    if proposed_chars > limit {
        let current = char_count(entries);
        let percent = if limit > 0 {
            (current * 100) / limit
        } else {
            100
        };
        return Err(MemoryError::LimitExceeded {
            current,
            limit,
            entry_size: new_entry_text.trim().chars().count(),
            percent,
        });
    }
    Ok(())
}

/// Check if replacing an entry would exceed the limit.
pub fn check_limit_for_replace(
    entries: &[String],
    index: usize,
    new_text: &str,
    config: &LearningsConfig,
) -> Result<(), MemoryError> {
    let limit = config.limit;
    let mut proposed = entries.to_vec();
    proposed[index] = new_text.trim().to_string();
    let proposed_chars = char_count(&proposed);

    if proposed_chars > limit {
        let current = char_count(entries);
        let percent = if limit > 0 {
            (current * 100) / limit
        } else {
            100
        };
        return Err(MemoryError::LimitExceeded {
            current,
            limit,
            entry_size: new_text.trim().chars().count(),
            percent,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_empty_content() {
        let entries = parse_entries("");
        assert!(entries.is_empty());
    }

    #[test]
    fn parse_whitespace_only() {
        let entries = parse_entries("   \n\n  ");
        assert!(entries.is_empty());
    }

    #[test]
    fn parse_single_entry() {
        let entries = parse_entries("Environment: macOS Sonoma");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0], "Environment: macOS Sonoma");
    }

    #[test]
    fn parse_multiple_entries() {
        let content = "Entry one\n\u{00a7}\nEntry two\n\u{00a7}\nEntry three";
        let entries = parse_entries(content);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0], "Entry one");
        assert_eq!(entries[1], "Entry two");
        assert_eq!(entries[2], "Entry three");
    }

    #[test]
    fn parse_trims_whitespace() {
        let content = "  Entry one  \n\u{00a7}\n  Entry two  ";
        let entries = parse_entries(content);
        assert_eq!(entries[0], "Entry one");
        assert_eq!(entries[1], "Entry two");
    }

    #[test]
    fn parse_filters_empty_entries() {
        let content = "Entry one\n\u{00a7}\n\n\u{00a7}\nEntry two";
        let entries = parse_entries(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0], "Entry one");
        assert_eq!(entries[1], "Entry two");
    }

    #[test]
    fn serialize_round_trips() {
        let entries = vec![
            "Entry one".to_string(),
            "Entry two".to_string(),
            "Entry three".to_string(),
        ];
        let serialized = serialize_entries(&entries);
        let parsed = parse_entries(&serialized);
        assert_eq!(entries, parsed);
    }

    #[test]
    fn serialize_empty() {
        let entries: Vec<String> = vec![];
        let serialized = serialize_entries(&entries);
        assert_eq!(serialized, "");
    }

    #[test]
    fn serialize_single() {
        let entries = vec!["Only entry".to_string()];
        let serialized = serialize_entries(&entries);
        assert_eq!(serialized, "Only entry");
    }

    #[test]
    fn char_count_empty() {
        let entries: Vec<String> = vec![];
        assert_eq!(char_count(&entries), 0);
    }

    #[test]
    fn char_count_single_entry() {
        let entries = vec!["Hello".to_string()];
        assert_eq!(char_count(&entries), 5);
    }

    #[test]
    fn char_count_multiple_entries() {
        let entries = vec!["Hello".to_string(), "World".to_string()];
        // "Hello\n§\nWorld" = 5 + 1 + 1 + 1 + 5 = 13 chars
        assert_eq!(char_count(&entries), 13);
    }

    #[test]
    fn char_count_matches_serialized_char_count() {
        let entries = vec![
            "First entry".to_string(),
            "Second entry".to_string(),
            "Third".to_string(),
        ];
        let serialized = serialize_entries(&entries);
        assert_eq!(char_count(&entries), serialized.chars().count());
    }
}
