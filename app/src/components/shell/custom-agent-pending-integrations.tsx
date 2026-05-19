import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X, Check } from "lucide-react";
import type { StackEntry } from "@houston-ai/engine-client";
import { useConnectedToolkits } from "../../hooks/queries";
import { tauriConnections, tauriSystem } from "../../lib/tauri";
import { useComposioRefetchOnReturn } from "../../hooks/use-composio-refetch-on-return";
import { useUIStore } from "../../stores/ui";
import {
  readPendingStackIntegrations,
  writePendingStackIntegrations,
} from "../../lib/pending-stack-integrations";

interface Props {
  agentPath: string;
}

const PENDING_QUERY_KEY = (agentPath: string) => [
  "pending-stack-integrations",
  agentPath,
];

/**
 * Card mounted on top of the agent's workspace surface when the user
 * just finished the custom-agent creation flow. Lists the toolkits the
 * agent's stack declared but the user hasn't connected yet. Clicking
 * Connect opens the OAuth flow in the browser; the panel reconciles
 * against the live connected-toolkits list and removes rows as
 * connections land.
 *
 * Persistence: the list lives at `.houston/pending-stack-integrations
 * .json` inside the agent folder so it survives app reloads. The file
 * is rewritten on every reconciliation (and gets `entries: []` when
 * everything is connected); the panel hides itself when entries are
 * empty so a stale empty file is harmless.
 */
export function CustomAgentPendingIntegrations({ agentPath }: Props) {
  const { t } = useTranslation("shell");
  const qc = useQueryClient();
  const { data: entries } = useQuery({
    queryKey: PENDING_QUERY_KEY(agentPath),
    queryFn: () => readPendingStackIntegrations(agentPath),
    staleTime: Infinity,
  });
  const { data: connectedSlugs } = useConnectedToolkits(true);
  const markWaitingForAuth = useComposioRefetchOnReturn();
  const addToast = useUIStore((s) => s.addToast);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  // Reconcile against the live connected set: when EVERY entry in the
  // file is already connected, clear the file (panel disappears). If
  // some are still pending, keep all entries in place — we want the
  // user to see "GitHub ✓ Connected · Trello [Connect]" so they have
  // context about the full stack their agent uses, not just the few
  // that happen to be unconnected.
  useEffect(() => {
    if (!entries || entries.length === 0 || !connectedSlugs) return;
    const allConnected = entries.every((e) =>
      connectedSlugs.includes(e.toolkit),
    );
    if (allConnected) {
      writePendingStackIntegrations(agentPath, [])
        .then(() => {
          qc.setQueryData(PENDING_QUERY_KEY(agentPath), []);
        })
        .catch((err) => {
          console.error("[pendingIntegrations] write failed", err);
        });
    }
  }, [entries, connectedSlugs, agentPath, qc]);

  if (!entries || entries.length === 0) return null;

  const handleConnect = async (toolkit: string) => {
    setConnectingSlug(toolkit);
    try {
      const { redirect_url } = await tauriConnections.connectApp(toolkit);
      tauriSystem.openUrl(redirect_url);
      markWaitingForAuth(toolkit);
    } catch (err) {
      addToast({
        title: t("customAgent.connectFailed", { name: toolkit }),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setConnectingSlug(null);
    }
  };

  const handleDismiss = async () => {
    await writePendingStackIntegrations(agentPath, []);
    qc.setQueryData(PENDING_QUERY_KEY(agentPath), []);
  };

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {t("customAgent.pendingTitle")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("customAgent.pendingHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-background/60 text-muted-foreground"
          aria-label="dismiss"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {entries.map((entry) => (
          <PendingRow
            key={entry.toolkit}
            entry={entry}
            connectedSlugs={connectedSlugs ?? []}
            connecting={connectingSlug === entry.toolkit}
            onConnect={handleConnect}
          />
        ))}
      </ul>
    </div>
  );
}

function PendingRow({
  entry,
  connectedSlugs,
  connecting,
  onConnect,
}: {
  entry: StackEntry;
  connectedSlugs: string[];
  connecting: boolean;
  onConnect: (slug: string) => void;
}) {
  const { t } = useTranslation("shell");
  const [imgError, setImgError] = useState(false);
  const isConnected = connectedSlugs.includes(entry.toolkit);
  const initial = entry.name.charAt(0).toUpperCase();

  return (
    <li className="flex items-center gap-3 rounded-xl bg-background border border-border px-3 py-2">
      <div className="flex-shrink-0 size-8 rounded-lg bg-secondary flex items-center justify-center overflow-hidden">
        {!imgError && entry.logoUrl ? (
          <img
            src={entry.logoUrl}
            alt={entry.name}
            className="size-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-sm font-medium text-muted-foreground">
            {initial}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {entry.name}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {entry.role}
        </p>
      </div>

      {isConnected ? (
        <span className="inline-flex items-center gap-1 h-7 px-2 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
          <Check className="size-3" />
          {t("customAgent.pendingAlreadyConnected")}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onConnect(entry.toolkit)}
          disabled={connecting}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-border bg-background text-foreground text-xs font-medium hover:bg-secondary disabled:opacity-50"
        >
          {connecting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            t("customAgent.pendingConnect")
          )}
        </button>
      )}
    </li>
  );
}
