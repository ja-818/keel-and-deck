import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriChannels } from "../../lib/tauri";

export function useChannels(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.channels(workspacePath ?? ""),
    queryFn: () => tauriChannels.list(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useAddChannel(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { channel_type: string; name: string; token: string }) =>
      tauriChannels.add(workspacePath!, input),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.channels(workspacePath) });
    },
  });
}

export function useRemoveChannel(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => tauriChannels.remove(workspacePath!, channelId),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.channels(workspacePath) });
    },
  });
}
