import { InstructionsPanel } from "@houston-ai/agent";
import { useInstructions, useSaveInstructions } from "../../hooks/queries";
import type { TabProps } from "../../lib/types";

export default function InstructionsTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data } = useInstructions(path);
  const save = useSaveInstructions(path);

  const files = data
    ? [{ name: "CLAUDE.md", label: "CLAUDE.md", content: data }]
    : [];

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        <InstructionsPanel
          files={files}
          onSave={(name, content) => save.mutateAsync({ name, content })}
          emptyTitle="No instructions found"
          emptyDescription="A CLAUDE.md file will be created when the agent initializes."
        />
      </div>
    </div>
  );
}
