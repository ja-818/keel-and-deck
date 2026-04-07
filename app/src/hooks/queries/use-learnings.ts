import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriLearnings } from "../../lib/tauri";

export function useLearnings(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.learnings(workspacePath ?? ""),
    queryFn: () => tauriLearnings.load(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useAddLearning(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => tauriLearnings.add(workspacePath!, text),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.learnings(workspacePath) });
    },
  });
}

export function useReplaceLearning(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ index, text }: { index: number; text: string }) =>
      tauriLearnings.replace(workspacePath!, index, text),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.learnings(workspacePath) });
    },
  });
}

export function useRemoveLearning(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (index: number) => tauriLearnings.remove(workspacePath!, index),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.learnings(workspacePath) });
    },
  });
}
