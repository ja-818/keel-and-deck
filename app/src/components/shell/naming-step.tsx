import { type FormEvent, useEffect } from "react";
import { DialogTitle, Button, Input, cn } from "@houston-ai/core";
import { ArrowLeft, Check, FolderOpen } from "lucide-react";
import type { AgentDefinition } from "../../lib/types";
import { HoustonHelmet } from "./experience-card";
import { AGENT_COLORS, colorHex, resolveAgentColor } from "../../lib/agent-colors";

interface NamingStepProps {
  selectedAgent: AgentDefinition | undefined;
  name: string;
  color: string | undefined;
  error: string | null;
  existingPath: string | null;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onExistingPathChange: (path: string | null) => void;
  onBack: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function NamingStep({
  selectedAgent,
  name,
  color,
  error,
  existingPath,
  onNameChange,
  onColorChange,
  onExistingPathChange,
  onBack,
  onSubmit,
}: NamingStepProps) {
  // Default to white on mount if none selected
  const resolvedColor = resolveAgentColor(color);

  useEffect(() => {
    if (!color) {
      onColorChange(AGENT_COLORS[0].id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">Name your Agent</DialogTitle>

      {/* Avatar preview */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <div
          className="h-20 w-20 shrink-0 rounded-full flex items-center justify-center transition-colors duration-200 bg-background border-2"
          style={{ borderColor: resolvedColor }}
        >
          <HoustonHelmet color={resolvedColor} size={48} />
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold">
            {selectedAgent?.config.name ?? "New Agent"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a color and name your agent
          </p>
        </div>
      </div>

      {/* Color palette */}
      <div className="flex items-center gap-2 mb-6">
        {AGENT_COLORS.map((c) => {
          const hex = colorHex(c);
          const isSelected = color === c.id || color === c.light || color === c.dark;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onColorChange(c.id)}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150",
                isSelected
                  ? "ring-2 ring-offset-2 ring-foreground/30"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: hex }}
            >
              {isSelected && (
                <Check className="h-3.5 w-3.5 text-white" />
              )}
            </button>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Project Alpha"
          className="text-center rounded-full"
        />

        {/* Link existing project */}
        <div className="flex flex-col items-center gap-1.5">
          {existingPath ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary rounded-full px-3 py-1.5">
              <FolderOpen className="size-3" />
              <span className="truncate max-w-[200px]">{existingPath.split("/").pop()}</span>
              <button
                type="button"
                onClick={() => onExistingPathChange(null)}
                className="text-muted-foreground hover:text-foreground ml-1"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const { tauriAgents } = await import("../../lib/tauri");
                const picked = await tauriAgents.pickDirectory();
                if (picked) {
                  onExistingPathChange(picked);
                  if (!name.trim()) {
                    const folderName = picked.replace(/\/$/, "").split("/").pop() ?? "";
                    onNameChange(folderName);
                  }
                }
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <FolderOpen className="size-3" />
              Link existing project
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
        <Button
          type="submit"
          disabled={!name.trim()}
          className="w-full rounded-full"
        >
          Create Agent
        </Button>
      </form>
    </div>
  );
}
