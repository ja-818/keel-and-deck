import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity } from "../../lib/tauri";

export function useActivity(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activity(agentPath ?? ""),
    queryFn: () => tauriActivity.list(agentPath!),
    enabled: !!agentPath,
  });
}

export function useCreateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, description }: { title: string; description?: string }) =>
      tauriActivity.create(agentPath!, title, description),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

export function useUpdateActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, update }: { activityId: string; update: { status?: string; title?: string; description?: string } }) =>
      tauriActivity.update(agentPath!, activityId, update),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}

export function useDeleteActivity(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: string) => tauriActivity.delete(agentPath!, activityId),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}
