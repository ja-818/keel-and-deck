import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriConnections } from "../../lib/tauri";

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.connections(),
    queryFn: () => tauriConnections.list(),
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
  return () => qc.resetQueries({ queryKey: queryKeys.connections() });
}
