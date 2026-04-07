import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriSkills } from "../../lib/tauri";

export function useSkills(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.skills(workspacePath ?? ""),
    queryFn: () => tauriSkills.list(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useSkillDetail(workspacePath: string | undefined, name: string | undefined) {
  return useQuery({
    queryKey: queryKeys.skillDetail(workspacePath ?? "", name ?? ""),
    queryFn: () => tauriSkills.load(workspacePath!, name!),
    enabled: !!workspacePath && !!name,
  });
}

export function useCreateSkill(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { name: string; description: string; content: string }) =>
      tauriSkills.create(workspacePath!, args.name, args.description, args.content),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.skills(workspacePath) });
    },
  });
}

export function useSaveSkill(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      tauriSkills.save(workspacePath!, name, content),
    onSuccess: (_data, { name }) => {
      if (workspacePath) {
        qc.invalidateQueries({ queryKey: queryKeys.skills(workspacePath) });
        qc.invalidateQueries({ queryKey: queryKeys.skillDetail(workspacePath, name) });
      }
    },
  });
}

export function useDeleteSkill(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tauriSkills.delete(workspacePath!, name),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.skills(workspacePath) });
    },
  });
}

export function useInstallSkillFromRepo(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (source: string) => tauriSkills.installFromRepo(workspacePath!, source),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.skills(workspacePath) });
    },
  });
}

export function useInstallCommunitySkill(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ source, skillId }: { source: string; skillId: string }) =>
      tauriSkills.installCommunity(workspacePath!, source, skillId),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.skills(workspacePath) });
    },
  });
}

export function useSearchCommunitySkills() {
  return useMutation({
    mutationFn: (query: string) => tauriSkills.searchCommunity(query),
  });
}
