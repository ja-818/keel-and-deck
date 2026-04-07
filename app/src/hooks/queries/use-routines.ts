import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriRoutines } from "../../lib/tauri";

export function useRoutines(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.routines(agentPath!),
    queryFn: () => tauriRoutines.list(agentPath!),
    enabled: !!agentPath,
  });
}

export function useRoutineRuns(agentPath: string | undefined, routineId?: string) {
  return useQuery({
    queryKey: queryKeys.routineRuns(agentPath!, routineId),
    queryFn: () => tauriRoutines.listRuns(agentPath!, routineId),
    enabled: !!agentPath,
  });
}

export function useCreateRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      prompt: string;
      schedule: string;
      enabled?: boolean;
      suppress_when_silent?: boolean;
    }) => tauriRoutines.create(agentPath, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
      // Sync the scheduler so new routine gets registered
      tauriRoutines.syncScheduler().catch(console.error);
    },
  });
}

export function useUpdateRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      routineId,
      updates,
    }: {
      routineId: string;
      updates: {
        name?: string;
        description?: string;
        prompt?: string;
        schedule?: string;
        enabled?: boolean;
        suppress_when_silent?: boolean;
      };
    }) => tauriRoutines.update(agentPath, routineId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
      tauriRoutines.syncScheduler().catch(console.error);
    },
  });
}

export function useDeleteRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) => tauriRoutines.delete(agentPath, routineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
      tauriRoutines.syncScheduler().catch(console.error);
    },
  });
}

export function useRunRoutineNow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) => tauriRoutines.runNow(agentPath, routineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine-runs", agentPath] });
    },
  });
}
