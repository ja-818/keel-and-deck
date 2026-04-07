import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriChannels } from "../../lib/tauri";

export function useChannels(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.channels(agentPath ?? ""),
    queryFn: () => tauriChannels.list(agentPath!),
    enabled: !!agentPath,
  });
}

export function useAddChannel(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { channel_type: string; name: string; token: string }) =>
      tauriChannels.add(agentPath!, input),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.channels(agentPath) });
    },
  });
}

export function useRemoveChannel(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => tauriChannels.remove(agentPath!, channelId),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.channels(agentPath) });
    },
  });
}
