import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriTasks } from "../../lib/tauri";

export function useTasks(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks(workspacePath ?? ""),
    queryFn: () => tauriTasks.list(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useCreateTask(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, description }: { title: string; description?: string }) =>
      tauriTasks.create(workspacePath!, title, description),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.tasks(workspacePath) });
    },
  });
}

export function useUpdateTask(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, update }: { taskId: string; update: { status?: string; title?: string; description?: string } }) =>
      tauriTasks.update(workspacePath!, taskId, update),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.tasks(workspacePath) });
    },
  });
}

export function useDeleteTask(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tauriTasks.delete(workspacePath!, taskId),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.tasks(workspacePath) });
    },
  });
}
