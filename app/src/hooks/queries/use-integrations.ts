import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";

export function useAgentIntegrations(agentPath: string) {
  return useQuery({
    queryKey: queryKeys.integrations(agentPath),
    queryFn: () => tauriIntegrations.list(agentPath),
  });
}
