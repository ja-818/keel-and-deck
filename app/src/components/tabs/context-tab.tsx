import { InstructionsPanel } from "@houston-ai/agent";
import { useContextFiles, useSaveContextFile, CONTEXT_FILE_NAMES } from "../../hooks/queries";
import type { TabProps } from "../../lib/types";

const PROMPT_FILES = [
  { name: CONTEXT_FILE_NAMES.claudeMd, label: "CLAUDE.md" },
  { name: CONTEXT_FILE_NAMES.systemPrompt, label: "System Prompt" },
  { name: CONTEXT_FILE_NAMES.selfImprovement, label: "Self-Improvement" },
];

export default function ContextTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data } = useContextFiles(path);
  const saveFile = useSaveContextFile(path);

  const files = data
    ? PROMPT_FILES.map((pf) => ({
        name: pf.name,
        label: pf.label,
        content:
          pf.name === CONTEXT_FILE_NAMES.claudeMd
            ? data.claudeMd
            : pf.name === CONTEXT_FILE_NAMES.systemPrompt
              ? data.systemPrompt
              : data.selfImprovement,
      }))
    : [];

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        <InstructionsPanel
          files={files}
          onSave={(name, content) => saveFile.mutateAsync({ name, content })}
          emptyTitle="No prompt files found"
          emptyDescription="Prompt files will be created when the agent initializes."
        />
      </div>
    </div>
  );
}
