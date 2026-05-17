import { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import {
  getSessionStatusKey,
  isActiveSessionStatus,
  useSessionStatusStore,
} from "../stores/session-status";
import {
  getConversationScopeKey,
  parseConversationScopeKey,
} from "../lib/conversation-scope";
import { useAllConversations } from "../hooks/queries";
import { tauriActivity, tauriChat, tauriAttachments } from "../lib/tauri";
import { buildAttachmentPrompt } from "../lib/attachment-message";
import type { Agent } from "../lib/types";
import { createElement } from "react";
import { AgentCardAvatar } from "./shell/agent-card-avatar";

interface MissionConversationRef {
  agentPath: string;
  sessionKey: string;
  activityId: string;
}

export function useMissionControl(agents: Agent[]) {
  const { t } = useTranslation("chat");
  // Mission Control is cross-agent. Use the same scoped conversation key
  // everywhere inside this view so identical session keys from different
  // agents never collide.
  const allItems = useFeedStore((s) => s.items);
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const feedItems = useMemo(() => {
    const out: Record<string, FeedItem[]> = {};
    for (const ap of agentPaths) {
      const bucket = allItems[ap];
      if (!bucket) continue;
      for (const [sk, items] of Object.entries(bucket)) {
        out[getConversationScopeKey(ap, sk)] = items;
      }
    }
    return out;
  }, [allItems, agentPaths]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatuses = useSessionStatusStore((s) => s.statuses);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const conversationMapRef = useRef<Record<string, MissionConversationRef>>({});

  const paths = useMemo(
    () => agents.map((a) => a.folderPath),
    [agents],
  );

  const { data: convos, isFetched } = useAllConversations(paths);

  const agentColorMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of agents) m[a.folderPath] = a.color;
    return m;
  }, [agents]);

  const items: KanbanItem[] = useMemo(() => {
    if (!convos) return [];
    const map: Record<string, MissionConversationRef> = {};
    const result = convos
      .filter((c) => c.type === "activity" && c.status)
      .map((c) => {
        const scopeKey = getConversationScopeKey(c.agent_path, c.session_key);
        map[scopeKey] = {
          agentPath: c.agent_path,
          sessionKey: c.session_key,
          activityId: c.id,
        };
        return {
          id: scopeKey,
          title: c.title,
          description: c.description,
          group: c.agent_name,
          icon: createElement(AgentCardAvatar, { color: agentColorMap[c.agent_path] }),
          status: c.status!,
          updatedAt: c.updated_at ?? new Date().toISOString(),
          metadata: {
            agentPath: c.agent_path,
            sessionKey: scopeKey,
            realSessionKey: c.session_key,
            activityId: c.id,
          },
        };
      });
    conversationMapRef.current = map;
    return result;
  }, [convos, agentColorMap]);

  const resolveConversation = useCallback(
    (key: string): MissionConversationRef | null => {
      const direct = conversationMapRef.current[key];
      if (direct) return direct;
      const parsed = parseConversationScopeKey(key);
      if (parsed) {
        const activityId = parsed.sessionKey.startsWith("activity-")
          ? parsed.sessionKey.slice("activity-".length)
          : parsed.sessionKey;
        return {
          agentPath: parsed.agentPath,
          sessionKey: parsed.sessionKey,
          activityId,
        };
      }
      const match = Object.values(conversationMapRef.current).find(
        (ref) => ref.sessionKey === key,
      );
      return match ?? null;
    },
    [],
  );

  const loadHistory = useCallback(
    async (conversationKey: string): Promise<FeedItem[]> => {
      const ref = resolveConversation(conversationKey);
      if (!ref) return [];
      const history = await tauriChat.loadHistory(ref.agentPath, ref.sessionKey);
      return history as FeedItem[];
    },
    [resolveConversation],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      const ref = resolveConversation(item.id);
      if (!ref) return;
      await tauriActivity.delete(ref.agentPath, ref.activityId);
      // Drop any cached attachments for this conversation. Idempotent.
      await tauriAttachments.delete(`activity-${ref.activityId}`).catch(() => {});
      if (selectedId === item.id) setSelectedId(null);
    },
    [resolveConversation, selectedId],
  );

  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      const ref = resolveConversation(item.id);
      if (!ref) return;
      await tauriActivity.update(ref.agentPath, ref.activityId, { status: "done" });
    },
    [resolveConversation],
  );

  const handleRename = useCallback(
    async (item: KanbanItem, newTitle: string) => {
      const ref = resolveConversation(item.id);
      if (!ref) return;
      await tauriActivity.update(ref.agentPath, ref.activityId, { title: newTitle });
    },
    [resolveConversation],
  );

  const setFeed = useFeedStore((s) => s.setFeed);
  const handleHistoryLoaded = useCallback(
    (conversationKey: string, history: FeedItem[]) => {
      // Mirror board-tab's hydration: when AIBoard loads persisted chat
      // for an activity, drop the server slice into the feed store so
      // the ChatPanel renders it. Without this Mission Control would
      // open a conversation and show an empty chat (history was loaded
      // but had nowhere to land).
      const ref = resolveConversation(conversationKey);
      if (!ref) return;
      const current =
        useFeedStore.getState().items[ref.agentPath]?.[ref.sessionKey] ?? [];
      // Server history is authoritative for what's persisted; anything
      // currently in `current` that isn't on the server is either an
      // optimistic overlay we pushed or a WS event that landed
      // mid-load. Append those after the server slice.
      const serverIds = new Set(history.map((it) => JSON.stringify(it)));
      const tail = current.filter((it) => !serverIds.has(JSON.stringify(it)));
      setFeed(ref.agentPath, ref.sessionKey, [...history, ...tail]);
    },
    [resolveConversation, setFeed],
  );

  const handleSendMessage = useCallback(
    async (conversationKey: string, text: string, files: File[]) => {
      const ref = resolveConversation(conversationKey);
      if (!ref) return;
      try {
        const paths = await tauriAttachments.save(`activity-${ref.activityId}`, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        await tauriChat.send(ref.agentPath, prompt, ref.sessionKey);
        pushFeedItem(ref.agentPath, ref.sessionKey, {
          feed_type: "user_message",
          data: prompt,
        });
        setLoading((prev) => ({ ...prev, [conversationKey]: true }));
      } catch (err) {
        setLoading((prev) => ({ ...prev, [conversationKey]: false }));
        pushFeedItem(ref.agentPath, ref.sessionKey, {
          feed_type: "system_message",
          data: t("errors.sessionStart", { error: String(err) }),
        });
        throw err;
      }
    },
    [pushFeedItem, resolveConversation, t],
  );

  const handleCreate = useCallback(
    async (agentPath: string, text: string) => {
      const title = text.length > 80 ? text.slice(0, 77) + "..." : text;
      const item = await tauriActivity.create(agentPath, title, text);
      const sessionKey = `activity-${item.id}`;
      const conversationKey = getConversationScopeKey(agentPath, sessionKey);
      pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: text });
      setLoading((prev) => ({ ...prev, [conversationKey]: true }));
      conversationMapRef.current[conversationKey] = {
        agentPath,
        sessionKey,
        activityId: item.id,
      };
      await tauriActivity.update(agentPath, item.id, { status: "running" });
      tauriChat.send(agentPath, text, sessionKey);
      setSelectedId(conversationKey);
      return conversationKey;
    },
    [pushFeedItem],
  );

  const effectiveLoading = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [conversationKey, value] of Object.entries(loading)) {
      if (!value) continue;
      const ref = resolveConversation(conversationKey);
      const status = ref
        ? sessionStatuses[getSessionStatusKey(ref.agentPath, ref.sessionKey)]
        : undefined;
      if (!status || isActiveSessionStatus(status)) {
        out[conversationKey] = true;
      }
    }
    for (const item of items) {
      const ref = resolveConversation(item.id);
      const status = ref
        ? sessionStatuses[getSessionStatusKey(ref.agentPath, ref.sessionKey)]
        : undefined;
      if (item.status === "running" || isActiveSessionStatus(status)) {
        out[item.id] = true;
      }
    }
    return out;
  }, [items, loading, resolveConversation, sessionStatuses]);

  return {
    items,
    selectedId,
    setSelectedId,
    loading: effectiveLoading,
    isLoaded: isFetched,
    feedItems,
    loadHistory,
    handleHistoryLoaded,
    handleDelete,
    handleApprove,
    handleRename,
    handleSendMessage,
    handleCreate,
  };
}
