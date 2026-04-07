import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriWorkspace } from "../../lib/tauri";

interface ContextFiles {
  claudeMd: string;
  systemPrompt: string;
  selfImprovement: string;
}

const CONTEXT_FILE_NAMES = {
  claudeMd: "CLAUDE.md",
  systemPrompt: ".houston/prompts/system.md",
  selfImprovement: ".houston/prompts/self-improvement.md",
} as const;

async function loadContextFiles(workspacePath: string): Promise<ContextFiles> {
  const [claudeMd, systemPrompt, selfImprovement] = await Promise.all([
    tauriWorkspace.readFile(workspacePath, CONTEXT_FILE_NAMES.claudeMd).catch(() => ""),
    tauriWorkspace.readFile(workspacePath, CONTEXT_FILE_NAMES.systemPrompt).catch(() => ""),
    tauriWorkspace.readFile(workspacePath, CONTEXT_FILE_NAMES.selfImprovement).catch(() => ""),
  ]);
  return { claudeMd, systemPrompt, selfImprovement };
}

export function useContextFiles(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contextFiles(workspacePath ?? ""),
    queryFn: () => loadContextFiles(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useSaveContextFile(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      tauriWorkspace.writeFile(workspacePath!, name, content),
    onSuccess: () => {
      if (workspacePath) qc.invalidateQueries({ queryKey: queryKeys.contextFiles(workspacePath) });
    },
  });
}

export { CONTEXT_FILE_NAMES };
