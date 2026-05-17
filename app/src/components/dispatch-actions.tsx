import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { OrchestrationManifest } from "@houston-ai/engine-client";
import { useQueryClient } from "@tanstack/react-query";
import { DispatchSuggestionCard } from "./dispatch-suggestion-card";
import {
  OrchestrationProgressAction,
  PendingDispatchAction,
} from "./dispatch-status-actions";
import { SaveAgentsCard } from "./save-agents-card";
import { queryKeys } from "../lib/query-keys";
import { tauriOrchestration } from "../lib/tauri";
import {
  buildAdjustDispatchActionId,
  type AdjustAgentIntent,
  type DispatchLinks,
} from "../lib/dispatch-links";
import { useAgentStore } from "../stores/agents";
import { useFeedStore } from "../stores/feeds";

interface DispatchActionsProps {
  dispatch: DispatchLinks;
  workspaceId: string | null;
  parentAgentPath: string;
  parentSessionKey: string;
  orchestration: OrchestrationManifest | null | undefined;
  delegatedCount: number;
  allowAutoRun: boolean;
  dispatchMessageKey: string;
  onRejectCreate: (text: string) => void;
}

export function DispatchActions({
  dispatch,
  workspaceId,
  parentAgentPath,
  parentSessionKey,
  orchestration,
  delegatedCount,
  allowAutoRun,
  dispatchMessageKey,
  onRejectCreate,
}: DispatchActionsProps) {
  const { t } = useTranslation("integrations");
  const pushFeedItem = useFeedStore((state) => state.pushFeedItem);
  const hasOrchestrationAction =
    dispatch.createAgentIntents.length > 0 ||
    dispatch.adjustAgentIntents.length > 0 ||
    dispatch.pendingAction != null;
  const extras = [
    ...dispatch.createAgentIntents.map((intentsJson, index) => (
      <DispatchSuggestionCard
        key={`create-${index}`}
        intentsJson={intentsJson}
        onSendMessage={onRejectCreate}
        workspaceId={workspaceId}
        parentAgentPath={parentAgentPath}
        parentSessionKey={parentSessionKey}
        alreadyCreated={delegatedCount > 0 || orchestration != null}
      />
    )),
    ...dispatch.adjustAgentIntents.map((intent, index) => (
      <AdjustAgentsAction
        key={`adjust-${index}-${intent.adjustment}-${intent.targetNodeIds.join(",")}`}
        intent={intent}
        workspaceId={workspaceId}
        parentAgentPath={parentAgentPath}
        parentSessionKey={parentSessionKey}
        orchestration={orchestration}
        allowAutoRun={allowAutoRun}
        dispatchMessageKey={dispatchMessageKey}
      />
    )),
    dispatch.pendingAction ? (
      <PendingDispatchAction key="pending" action={dispatch.pendingAction} />
    ) : null,
    hasOrchestrationAction && allowAutoRun && orchestration?.status === "running" ? (
      <OrchestrationProgressAction key="progress" orchestration={orchestration} />
    ) : null,
    ...dispatch.saveAgentIntents.map((agentsJson, index) => (
      <SaveAgentsCard
        key={`save-${index}`}
        agentsJson={agentsJson}
        workspaceId={workspaceId}
        parentAgentPath={parentAgentPath}
        parentSessionKey={parentSessionKey}
        dispatchMessageKey={dispatchMessageKey}
        appliedSaveActionIds={orchestration?.appliedSaveActionIds ?? []}
        onSaved={() =>
          pushFeedItem(parentAgentPath, parentSessionKey, {
            feed_type: "assistant_text",
            data: t("saveAgents.savedConversation"),
          })
        }
      />
    )),
  ].filter(Boolean);

  if (extras.length === 0) return null;
  return <span className="not-prose mt-2 flex flex-col gap-2">{extras}</span>;
}

interface AdjustAgentsActionProps {
  intent: AdjustAgentIntent;
  workspaceId: string | null;
  parentAgentPath: string;
  parentSessionKey: string;
  orchestration: OrchestrationManifest | null | undefined;
  allowAutoRun: boolean;
  dispatchMessageKey: string;
}

function AdjustAgentsAction({
  intent,
  workspaceId,
  parentAgentPath,
  parentSessionKey,
  orchestration,
  allowAutoRun,
  dispatchMessageKey,
}: AdjustAgentsActionProps) {
  const { t } = useTranslation("integrations");
  const queryClient = useQueryClient();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const adjustment = intent.adjustment.trim();
  const targetNodeIds = useMemo(
    () => [...intent.targetNodeIds].sort(),
    [intent.targetNodeIds],
  );
  const actionId = useMemo(
    () =>
      buildAdjustDispatchActionId(
        parentAgentPath,
        parentSessionKey,
        intent,
        dispatchMessageKey,
      ),
    [dispatchMessageKey, intent, parentAgentPath, parentSessionKey],
  );
  const actionAlreadyApplied =
    orchestration?.appliedDispatchActionIds?.includes(actionId) ?? false;
  const alreadyApplied =
    actionAlreadyApplied ||
    (orchestration?.currentAdjustment?.trim() === adjustment &&
      sameTargets(orchestration.currentAdjustmentTargets ?? [], targetNodeIds) &&
      orchestration.status !== "error");

  useEffect(() => {
    if (
      !workspaceId ||
      !adjustment ||
      !orchestration ||
      orchestration.status === "running" ||
      alreadyApplied ||
      !allowAutoRun ||
      startedRef.current
    ) {
      return;
    }
    startedRef.current = true;
    setError(null);
    tauriOrchestration
      .adjustAndRun(
        workspaceId,
        parentAgentPath,
        parentSessionKey,
        adjustment,
        targetNodeIds,
        actionId,
      )
      .then(async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.orchestrationStatus(parentAgentPath, parentSessionKey),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations(parentAgentPath),
          }),
        ]);
        await useAgentStore.getState().loadAgents(workspaceId, { silent: true });
      })
      .catch((err) => {
        setError(String(err));
      });
  }, [
    alreadyApplied,
    allowAutoRun,
    adjustment,
    actionId,
    orchestration,
    parentAgentPath,
    parentSessionKey,
    queryClient,
    targetNodeIds,
    workspaceId,
  ]);

  if (alreadyApplied) return null;
  if (!allowAutoRun) return null;

  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-black/5 bg-background text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {error ??
          (orchestration?.status === "running"
            ? t("dispatch.waitingForAgents")
            : t("dispatch.adjusting"))}
      </span>
    </span>
  );
}

function sameTargets(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  return sortedLeft.every((target, index) => target === right[index]);
}
