import type { TabProps } from "../../lib/types";
import { useLearnings, useAddLearning, useRemoveLearning } from "../../hooks/queries";
import { LearningsSection } from "./configure-sections";

export default function LearningsTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data: learningsData } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h2 className="text-sm font-medium text-foreground">Learnings</h2>
        <p className="text-xs text-muted-foreground/60 mt-0.5 mb-3">
          Agents save learnings as they work. You can add them manually too.
        </p>
        <LearningsSection
          entries={learningsData?.entries ?? []}
          onAdd={(t) => addLearning.mutateAsync(t)}
          onRemove={(i) => removeLearning.mutateAsync(i)}
        />
      </div>
    </div>
  );
}
