import { useState, useCallback, useMemo, useRef } from "react";
import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import { useAllConversations } from "../hooks/queries";
import { tauriActivity, tauriChat, tauriAttachments, withAttachmentPaths } from "../lib/tauri";
import type { Agent } from "../lib/types";

export function useMissionControl(agents: Agent[]) {
  // Mission control is cross-agent. Flatten the nested feed store into a
  // single sessionKey → items map, filtered to the agents on this view.
  const allItems = useFeedStore((s) => s.items);
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const feedItems = useMemo(() => {
    const out: Record<string, FeedItem[]> = {};
    for (const ap of agentPaths) {
      const bucket = allItems[ap];
      if (!bucket) continue;
      for (const [sk, items] of Object.entries(bucket)) {
        out[sk] = items;
      }
    }
    return out;
  }, [allItems, agentPaths]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const pathMapRef = useRef<Record<string, string>>({});

  const paths = useMemo(
    () => agents.map((a) => a.folderPath),
    [agents],
  );

  const { data: convos } = useAllConversations(paths);

  const items: KanbanItem[] = useMemo(() => {
    if (!convos) return [];
    const map: Record<string, string> = {};
    const result = convos
      .filter((c) => c.type === "activity" && c.status)
      .map((c) => {
        map[c.id] = c.agent_path;
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          subtitle: c.agent_name,
          status: c.status!,
          updatedAt: c.updated_at ?? new Date().toISOString(),
          metadata: { agentPath: c.agent_path },
        };
      });
    pathMapRef.current = map;
    return result;
  }, [convos]);

  const loadHistory = useCallback(
    async (sessionKey: string): Promise<FeedItem[]> => {
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return [];
      const history = await tauriChat.loadHistory(agentPath, sessionKey);
      return history as FeedItem[];
    },
    [],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.delete(agentPath, item.id);
      // Drop any cached attachments for this conversation. Idempotent.
      await tauriAttachments.delete(`activity-${item.id}`).catch(() => {});
      if (selectedId === item.id) setSelectedId(null);
    },
    [selectedId],
  );

  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, { status: "done" });
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return;
      const visible = files.length > 0
        ? `${text}${text ? "\n\n" : ""}Attached: ${files.map((f) => f.name).join(", ")}`
        : text;
      pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: visible });
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      tauriActivity.update(agentPath, activityId, { status: "running" }).catch(console.error);
      const paths = await tauriAttachments.save(`activity-${activityId}`, files);
      const prompt = withAttachmentPaths(text, paths);
      tauriChat.send(agentPath, prompt, sessionKey);
    },
    [pushFeedItem],
  );

  const handleCreate = useCallback(
    async (agentPath: string, text: string) => {
      const title = text.length > 80 ? text.slice(0, 77) + "..." : text;
      const item = await tauriActivity.create(agentPath, title, text);
      const sessionKey = `activity-${item.id}`;
      pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: text });
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      await tauriActivity.update(agentPath, item.id, { status: "running" });
      tauriChat.send(agentPath, text, sessionKey);
      setSelectedId(item.id);
    },
    [pushFeedItem],
  );

  return {
    items,
    selectedId,
    setSelectedId,
    loading,
    feedItems,
    loadHistory,
    handleDelete,
    handleApprove,
    handleSendMessage,
    handleCreate,
  };
}
