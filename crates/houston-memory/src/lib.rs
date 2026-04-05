//! houston-memory — Character-bounded persistent learnings for AI agents.
//!
//! A single markdown file in `.houston/memory/`:
//! - **LEARNINGS.md** — everything the agent has learned (user preferences, environment facts,
//!   tool behaviors, project conventions, workarounds, lessons)
//!
//! Entries are delimited by `§` (section sign). The character limit forces curation —
//! when full, the agent must replace stale entries to make room.

pub mod entries;
pub mod prompt;
mod types;

pub use types::*;

use std::path::Path;

use entries::{
    char_count, check_limit, check_limit_for_replace, parse_entries, read_file_or_empty,
    write_entries,
};

pub const ENTRY_DELIMITER: &str = "\u{00a7}";
pub const DEFAULT_LEARNINGS_LIMIT: usize = 3_500;

/// Load a snapshot of the learnings file for system prompt injection and UI display.
pub fn load_learnings(
    memory_dir: &Path,
    config: &LearningsConfig,
) -> Result<LearningsData, MemoryError> {
    let content = read_file_or_empty(memory_dir)?;
    let strings = parse_entries(&content);
    let chars = char_count(&strings);

    let entries = strings
        .into_iter()
        .enumerate()
        .map(|(i, text)| LearningEntry { index: i, text })
        .collect();

    Ok(LearningsData {
        entries,
        chars,
        limit: config.limit,
    })
}

/// List all learning entries.
pub fn list_entries(memory_dir: &Path) -> Result<Vec<LearningEntry>, MemoryError> {
    let content = read_file_or_empty(memory_dir)?;
    let strings = parse_entries(&content);
    Ok(strings
        .into_iter()
        .enumerate()
        .map(|(i, text)| LearningEntry { index: i, text })
        .collect())
}

/// Add a learning entry. Returns error if it would exceed the limit.
pub fn add_entry(
    memory_dir: &Path,
    text: &str,
    config: &LearningsConfig,
) -> Result<(), MemoryError> {
    let content = read_file_or_empty(memory_dir)?;
    let mut entries = parse_entries(&content);
    check_limit(&entries, text, config)?;
    entries.push(text.trim().to_string());
    write_entries(memory_dir, &entries)
}

/// Replace a learning entry by index. Returns error if the new text would exceed the limit.
pub fn replace_entry(
    memory_dir: &Path,
    index: usize,
    new_text: &str,
    config: &LearningsConfig,
) -> Result<(), MemoryError> {
    let content = read_file_or_empty(memory_dir)?;
    let mut entries = parse_entries(&content);

    if index >= entries.len() {
        return Err(MemoryError::IndexOutOfRange {
            index,
            count: entries.len(),
        });
    }

    check_limit_for_replace(&entries, index, new_text, config)?;
    entries[index] = new_text.trim().to_string();
    write_entries(memory_dir, &entries)
}

/// Remove a learning entry by index.
pub fn remove_entry(memory_dir: &Path, index: usize) -> Result<(), MemoryError> {
    let content = read_file_or_empty(memory_dir)?;
    let mut entries = parse_entries(&content);

    if index >= entries.len() {
        return Err(MemoryError::IndexOutOfRange {
            index,
            count: entries.len(),
        });
    }

    entries.remove(index);
    write_entries(memory_dir, &entries)
}

/// Build formatted learnings block for system prompt injection.
pub fn build_learnings_prompt(
    memory_dir: &Path,
    config: &LearningsConfig,
) -> Result<String, MemoryError> {
    prompt::build_learnings_prompt(memory_dir, config)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn memory_dir(base: &tempfile::TempDir) -> std::path::PathBuf {
        base.path().join(".houston").join("memory")
    }

    #[test]
    fn add_entry_creates_dir_and_file() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "First note", &config).unwrap();

        let content = std::fs::read_to_string(dir.join("LEARNINGS.md")).unwrap();
        assert_eq!(content, "First note");
    }

    #[test]
    fn add_multiple_entries() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "Note 1", &config).unwrap();
        add_entry(&dir, "Note 2", &config).unwrap();

        let entries = list_entries(&dir).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].text, "Note 1");
        assert_eq!(entries[0].index, 0);
        assert_eq!(entries[1].text, "Note 2");
        assert_eq!(entries[1].index, 1);
    }

    #[test]
    fn add_entry_limit_exceeded() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig { limit: 20 };

        add_entry(&dir, "Short", &config).unwrap();

        let result = add_entry(
            &dir,
            "This is a much longer entry that will exceed the limit",
            &config,
        );

        assert!(result.is_err());
        let err = result.unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("LEARNINGS"));
        assert!(msg.contains("capacity"));
        assert!(msg.contains("replace_entry"));
    }

    #[test]
    fn replace_entry_success() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "Old note", &config).unwrap();
        add_entry(&dir, "Keep this", &config).unwrap();

        replace_entry(&dir, 0, "New note", &config).unwrap();

        let entries = list_entries(&dir).unwrap();
        assert_eq!(entries[0].text, "New note");
        assert_eq!(entries[1].text, "Keep this");
    }

    #[test]
    fn replace_entry_index_out_of_range() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "Only entry", &config).unwrap();

        let result = replace_entry(&dir, 5, "New text", &config);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("index 5"));
        assert!(msg.contains("1 entries"));
    }

    #[test]
    fn replace_entry_limit_exceeded() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig { limit: 30 };

        add_entry(&dir, "Short", &config).unwrap();

        let result = replace_entry(
            &dir,
            0,
            "This replacement is way too long for the tiny limit we set",
            &config,
        );
        assert!(result.is_err());
    }

    #[test]
    fn remove_entry_success() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "First", &config).unwrap();
        add_entry(&dir, "Second", &config).unwrap();
        add_entry(&dir, "Third", &config).unwrap();

        remove_entry(&dir, 1).unwrap();

        let entries = list_entries(&dir).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].text, "First");
        assert_eq!(entries[1].text, "Third");
    }

    #[test]
    fn remove_entry_index_out_of_range() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "Only entry", &config).unwrap();

        let result = remove_entry(&dir, 3);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("index 3"));
    }

    #[test]
    fn list_entries_missing_file() {
        let base = setup_dir();
        let dir = memory_dir(&base);

        let entries = list_entries(&dir).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn list_entries_missing_dir() {
        let base = setup_dir();
        let dir = base.path().join("nonexistent").join("memory");

        let entries = list_entries(&dir).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn load_learnings_missing_files() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        let data = load_learnings(&dir, &config).unwrap();
        assert!(data.entries.is_empty());
        assert_eq!(data.chars, 0);
        assert_eq!(data.limit, DEFAULT_LEARNINGS_LIMIT);
    }

    #[test]
    fn load_learnings_with_data() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "Learning 1", &config).unwrap();
        add_entry(&dir, "Learning 2", &config).unwrap();
        add_entry(&dir, "User pref 1", &config).unwrap();

        let data = load_learnings(&dir, &config).unwrap();
        assert_eq!(data.entries.len(), 3);
        assert!(data.chars > 0);
    }

    #[test]
    fn build_learnings_prompt_integration() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "Environment: macOS", &config).unwrap();
        add_entry(&dir, "VPN required", &config).unwrap();
        add_entry(&dir, "Name: James", &config).unwrap();

        let prompt = build_learnings_prompt(&dir, &config).unwrap();
        assert!(prompt.contains("LEARNINGS (what you've learned)"));
        assert!(prompt.contains("Environment: macOS"));
        assert!(prompt.contains("VPN required"));
        assert!(prompt.contains("Name: James"));
    }

    #[test]
    fn build_learnings_prompt_empty() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        let prompt = build_learnings_prompt(&dir, &config).unwrap();
        assert_eq!(prompt, "");
    }

    #[test]
    fn add_entry_trims_whitespace() {
        let base = setup_dir();
        let dir = memory_dir(&base);
        let config = LearningsConfig::default();

        add_entry(&dir, "  Padded entry  ", &config).unwrap();

        let entries = list_entries(&dir).unwrap();
        assert_eq!(entries[0].text, "Padded entry");
    }
}
