import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriLearnings } from "../../lib/tauri";

export function useLearnings(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.learnings(agentPath ?? ""),
    queryFn: () => tauriLearnings.load(agentPath!),
    enabled: !!agentPath,
  });
}

export function useAddLearning(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => tauriLearnings.add(agentPath!, text),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.learnings(agentPath) });
    },
  });
}

export function useReplaceLearning(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ index, text }: { index: number; text: string }) =>
      tauriLearnings.replace(agentPath!, index, text),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.learnings(agentPath) });
    },
  });
}

export function useRemoveLearning(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (index: number) => tauriLearnings.remove(agentPath!, index),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.learnings(agentPath) });
    },
  });
}
