import { useCallback } from "react";
import { LearningsPanel } from "@houston-ai/memory";
import { useLearnings, useAddLearning, useRemoveLearning } from "../../hooks/queries";
import type { TabProps } from "../../lib/types";

export default function LearningsTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data } = useLearnings(path);
  const addLearning = useAddLearning(path);
  const removeLearning = useRemoveLearning(path);

  const handleAdd = useCallback(
    async (text: string) => {
      await addLearning.mutateAsync(text);
    },
    [addLearning],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      await removeLearning.mutateAsync(index);
    },
    [removeLearning],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        <LearningsPanel
          entries={data?.entries ?? []}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      </div>
    </div>
  );
}
