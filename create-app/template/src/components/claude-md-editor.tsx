import { useEffect, useState } from "react";
import { InstructionsPanel } from "@deck-ui/workspace";
import type { InstructionFile } from "@deck-ui/workspace";
import { tauriWorkspace } from "../lib/tauri";

interface ClaudeMdEditorProps {
  projectId: string;
}

export function ClaudeMdEditor({ projectId }: ClaudeMdEditorProps) {
  const [files, setFiles] = useState<InstructionFile[]>([]);

  useEffect(() => {
    tauriWorkspace
      .readFile(projectId, "CLAUDE.md")
      .then((content) => {
        setFiles([{ name: "CLAUDE.md", label: "CLAUDE.md", content }]);
      })
      .catch(() => {
        setFiles([{ name: "CLAUDE.md", label: "CLAUDE.md", content: "" }]);
      });
  }, [projectId]);

  const handleSave = async (name: string, content: string) => {
    await tauriWorkspace.writeFile(projectId, name, content);
    setFiles((prev) =>
      prev.map((f) => (f.name === name ? { ...f, content } : f)),
    );
  };

  return (
    <InstructionsPanel
      files={files}
      onSave={handleSave}
      emptyTitle="No CLAUDE.md yet"
      emptyDescription="Add a CLAUDE.md to configure how your agent behaves."
    />
  );
}
