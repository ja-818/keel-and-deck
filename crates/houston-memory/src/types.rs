use thiserror::Error;

use crate::DEFAULT_LEARNINGS_LIMIT;

#[derive(Error, Debug)]
pub enum MemoryError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error(
        "LEARNINGS is at {percent}% capacity ({current}/{limit} chars). \
         This entry ({entry_size} chars) would exceed the limit. \
         Replace a stale entry with `replace_entry()` or `remove_entry()` to free space first."
    )]
    LimitExceeded {
        current: usize,
        limit: usize,
        entry_size: usize,
        percent: usize,
    },

    #[error("Entry index {index} out of range (file has {count} entries)")]
    IndexOutOfRange { index: usize, count: usize },
}

/// A single learning entry with its positional index.
#[derive(Debug, Clone)]
pub struct LearningEntry {
    pub index: usize,
    pub text: String,
}

/// Snapshot of the learnings file for system prompt injection and UI display.
#[derive(Debug, Clone)]
pub struct LearningsData {
    pub entries: Vec<LearningEntry>,
    pub chars: usize,
    pub limit: usize,
}

/// Configuration for the learnings system.
#[derive(Debug, Clone)]
pub struct LearningsConfig {
    pub limit: usize,
}

impl Default for LearningsConfig {
    fn default() -> Self {
        Self {
            limit: DEFAULT_LEARNINGS_LIMIT,
        }
    }
}
