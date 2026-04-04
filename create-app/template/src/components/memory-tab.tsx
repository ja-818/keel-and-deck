import { useState, useEffect, useCallback } from "react";
import { Button } from "@deck-ui/core";
import { Trash2, Plus } from "lucide-react";
import { tauriMemory } from "../lib/tauri";
import type { MemorySnapshot } from "../lib/types";

interface MemoryTabProps {
  workspacePath: string;
}

export function MemoryTab({ workspacePath }: MemoryTabProps) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const [newAgentText, setNewAgentText] = useState("");
  const [newUserText, setNewUserText] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await tauriMemory.load(workspacePath);
      setSnapshot(data);
    } catch (e) {
      console.error("[memory] Failed to load:", e);
    }
  }, [workspacePath]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (target: "agent" | "user", text: string) => {
    if (!text.trim()) return;
    try {
      await tauriMemory.addEntry(workspacePath, target, text.trim());
      if (target === "agent") setNewAgentText("");
      else setNewUserText("");
      await load();
    } catch (e) {
      console.error("[memory] Failed to add entry:", e);
    }
  };

  const handleRemove = async (target: "agent" | "user", index: number) => {
    try {
      await tauriMemory.removeEntry(workspacePath, target, index);
      await load();
    } catch (e) {
      console.error("[memory] Failed to remove entry:", e);
    }
  };

  if (!snapshot) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <MemorySection
        title="Agent Notes"
        description="What the agent remembers about the environment, tools, and conventions."
        entries={snapshot.agent_entries}
        chars={snapshot.agent_chars}
        limit={snapshot.agent_limit}
        newText={newAgentText}
        onNewTextChange={setNewAgentText}
        onAdd={(text) => handleAdd("agent", text)}
        onRemove={(index) => handleRemove("agent", index)}
      />
      <MemorySection
        title="User Profile"
        description="What the agent knows about you: preferences, role, communication style."
        entries={snapshot.user_entries}
        chars={snapshot.user_chars}
        limit={snapshot.user_limit}
        newText={newUserText}
        onNewTextChange={setNewUserText}
        onAdd={(text) => handleAdd("user", text)}
        onRemove={(index) => handleRemove("user", index)}
      />
    </div>
  );
}

interface MemorySectionProps {
  title: string;
  description: string;
  entries: { index: number; text: string }[];
  chars: number;
  limit: number;
  newText: string;
  onNewTextChange: (text: string) => void;
  onAdd: (text: string) => void;
  onRemove: (index: number) => void;
}

function MemorySection({
  title,
  description,
  entries,
  chars,
  limit,
  newText,
  onNewTextChange,
  onAdd,
  onRemove,
}: MemorySectionProps) {
  const percent = limit > 0 ? Math.round((chars / limit) * 100) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {percent}% ({chars.toLocaleString()}/{limit.toLocaleString()} chars)
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic mb-3">
          No entries yet. The agent will save notes here as it learns.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {entries.map((entry) => (
            <li
              key={entry.index}
              className="flex items-start gap-2 text-sm group"
            >
              <span className="flex-1 bg-secondary rounded-lg px-3 py-2">
                {entry.text}
              </span>
              <button
                onClick={() => onRemove(entry.index)}
                className="shrink-0 mt-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Remove entry"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => onNewTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd(newText);
          }}
          placeholder="Add an entry..."
          className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={() => onAdd(newText)}
          disabled={!newText.trim()}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}
