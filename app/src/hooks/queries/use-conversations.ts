import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriConversations, tauriChat } from "../../lib/tauri";

export function useConversations(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations(workspacePath ?? ""),
    queryFn: () => tauriConversations.list(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useAllConversations(workspacePaths: string[]) {
  return useQuery({
    queryKey: queryKeys.allConversations(workspacePaths),
    queryFn: () => tauriConversations.listAll(workspacePaths),
    enabled: workspacePaths.length > 0,
  });
}

export function useChatHistory(workspacePath: string | undefined, sessionKey: string | undefined) {
  return useQuery({
    queryKey: queryKeys.chatHistory(workspacePath ?? "", sessionKey ?? ""),
    queryFn: () => tauriChat.loadHistory(workspacePath!, sessionKey),
    enabled: !!workspacePath && !!sessionKey,
  });
}
