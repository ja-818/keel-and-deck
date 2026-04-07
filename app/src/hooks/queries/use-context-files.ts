import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";

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

async function loadContextFiles(agentPath: string): Promise<ContextFiles> {
  const [claudeMd, systemPrompt, selfImprovement] = await Promise.all([
    tauriAgent.readFile(agentPath, CONTEXT_FILE_NAMES.claudeMd).catch(() => ""),
    tauriAgent.readFile(agentPath, CONTEXT_FILE_NAMES.systemPrompt).catch(() => ""),
    tauriAgent.readFile(agentPath, CONTEXT_FILE_NAMES.selfImprovement).catch(() => ""),
  ]);
  return { claudeMd, systemPrompt, selfImprovement };
}

export function useContextFiles(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contextFiles(agentPath ?? ""),
    queryFn: () => loadContextFiles(agentPath!),
    enabled: !!agentPath,
  });
}

export function useSaveContextFile(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      tauriAgent.writeFile(agentPath!, name, content),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.contextFiles(agentPath) });
    },
  });
}

export { CONTEXT_FILE_NAMES };
