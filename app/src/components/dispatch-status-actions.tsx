import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import type { OrchestrationManifest } from "@houston-ai/engine-client";

export function PendingDispatchAction({
  action,
}: {
  action: "create" | "adjust" | "save";
}) {
  const { t } = useTranslation("integrations");
  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-black/5 bg-background text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {action === "create"
          ? t("dispatch.preparingAgents")
          : action === "adjust"
            ? t("dispatch.preparingAdjustment")
            : t("dispatch.preparingSave")}
      </span>
    </span>
  );
}

export function OrchestrationProgressAction({
  orchestration,
}: {
  orchestration: OrchestrationManifest;
}) {
  const { t } = useTranslation("integrations");
  const done = orchestration.nodes.filter((node) => node.status === "done").length;
  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-black/5 bg-background text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t("dispatch.agentsWorking", {
          done,
          total: orchestration.nodes.length,
        })}
      </span>
    </span>
  );
}
