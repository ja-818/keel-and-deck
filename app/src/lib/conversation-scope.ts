export interface ConversationScopeParts {
  agentPath: string;
  sessionKey: string;
}

const CONVERSATION_SCOPE_SEPARATOR = "\u0000";

export function getConversationScopeKey(agentPath: string, sessionKey: string) {
  return `${agentPath}${CONVERSATION_SCOPE_SEPARATOR}${sessionKey}`;
}

export function parseConversationScopeKey(
  key: string,
): ConversationScopeParts | null {
  const splitAt = key.indexOf(CONVERSATION_SCOPE_SEPARATOR);
  if (splitAt <= 0 || splitAt === key.length - 1) return null;
  return {
    agentPath: key.slice(0, splitAt),
    sessionKey: key.slice(splitAt + 1),
  };
}
