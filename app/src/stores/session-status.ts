import { create } from "zustand";
import {
  getConversationScopeKey,
  parseConversationScopeKey,
} from "../lib/conversation-scope";

export type SessionRunStatus = "starting" | "running" | "completed" | "error";

interface SessionStatusState {
  statuses: Record<string, SessionRunStatus>;
  setStatus: (agentPath: string, sessionKey: string, status: SessionRunStatus) => void;
}

export interface SessionStatusKeyParts {
  agentPath: string;
  sessionKey: string;
}

export function getSessionStatusKey(agentPath: string, sessionKey: string) {
  return getConversationScopeKey(agentPath, sessionKey);
}

export function parseSessionStatusKey(key: string): SessionStatusKeyParts | null {
  return parseConversationScopeKey(key);
}

export const useSessionStatusStore = create<SessionStatusState>((set) => ({
  statuses: {},
  setStatus: (agentPath, sessionKey, status) =>
    set((s) => ({
      statuses: {
        ...s.statuses,
        [getSessionStatusKey(agentPath, sessionKey)]: status,
      },
    })),
}));

export function useSessionStatus(agentPath: string, sessionKey: string) {
  return useSessionStatusStore(
    (s) => s.statuses[getSessionStatusKey(agentPath, sessionKey)],
  );
}

export function isActiveSessionStatus(status: SessionRunStatus | undefined) {
  return status === "starting" || status === "running";
}
