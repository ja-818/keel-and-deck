import { useEffect, useState } from "react";
import { InstructionsPanel } from "@houston-ai/workspace";
import type { InstructionFile } from "@houston-ai/workspace";
import { tauriWorkspace } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";

export default function ContextTab({ workspace }: TabProps) {
  const [files, setFiles] = useState<InstructionFile[]>([]);

  useEffect(() => {
    tauriWorkspace
      .readFile(workspace.folderPath, "CLAUDE.md")
      .then((content) => {
        setFiles([{ name: "CLAUDE.md", label: "CLAUDE.md", content }]);
      })
      .catch(() => {
        setFiles([{ name: "CLAUDE.md", label: "CLAUDE.md", content: "" }]);
      });
  }, [workspace.folderPath]);

  const handleSave = async (name: string, content: string) => {
    await tauriWorkspace.writeFile(workspace.folderPath, name, content);
    setFiles((prev) =>
      prev.map((f) => (f.name === name ? { ...f, content } : f)),
    );
  };

  return (
    <InstructionsPanel
      files={files}
      onSave={handleSave}
      emptyTitle="No CLAUDE.md yet"
      emptyDescription="Add a CLAUDE.md to configure how your assistant behaves."
    />
  );
}
