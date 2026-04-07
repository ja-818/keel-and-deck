import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriFiles } from "../../lib/tauri";

export function useFiles(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.files(workspacePath ?? ""),
    queryFn: () => tauriFiles.list(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useDeleteFile(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relativePath: string) => tauriFiles.delete(workspacePath!, relativePath),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.files(workspacePath) });
    },
  });
}

export function useRenameFile(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ relativePath, newName }: { relativePath: string; newName: string }) =>
      tauriFiles.rename(workspacePath!, relativePath, newName),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.files(workspacePath) });
    },
  });
}

export function useCreateFolder(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tauriFiles.createFolder(workspacePath!, name),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.files(workspacePath) });
    },
  });
}
