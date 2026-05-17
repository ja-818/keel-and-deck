import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Bot, ChevronRight, Loader2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  decodeCreateAgentIntents,
  type DispatchAgentIntent,
} from "../lib/dispatch-links";
import { useAgentStore } from "../stores/agents";
import { tauriOrchestration } from "../lib/tauri";
import { queryKeys } from "../lib/query-keys";

interface DispatchSuggestionCardProps {
  /** URL-encoded JSON array of agent intents from the assistant's link. */
  intentsJson: string;
  /** Callback to send a message to the assistant (for the Reject path). */
  onSendMessage: (text: string) => void;
  workspaceId: string | null;
  parentAgentPath: string;
  parentSessionKey: string;
  alreadyCreated?: boolean;
}

export function DispatchSuggestionCard({
  intentsJson,
  onSendMessage,
  workspaceId,
  parentAgentPath,
  parentSessionKey,
  alreadyCreated = false,
}: DispatchSuggestionCardProps) {
  const { t } = useTranslation("integrations");
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const intents: DispatchAgentIntent[] = decodeCreateAgentIntents(intentsJson);

  const handleAccept = useCallback(async () => {
    if (intents.length === 0 || !workspaceId) return;
    setPhase("creating");
    setError(null);
    try {
      await tauriOrchestration.createAndRun(
        workspaceId,
        parentAgentPath,
        parentSessionKey,
        intents,
      );
      setPhase("done");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.orchestrationStatus(parentAgentPath, parentSessionKey),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(parentAgentPath),
      });
      await useAgentStore.getState().loadAgents(workspaceId, { silent: true });
    } catch (e) {
      setPhase("error");
      setError(String(e));
    }
  }, [intents, parentAgentPath, parentSessionKey, queryClient, workspaceId]);

  const handleReject = useCallback(() => {
    onSendMessage(t("dispatch.rejectPrompt"));
  }, [onSendMessage, t]);

  if (intents.length === 0) return null;

  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex flex-col gap-3 px-4 py-3 rounded-xl border border-black/5 bg-background min-w-0 w-full max-w-lg">
        <span className="flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground shrink-0" />
          <span className="text-[13px] font-medium text-foreground">
            {t("dispatch.suggestionTitle", { count: intents.length })}
          </span>
        </span>

        <span className="space-y-1.5" role="list">
          {intents.map((intent, i) => (
            <span key={i} className="flex items-start gap-2 text-[12px]" role="listitem">
              <ChevronRight className="size-3 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                <span className="font-medium text-foreground">{intent.name}</span>
                <span className="text-muted-foreground block truncate max-w-[300px]">
                  {intent.taskPrompt.slice(0, 100)}…
                </span>
              </span>
            </span>
          ))}
        </span>

        <span className="text-[11px] text-muted-foreground">
          {t("dispatch.tokenNote")}
        </span>

        {(alreadyCreated || phase === "done") && (
          <span className="text-xs text-emerald-600 font-medium">
            {t("dispatch.created")}
          </span>
        )}

        {!alreadyCreated && phase === "idle" && (
          <span className="flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              disabled={!workspaceId}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Bot className="size-3.5" />
              {t("dispatch.accept")}
            </button>
            <button
              type="button"
              onClick={handleReject}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-border bg-background text-foreground text-xs font-medium hover:bg-secondary transition-colors"
            >
              <X className="size-3.5" />
              {t("dispatch.reject")}
            </button>
          </span>
        )}

        {phase === "creating" && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("dispatch.creating")}
          </span>
        )}

        {!alreadyCreated && phase === "error" && (
          <span className="text-xs text-red-500">{error ?? t("dispatch.error")}</span>
        )}
      </span>
    </span>
  );
}
