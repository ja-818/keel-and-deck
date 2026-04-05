import { useState, useEffect, useCallback } from "react";
import { LearningsPanel } from "@houston-ai/memory";
import type { LearningEntry } from "@houston-ai/memory";
import { tauriLearnings } from "../lib/tauri";

interface LearningsTabProps {
  workspacePath: string;
}

export function LearningsTab({ workspacePath }: LearningsTabProps) {
  const [entries, setEntries] = useState<LearningEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await tauriLearnings.load(workspacePath);
      setEntries(result.entries);
    } catch (e) {
      console.error("[learnings] Failed to load:", e);
    }
  }, [workspacePath]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (text: string) => {
    try {
      await tauriLearnings.add(workspacePath, text);
      await load();
    } catch (e) {
      console.error("[learnings] Failed to add entry:", e);
    }
  };

  const handleRemove = async (index: number) => {
    try {
      await tauriLearnings.remove(workspacePath, index);
      await load();
    } catch (e) {
      console.error("[learnings] Failed to remove entry:", e);
    }
  };

  return (
    <LearningsPanel
      entries={entries}
      onAdd={handleAdd}
      onRemove={handleRemove}
    />
  );
}
