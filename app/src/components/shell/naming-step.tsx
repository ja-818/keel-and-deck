import type { FormEvent } from "react";
import { DialogTitle, Button, Input } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";
import type { AgentDefinition } from "../../lib/types";
import { getAgentIcon, getAgentIconStyle } from "./experience-card";

interface NamingStepProps {
  selectedAgent: AgentDefinition | undefined;
  name: string;
  error: string | null;
  onNameChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function NamingStep({
  selectedAgent,
  name,
  error,
  onNameChange,
  onBack,
  onSubmit,
}: NamingStepProps) {
  const Icon = getAgentIcon(selectedAgent?.config.icon);
  const style = getAgentIconStyle(selectedAgent?.config.icon);

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">Name your Agent</DialogTitle>

      {selectedAgent && (
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${style.bg}`}>
            <Icon className={`h-7 w-7 ${style.fg}`} />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">{selectedAgent.config.name}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Name your new Agent
            </p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Project Alpha"
          className="text-center rounded-full"
        />
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
