import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriConnections } from "../../lib/tauri";

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.connections(),
    queryFn: () => tauriConnections.list(),
    // Auth-state-sensitive query: its result depends on whether a valid
    // Composio token exists. If we refetch on window focus, a fetch can
    // start mid-OAuth (before the token is stored) and resolve with a stale
    // `needs_auth` that then races with — and overwrites — our explicit
    // post-auth reset. We invalidate explicitly after auth, connect, etc.
    refetchOnWindowFocus: false,
  });
}

export function useComposioApps() {
  return useQuery({
    queryKey: ["composio-apps"],
    queryFn: () => tauriConnections.listApps(),
    staleTime: 1000 * 60 * 60,
  });
}

export function useInvalidateConnections() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.connections() });
}

export function useResetConnections() {
  const qc = useQueryClient();
  return async () => {
    // Cancel any in-flight fetch first. `resetQueries` alone does NOT cancel
    // active fetches — it dedupes against them. If a fetch started before
    // OAuth completed (stale auth state), its result would win the race and
    // overwrite our reset. Cancelling discards that result.
    await qc.cancelQueries({ queryKey: queryKeys.connections() });
    await qc.resetQueries({ queryKey: queryKeys.connections() });
  };
}
