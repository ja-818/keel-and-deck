import { useCallback, useRef, useState } from "react";
import { KanbanDetailPanel } from "@houston-ai/board";
import type { KanbanItem } from "@houston-ai/board";
import { ChatPanel } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../../stores/feeds";
import { tauriChat } from "../../lib/tauri";

interface BoardDetailProps {
  item: KanbanItem;
  workspacePath: string;
  onClose: () => void;
}

function sessionKeyFor(taskId: string) {
  return `task-${taskId}`;
}

export function BoardDetail({
  item,
  workspacePath,
  onClose,
}: BoardDetailProps) {
  const sessionKey = sessionKeyFor(item.id);
  const feedItems = useFeedStore((s) => s.items[sessionKey]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const [isLoading, setIsLoading] = useState(false);
  const sendingRef = useRef(false);

  const handleSend = useCallback(
    async (text: string) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);
      pushFeedItem(sessionKey, { feed_type: "user_message", data: text });
      try {
        await tauriChat.send(workspacePath, text, sessionKey);
      } catch (err) {
        pushFeedItem(sessionKey, {
          feed_type: "system_message",
          data: `Failed to send: ${err}`,
        });
      } finally {
        setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [workspacePath, sessionKey, pushFeedItem],
  );

  return (
    <KanbanDetailPanel
      title={item.title}
      subtitle={item.subtitle}
      status={item.status}
      onClose={onClose}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatPanel
          sessionKey={sessionKey}
          feedItems={(feedItems ?? []) as FeedItem[]}
          isLoading={isLoading}
          onSend={handleSend}
          placeholder="Send a follow-up..."
        />
      </div>
    </KanbanDetailPanel>
  );
}
