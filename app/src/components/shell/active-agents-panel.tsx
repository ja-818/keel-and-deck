import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Check, AlertCircle, Clock3, Ban, X } from "lucide-react";
import { AgentPanelAvatar } from "./agent-panel-avatar";
import { useAgentStore } from "../../stores/agents";
import type { RawConversation } from "../../lib/tauri";

interface ActiveAgentsPanelProps {
  conversations: RawConversation[];
  onClose?: () => void;
}

type ActivityStatus =
  | "waiting"
  | "running"
  | "needs_you"
  | "done"
  | "error"
  | "blocked"
  | "cancelled";

export function ActiveAgentsPanel({ conversations, onClose }: ActiveAgentsPanelProps) {
  const { t } = useTranslation("shell");
  const agents = useAgentStore((s) => s.agents);

  const items = useMemo(() => {
    const sorted = [...conversations].sort((a, b) => {
      const order: Record<ActivityStatus, number> = {
        waiting: 0,
        running: 1,
        needs_you: 2,
        blocked: 3,
        error: 4,
        cancelled: 5,
        done: 6,
      };
      const aStatus = (a.status ?? "done") as ActivityStatus;
      const bStatus = (b.status ?? "done") as ActivityStatus;
      return (order[aStatus] ?? 99) - (order[bStatus] ?? 99);
    });
    return sorted;
  }, [conversations]);

  if (items.length === 0) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "waiting":
        return <Clock3 className="size-3 text-muted-foreground" />;
      case "running":
        return (
          <span className="size-2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
        );
      case "needs_you":
        return (
          <span className="size-2 rounded-full bg-[#e0ac00] animate-pulse" />
        );
      case "done":
        return <Check className="size-3 text-[#00a240]" />;
      case "blocked":
      case "cancelled":
        return <Ban className="size-3 text-muted-foreground" />;
      default:
        return <AlertCircle className="size-3 text-[#e02e2a]" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "waiting":
        return t("beginner.statusWaiting");
      case "running":
        return t("beginner.statusRunning");
      case "done":
        return t("beginner.statusDone");
      case "needs_you":
        return t("beginner.statusNeedsYou");
      case "blocked":
        return t("beginner.statusBlocked");
      case "cancelled":
        return t("beginner.statusCancelled");
      case "error":
        return t("beginner.statusError");
      default:
        return status;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden border-l border-black/5">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-black/5">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">
            {t("beginner.activeAgents")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("beginner.activeAgentsCount", { count: items.length })}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label={t("beginner.hideActiveAgents")}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        <AnimatePresence mode="popLayout">
          {items.map((item) => {
            const agent = agents.find((a) => a.folderPath === item.agent_path);
            const status = (item.status ?? "done") as ActivityStatus;
            return (
              <motion.div
                key={`${item.agent_path}-${item.id}`}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-background border border-black/5"
              >
                <AgentPanelAvatar
                  color={agent?.color}
                  running={status === "running"}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {item.title ?? item.id}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {agent?.name ?? item.agent_path}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {getStatusIcon(status)}
                  <span className="text-[11px] text-muted-foreground">
                    {getStatusLabel(status)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
