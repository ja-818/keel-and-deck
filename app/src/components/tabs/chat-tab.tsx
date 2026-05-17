import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@houston-ai/core";
import { ConversationList } from "@houston-ai/board";
import type { ConversationEntry } from "@houston-ai/board";
import { ArrowLeft, MessageSquarePlus } from "lucide-react";

import { useChatHistory, useConversations } from "../../hooks/queries";
import type { RawConversation } from "../../lib/tauri";
import { getConversationScopeKey } from "../../lib/conversation-scope";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { AgentSessionChat } from "../chat/agent-session-chat";

const NEW_MISSION_SESSION = "new-agent-mission";

function toConversationEntry(row: RawConversation): ConversationEntry {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    type: row.type,
    sessionKey: row.session_key,
    updatedAt: row.updated_at,
    agentPath: row.agent_path,
    agentName: row.agent_name,
  };
}

export default function ChatTab({ agent }: TabProps) {
  const { t } = useTranslation("chat");
  const setActiveMissionContext = useUIStore((s) => s.setActiveMissionContext);
  const { data: rows = [] } = useConversations(agent.folderPath);
  const legacySessionKey = `chat-${agent.id}`;
  const { data: legacyRows = [] } = useChatHistory(agent.folderPath, legacySessionKey);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSessionKey(null);
  }, [agent.id]);

  const conversations = useMemo(
    () => {
      const activityConversations = rows.map(toConversationEntry);
      if (legacyRows.length === 0) return activityConversations;
      return [
        {
          id: legacySessionKey,
          title: t("conversations.primaryTitle"),
          type: "primary" as const,
          sessionKey: legacySessionKey,
          agentPath: agent.folderPath,
          agentName: agent.name,
        },
        ...activityConversations,
      ];
    },
    [agent.folderPath, agent.name, legacyRows.length, legacySessionKey, rows, t],
  );
  const hasHistory = conversations.length > 0;
  const newMissionSessionKey = `${NEW_MISSION_SESSION}-${agent.id}`;
  const isNewMission = selectedSessionKey === newMissionSessionKey || !hasHistory;
  const activeSessionKey = isNewMission
    ? newMissionSessionKey
    : selectedSessionKey;

  useEffect(() => {
    if (activeSessionKey) {
      setActiveMissionContext(agent.folderPath, activeSessionKey);
    }
  }, [activeSessionKey, agent.folderPath, setActiveMissionContext]);

  const handleSelect = useCallback((entry: ConversationEntry) => {
    setSelectedSessionKey(entry.sessionKey);
  }, []);

  const handleCreated = useCallback((sessionKey: string) => {
    setSelectedSessionKey(sessionKey);
  }, []);

  if (activeSessionKey) {
    const activeConversationKey = getConversationScopeKey(
      agent.folderPath,
      activeSessionKey,
    );
    return (
      <div className="h-full w-full flex flex-col">
        {hasHistory && (
          <div className="shrink-0 px-6 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setSelectedSessionKey(null)}
            >
              <ArrowLeft className="size-4" />
              {t("conversations.back")}
            </Button>
          </div>
        )}
        <AgentSessionChat
          key={activeConversationKey}
          agent={agent}
          sessionKey={activeSessionKey}
          mode={isNewMission ? "new" : "existing"}
          onMissionCreated={handleCreated}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground">
              {t("conversations.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("conversations.description", { name: agent.name })}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0 gap-2 rounded-full"
            onClick={() => setSelectedSessionKey(newMissionSessionKey)}
          >
            <MessageSquarePlus className="size-4" />
            {t("conversations.newMission")}
          </Button>
        </div>
        <ConversationList
          entries={conversations}
          onSelect={handleSelect}
          showAgentName={false}
          labels={{
            status: {
              running: t("conversations.status.running"),
              needs_you: t("conversations.status.needsYou"),
              done: t("conversations.status.done"),
              cancelled: t("conversations.status.cancelled"),
            },
            justNow: t("conversations.relative.justNow"),
            minutesAgo: (count) => t("conversations.relative.minutesAgo", { count }),
            hoursAgo: (count) => t("conversations.relative.hoursAgo", { count }),
            daysAgo: (count) => t("conversations.relative.daysAgo", { count }),
          }}
        />
      </div>
    </div>
  );
}
