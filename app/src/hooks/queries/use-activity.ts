import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity, tauriAttachments } from "../../lib/tauri";

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
    mutationFn: ({ title, description, agent, worktreePath }: {
      title: string;
      description?: string;
      agent?: string;
      worktreePath?: string;
    }) =>
      tauriActivity.create(agentPath!, title, description, agent, worktreePath),
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
    mutationFn: async (activityId: string) => {
      await tauriActivity.delete(agentPath!, activityId);
      // Wipe any attachments associated with this conversation. Idempotent.
      await tauriAttachments.delete(`activity-${activityId}`).catch(() => {});
    },
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
    },
  });
}
