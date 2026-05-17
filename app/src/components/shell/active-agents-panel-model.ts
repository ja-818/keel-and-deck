import type { RawConversation } from "../../lib/tauri";

export interface MissionContext {
  agentPath: string | null;
  sessionKey: string | null;
}

export function conversationsForMission(
  conversations: RawConversation[] | undefined,
  context: MissionContext,
): RawConversation[] {
  const { agentPath, sessionKey } = context;
  if (!conversations || !agentPath || !sessionKey) return [];
  return conversations.filter(
    (conversation) =>
      conversation.orchestration_parent_agent_path === agentPath &&
      conversation.orchestration_parent_session_key === sessionKey,
  );
}
