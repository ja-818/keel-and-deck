import { useEffect, useState } from "react";
import { InstructionsPanel } from "@houston-ai/workspace";
import type { InstructionFile } from "@houston-ai/workspace";
import { tauriWorkspace } from "../lib/tauri";

interface ContextTabProps {
  workspacePath: string;
}

export function ContextTab({ workspacePath }: ContextTabProps) {
  const [files, setFiles] = useState<InstructionFile[]>([]);

  useEffect(() => {
    tauriWorkspace
      .readFile(workspacePath, "CLAUDE.md")
      .then((content) => {
        setFiles([{ name: "CLAUDE.md", label: "CLAUDE.md", content }]);
      })
      .catch(() => {
        setFiles([{ name: "CLAUDE.md", label: "CLAUDE.md", content: "" }]);
      });
  }, [workspacePath]);

  const handleSave = async (name: string, content: string) => {
    await tauriWorkspace.writeFile(workspacePath, name, content);
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
