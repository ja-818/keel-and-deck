import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/query-keys";

const HEARTBEAT_MS = 10_000;

/**
 * Keeps the `connectedToolkits` query fresh while a Composio card is
 * showing "not connected", so the card flips to "Connected" the moment
 * the connection appears regardless of where it was made (this card's
 * Connect button, the Integrations tab, another agent, the CLI, or a
 * prior session whose cache is now stale).
 *
 * Mechanics:
 *   - Invalidate immediately on mount / on transition to not-connected.
 *   - Invalidate on window focus and on tab visibility return.
 *   - Heartbeat invalidate every 10s while the document is visible.
 *   - Stops fully once `isConnected` flips true (or on unmount).
 *
 * TanStack dedupes the underlying fetch across observers, so N visible
 * not-connected cards still produce 1 in-flight request per tick.
 */
export function useComposioConnectionWatcher(isConnected: boolean): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (isConnected) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: queryKeys.connectedToolkits() });
    };

    invalidate();

    const onFocus = () => invalidate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") invalidate();
    }, HEARTBEAT_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(heartbeat);
    };
  }, [isConnected, qc]);
}
