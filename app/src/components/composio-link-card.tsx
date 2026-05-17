import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useComposioApps } from "../hooks/queries";
import { useComposioConnectionWatcher } from "../hooks/use-composio-connection-watcher";
import { useComposioRefetchOnReturn } from "../hooks/use-composio-refetch-on-return";
import { parseComposioToolkitFromHref } from "../lib/composio-links";
import {
  normalizeToolkitSlug,
  normalizeToolkitSlugs,
} from "../lib/composio-toolkits";
import { queryKeys } from "../lib/query-keys";
import { useUIStore } from "../stores/ui";

/**
 * After clicking Connect, the user goes to the browser to authorize.
 * This is how long we leave the spinner up before flipping to a
 * manual verify button. Short enough that a stuck card recovers
 * quickly; long enough to cover the normal browser round-trip while
 * the engine-side watcher keeps polling in the background.
 */
const OPENING_GRACE_MS = 6_000;

type Phase = "idle" | "opening" | "verify" | "verifying";

interface ComposioLinkCardProps {
  toolkit: string;
  /**
   * True if this toolkit is currently connected in the user's Composio
   * account. Resolved from the shared `useConnectedToolkits` query in
   * the parent (chat-tab / board-tab).
   */
  isConnected: boolean;
  /**
   * Default open-URL handler from the chat's link renderer. Called when
   * the user clicks Connect — opens the authorization URL in the
   * system browser.
   */
  onOpen: () => void;
  onConnectStarted?: (toolkit: string) => void;
}

/**
 * Rich inline card rendered in place of plain markdown links when the
 * agent outputs a Composio connect URL tagged with
 * `#houston_toolkit=<slug>`. Shows the app's logo + name and reflects
 * live connection state:
 *
 *   - Connected → green "Connected" pill, click is a no-op
 *   - Not connected → "Connect" button that opens the OAuth URL,
 *     then offers manual verification if the push update has not
 *     landed after the short grace window.
 */
export function ComposioLinkCard({
  toolkit,
  isConnected,
  onOpen,
  onConnectStarted,
}: ComposioLinkCardProps) {
  const { t } = useTranslation("integrations");
  const [phase, setPhase] = useState<Phase>("idle");
  const [confirmedConnected, setConfirmedConnected] = useState(false);
  const graceTimer = useRef<number | null>(null);
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const markWaitingForAuth = useComposioRefetchOnReturn();
  const { data: apiApps } = useComposioApps();
  const connected = isConnected || confirmedConnected;
  // Ambient freshness: while the card shows "not connected", keep the
  // connectedToolkits query honest so the card flips the instant a
  // connection lands via any path (this Connect, Integrations tab,
  // another agent, CLI, stale cache from a prior session).
  useComposioConnectionWatcher(connected);

  // Once the probe comes back connected, drop any local intermediate
  // state — the parent owns the visual now.
  useEffect(() => {
    if (isConnected) {
      setConfirmedConnected(true);
      setPhase("idle");
      if (graceTimer.current !== null) {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    }
  }, [isConnected]);

  // Always clean up the grace timer on unmount so it never fires
  // against a dead component.
  useEffect(() => {
    return () => {
      if (graceTimer.current !== null) {
        window.clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };
  }, []);

  const app = (() => {
    const fromApi = apiApps?.find((a) => a.toolkit === toolkit);
    if (fromApi) {
      return {
        toolkit: fromApi.toolkit,
        name: fromApi.name,
        description: fromApi.description,
        logoUrl: fromApi.logo_url || fallbackLogo(fromApi.toolkit),
      };
    }
    return {
      toolkit,
      name: toolkit,
      description: t("linkCard.integration"),
      logoUrl: fallbackLogo(toolkit),
    };
  })();

  const handleConnect = useCallback(() => {
    setPhase("opening");
    markWaitingForAuth(toolkit);
    onConnectStarted?.(toolkit);
    onOpen();
    if (graceTimer.current !== null) window.clearTimeout(graceTimer.current);
    graceTimer.current = window.setTimeout(() => {
      setPhase((p) => (p === "opening" ? "verify" : p));
      graceTimer.current = null;
    }, OPENING_GRACE_MS);
  }, [onOpen, markWaitingForAuth, onConnectStarted, toolkit]);

  const handleVerify = useCallback(async () => {
    setPhase("verifying");
    await qc.cancelQueries({ queryKey: queryKeys.connectedToolkits() });
    await qc.refetchQueries({
      queryKey: queryKeys.connectedToolkits(),
      type: "active",
    });
    const target = normalizeToolkitSlug(toolkit);
    const fresh = normalizeToolkitSlugs(
      qc.getQueryData<string[]>(queryKeys.connectedToolkits()) ?? [],
    );
    if (fresh.includes(target)) {
      setConfirmedConnected(true);
      addToast({
        title: t("verifiedToast", { name: app.name }),
        variant: "success",
      });
      setPhase("idle");
      return;
    }
    addToast({
      title: t("notVerified"),
      variant: "info",
    });
    setPhase("verify");
  }, [addToast, app.name, qc, t, toolkit]);

  const renderRightSlot = () => {
    if (connected) {
      return (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium shrink-0">
          <Check className="size-3" />
          {t("linkCard.connected")}
        </span>
      );
    }
    if (phase === "opening") {
      return (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-foreground text-background text-xs font-medium opacity-50 shrink-0"
        >
          <Loader2 className="size-3 animate-spin" />
          {t("connecting")}
        </button>
      );
    }
    if (phase === "verify" || phase === "verifying") {
      return (
        <button
          type="button"
          onClick={phase === "verifying" ? undefined : handleVerify}
          disabled={phase === "verifying"}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-secondary text-foreground text-xs font-medium hover:bg-black/[0.05] transition-colors duration-200 disabled:opacity-50 shrink-0"
        >
          {phase === "verifying" ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              {t("verifying")}
            </>
          ) : (
            <>
              <RefreshCw className="size-3" />
              {t("verify")}
            </>
          )}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={handleConnect}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity duration-200 shrink-0"
      >
        {t("linkCard.connect")}
        <ExternalLink className="size-3" />
      </button>
    );
  };

  return (
    <span className="not-prose inline-flex my-1 max-w-full align-middle">
      <span className="inline-flex items-center gap-3 px-3 py-2.5 rounded-xl border border-black/5 bg-background min-w-0">
        <AppLogo app={app} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[13px] font-medium text-foreground truncate">
            {app.name}
          </span>
          <span className="text-[11px] text-muted-foreground truncate">
            {connected ? t("linkCard.alreadyConnected") : app.description}
          </span>
        </span>
        {renderRightSlot()}
      </span>
    </span>
  );
}

function AppLogo({ app }: { app: { name: string; logoUrl: string } }) {
  const [imgError, setImgError] = useState(false);
  const initial = app.name.charAt(0).toUpperCase();
  if (imgError) {
    return (
      <span className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-muted-foreground">
          {initial}
        </span>
      </span>
    );
  }
  return (
    <img
      src={app.logoUrl}
      alt={app.name}
      className="size-8 rounded-lg object-contain shrink-0"
      onError={() => setImgError(true)}
    />
  );
}

export { parseComposioToolkitFromHref };

function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}
