import { useState, useEffect, useCallback, useRef } from "react";
import { AIBoard } from "@houston-ai/board";
import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";

import { useFeedStore } from "../../stores/feeds";
import { useUIStore } from "../../stores/ui";
import { useActivity, useDeleteActivity, useUpdateActivity, useCreateActivity } from "../../hooks/queries";
import { tauriActivity, tauriChat } from "../../lib/tauri";
import { useFileToolRenderer } from "../../hooks/use-file-tool-renderer";
import type { TabProps } from "../../lib/types";
import houstonIcon from "../../assets/houston-icon.svg";
import { useDetailPanelContainer } from "../shell/detail-panel-context";

/** Extract a concise title from an assistant response. */
function extractTitle(text: string): string | null {
  let clean = text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();

  // Strip filler openings
  clean = clean.replace(
    /^(I'll|I will|Let me|Sure,?\s*|OK,?\s*|Okay,?\s*|Alright,?\s*|Of course,?\s*)/i,
    "",
  ).trim();

  if (clean.length < 10) return null;

  // First sentence or first line
  const sentenceEnd = clean.search(/[.!?]\s/);
  if (sentenceEnd > 10 && sentenceEnd < 100) {
    clean = clean.substring(0, sentenceEnd + 1);
  } else {
    const lineEnd = clean.indexOf("\n");
    if (lineEnd > 10 && lineEnd < 100) {
      clean = clean.substring(0, lineEnd);
    }
  }

  if (clean.length > 80) clean = clean.substring(0, 77) + "...";

  return clean.length >= 10 ? clean : null;
}

function ThinkingIndicator() {
  return (
    <div className="py-2 flex items-center gap-2">
      <img
        src={houstonIcon}
        alt="Houston"
        className="size-6 rounded-full animate-pulse"
      />
    </div>
  );
}


export default function BoardTab({ agent }: TabProps) {
  const panelContainer = useDetailPanelContainer();
  const path = agent.folderPath;
  const { isSpecialTool, renderToolResult } = useFileToolRenderer(path);
  const { data: rawItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const updateActivity = useUpdateActivity(path);
  const createActivity = useCreateActivity(path);
  const setOnStartMission = useUIStore((s) => s.setOnStartMission);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const openerRef = useRef<(() => void) | null>(null);

  const items: KanbanItem[] = (rawItems ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    subtitle: t.description,
    status: t.status,
    updatedAt: t.updated_at ?? new Date().toISOString(),
    group: t.routine_id ? "routine" : undefined,
    metadata: {
      ...(t.session_key ? { sessionKey: t.session_key } : {}),
      ...(t.routine_id ? { routineId: t.routine_id } : {}),
    },
  }));

  // Read and consume pending selection from Mission Control
  const pendingId = useUIStore((s) => s.activityPanelId);
  const clearPending = useUIStore((s) => s.setActivityPanelId);
  const [selectedId, setSelectedId] = useState<string | null>(pendingId);
  useEffect(() => {
    if (pendingId) {
      setSelectedId(pendingId);
      clearPending(null);
    }
  }, [pendingId, clearPending]);

  const feedItems = useFeedStore((s) => s.items);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const [loadingState, setLoading] = useState<Record<string, boolean>>({});
  const summarizedIds = useRef<Set<string>>(new Set());

  // Auto-summarize titles for running activities when first assistant text arrives
  useEffect(() => {
    if (!rawItems) return;
    for (const activity of rawItems) {
      if (activity.status !== "running") continue;
      if (summarizedIds.current.has(activity.id)) continue;

      const sk = activity.session_key ?? `activity-${activity.id}`;
      const feed = feedItems[sk];
      if (!feed) continue;

      const assistantItem = feed.find(
        (f) =>
          (f.feed_type === "assistant_text" || f.feed_type === "assistant_text_streaming") &&
          typeof f.data === "string" &&
          f.data.length > 20,
      );
      if (!assistantItem) continue;

      summarizedIds.current.add(activity.id);
      const title = extractTitle(assistantItem.data as string);
      if (title && title !== activity.title) {
        tauriActivity.update(path, activity.id, { title }).catch(console.error);
      }
    }
  }, [rawItems, feedItems, path]);

  // Register the "Start a Mission" handler in the UI store for the TabBar
  const handleOpenerReady = useCallback(
    (opener: () => void) => {
      openerRef.current = opener;
      setOnStartMission(opener);
    },
    [setOnStartMission],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => setOnStartMission(null);
  }, [setOnStartMission]);

  const loadHistory = useCallback(
    async (sessionKey: string) => {
      const history = await tauriChat.loadHistory(path, sessionKey);
      return history as FeedItem[];
    },
    [path],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      await deleteActivity.mutateAsync(item.id);
      if (selectedId === item.id) setSelectedId(null);
    },
    [deleteActivity, selectedId],
  );

  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      await updateActivity.mutateAsync({ activityId: item.id, update: { status: "done" } });
    },
    [updateActivity],
  );

  const handleCreateConversation = useCallback(
    async (text: string) => {
      const title = text.length > 80 ? text.slice(0, 77) + "..." : text;
      const item = await createActivity.mutateAsync({ title, description: text });
      const sessionKey = `activity-${item.id}`;
      pushFeedItem(sessionKey, { feed_type: "user_message", data: text });
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      await updateActivity.mutateAsync({ activityId: item.id, update: { status: "running" } });
      tauriChat.send(path, text, sessionKey);
      return item.id;
    },
    [path, pushFeedItem, createActivity, updateActivity],
  );

  // Derive the session key for an activity, using custom key if set by routine runner
  const sessionKeyFor = useCallback(
    (activityId: string) => {
      const item = (rawItems ?? []).find((t) => t.id === activityId);
      return item?.session_key ?? `activity-${activityId}`;
    },
    [rawItems],
  );

  const handleStopSession = useCallback(
    (sessionKey: string) => {
      tauriChat.stop(sessionKey).catch(console.error);
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string) => {
      pushFeedItem(sessionKey, { feed_type: "user_message", data: text });
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      // Find the activity ID from the session key to update its status
      const activity = (rawItems ?? []).find(
        (t) => (t.session_key ?? `activity-${t.id}`) === sessionKey,
      );
      if (activity) {
        tauriActivity.update(path, activity.id, { status: "running" }).catch(console.error);
      }
      tauriChat.send(path, text, sessionKey);
    },
    [path, pushFeedItem, rawItems],
  );

  return (
    <AIBoard
      items={items}
      selectedId={selectedId}
      onSelect={setSelectedId}
      panelContainer={panelContainer}
      feedItems={feedItems}
      isLoading={loadingState}
      sessionKeyFor={sessionKeyFor}
      onDelete={handleDelete}
      onApprove={handleApprove}
      onCreateConversation={handleCreateConversation}
      onSendMessage={handleSendMessage}
      onLoadHistory={loadHistory}
      onNewPanelOpenerReady={handleOpenerReady}
      onPanelOpenChange={setMissionPanelOpen}
      onStopSession={handleStopSession}
      isSpecialTool={isSpecialTool}
      renderToolResult={renderToolResult}
      thinkingIndicator={<ThinkingIndicator />}
      panelAgentName={agent.name}
      panelAvatar={
        <span className="size-10 rounded-full ring-1 ring-border flex items-center justify-center shrink-0">
          <img src={houstonIcon} alt="Houston" className="size-6" />
        </span>
      }
    />
  );
}
