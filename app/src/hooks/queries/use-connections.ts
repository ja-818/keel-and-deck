import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriConnections } from "../../lib/tauri";

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.connections(),
    queryFn: () => tauriConnections.list(),
  });
}

export function useInvalidateConnections() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.connections() });
}
