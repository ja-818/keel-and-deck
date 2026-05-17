import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Save, X } from "lucide-react";
import {
  buildSaveDispatchActionId,
  decodeSaveAgentIntents,
  type SaveAgentIntent,
} from "../lib/dispatch-links";
import { tauriOrchestration } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";

interface SaveAgentsCardProps {
  agentsJson: string;
  workspaceId: string | null;
  parentAgentPath: string;
  parentSessionKey: string;
  dispatchMessageKey: string;
  appliedSaveActionIds: string[];
  onSaved?: () => void;
}

export function SaveAgentsCard({
  agentsJson,
  workspaceId,
  parentAgentPath,
  parentSessionKey,
  dispatchMessageKey,
  appliedSaveActionIds,
  onSaved,
}: SaveAgentsCardProps) {
  const { t } = useTranslation("integrations");
  const savedAgents = useAgentStore((state) => state.agents);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const agents = decodeSaveAgentIntents(agentsJson);
    return new Set(agents.map((agent) => agent.agentPath));
  });
  const [phase, setPhase] = useState<"idle" | "saving" | "done" | "skipped" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const agents: SaveAgentIntent[] = useMemo(
    () => decodeSaveAgentIntents(agentsJson),
    [agentsJson],
  );
  const savedAgentPaths = useMemo(
    () =>
      new Set(
        savedAgents
          .filter((agent) => !agent.temporary)
          .map((agent) => agent.folderPath),
      ),
    [savedAgents],
  );
  const actionId = useMemo(
    () =>
      buildSaveDispatchActionId(
        parentAgentPath,
        parentSessionKey,
        agents,
        dispatchMessageKey,
      ),
    [agents, dispatchMessageKey, parentAgentPath, parentSessionKey],
  );
  const alreadySaved = appliedSaveActionIds.includes(actionId);
  const allAgentsAlreadySaved =
    agents.length > 0 &&
    agents.every((agent) => savedAgentPaths.has(agent.agentPath));

  if (agents.length === 0) return null;

  const toggleAgent = (agentPath: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(agentPath)) {
        next.delete(agentPath);
      } else {
        next.add(agentPath);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!workspaceId || selected.size === 0) return;
    setPhase("saving");
    setError(null);
    try {
      await tauriOrchestration.saveAgents(workspaceId, [...selected], {
        parentAgentPath,
        parentSessionKey,
        actionId,
      });
      await useAgentStore.getState().loadAgents(workspaceId, { silent: true });
      setPhase("done");
      onSaved?.();
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex flex-col gap-3 px-4 py-3 rounded-xl border border-black/5 bg-background min-w-0 w-full max-w-lg">
        <span className="flex items-center gap-2">
          <Save className="size-4 text-muted-foreground shrink-0" />
          <span className="text-[13px] font-medium text-foreground">
            {t("saveAgents.title")}
          </span>
        </span>

        <span className="text-[12px] text-muted-foreground">
          {t("saveAgents.body")}
        </span>

        <span className="space-y-1.5" role="list">
          {agents.map((agent) => (
            <label
              key={agent.agentPath}
              className="flex items-center gap-2 text-[12px] text-foreground"
              role="listitem"
            >
              <input
                type="checkbox"
                checked={alreadySaved || allAgentsAlreadySaved || selected.has(agent.agentPath)}
                disabled={
                  alreadySaved ||
                  allAgentsAlreadySaved ||
                  (phase !== "idle" && phase !== "error")
                }
                onChange={() => toggleAgent(agent.agentPath)}
                className="size-3.5 rounded border-black/15 accent-foreground"
              />
              <span className="truncate">{agent.name}</span>
            </label>
          ))}
        </span>

        {!alreadySaved && !allAgentsAlreadySaved && (phase === "idle" || phase === "error") ? (
          <span className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!workspaceId || selected.size === 0}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <Save className="size-3.5" />
              {t("saveAgents.accept")}
            </button>
            <button
              type="button"
              onClick={() => setPhase("skipped")}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-border bg-background text-foreground text-xs font-medium hover:bg-secondary transition-colors"
            >
              <X className="size-3.5" />
              {t("saveAgents.reject")}
            </button>
          </span>
        ) : null}

        {!alreadySaved && !allAgentsAlreadySaved && phase === "saving" && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("saveAgents.saving")}
          </span>
        )}

        {(alreadySaved || allAgentsAlreadySaved || phase === "done") && (
          <span className="flex flex-col gap-1 text-xs text-[#00a240] font-medium">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5" />
              {t("saveAgents.saved")}
            </span>
            <span className="text-muted-foreground font-normal">
              {t("saveAgents.savedDetail")}
            </span>
          </span>
        )}

        {!alreadySaved && !allAgentsAlreadySaved && phase === "skipped" && (
          <span className="text-xs text-muted-foreground">
            {t("saveAgents.skipped")}
          </span>
        )}

        {!alreadySaved && !allAgentsAlreadySaved && phase === "error" && (
          <span className="text-xs text-[#e02e2a]">{error ?? t("saveAgents.error")}</span>
        )}
      </span>
    </span>
  );
}
