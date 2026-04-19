//! Filesystem path resolution for the engine.

use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct EnginePaths {
    /// Houston docs directory — holds workspaces (`~/Documents/Houston`).
    pub docs_dir: PathBuf,
    /// Houston home directory — holds `engine.json`, DB (`~/.houston`).
    pub home_dir: PathBuf,
}

impl EnginePaths {
    pub fn new(docs_dir: PathBuf, home_dir: PathBuf) -> Self {
        Self { docs_dir, home_dir }
    }

    pub fn docs(&self) -> &Path {
        &self.docs_dir
    }

    pub fn home(&self) -> &Path {
        &self.home_dir
    }

    /// Installed-agent definitions: `<home>/agents`.
    pub fn agents_dir(&self) -> PathBuf {
        self.home_dir.join("agents")
    }
}
