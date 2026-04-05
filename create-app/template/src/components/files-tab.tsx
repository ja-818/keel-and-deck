import { useState, useEffect, useCallback } from "react";
import { FilesBrowser } from "@houston-ai/workspace";
import type { FileEntry } from "@houston-ai/workspace";
import { tauriFiles } from "../lib/tauri";

interface FilesTabProps {
  workspacePath: string;
}

export function FilesTab({ workspacePath }: FilesTabProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await tauriFiles.list(workspacePath);
      setFiles(result);
    } catch (e) {
      console.error("[files] Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  return (
    <FilesBrowser
      files={files}
      loading={loading}
      onOpen={(file) => tauriFiles.open(workspacePath, file.path)}
      onReveal={(file) => tauriFiles.reveal(workspacePath, file.path)}
      onDelete={async (file) => {
        await tauriFiles.delete(workspacePath, file.path);
        loadFiles();
      }}
      onRename={async (file, newName) => {
        await tauriFiles.rename(workspacePath, file.path, newName);
        loadFiles();
      }}
      onCreateFolder={async (name) => {
        await tauriFiles.createFolder(workspacePath, name);
        loadFiles();
      }}
      emptyTitle="No files yet"
      emptyDescription="Files created by your agent will appear here."
    />
  );
}
