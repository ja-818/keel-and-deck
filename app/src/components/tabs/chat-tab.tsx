import { useEffect, useCallback, useRef, useState } from "react";
import { ChatPanel } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import { useFeedStore } from "../../stores/feeds";
import { tauriChat } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";

export default function ChatTab({ agent }: TabProps) {
  // Session key is agent-scoped to prevent cross-agent event bleeding
  const sessionKey = agent.id;
  const feedItems = useFeedStore((s) => s.items[sessionKey]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setFeed = useFeedStore((s) => s.setFeed);
  const clearFeed = useFeedStore((s) => s.clearFeed);
  const [isLoading, setIsLoading] = useState(false);
  const sendingRef = useRef(false);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedRef.current === agent.id) return;
    loadedRef.current = agent.id;
    clearFeed(sessionKey);
    tauriChat.loadHistory(agent.folderPath, sessionKey).then((rows) => {
      if (rows.length > 0) setFeed(sessionKey, rows as FeedItem[]);
    });
  }, [agent.id, sessionKey, setFeed, clearFeed, agent.folderPath]);

  const handleSend = useCallback(
    async (text: string) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);
      pushFeedItem(sessionKey, { feed_type: "user_message", data: text });
      try {
        await tauriChat.send(agent.folderPath, text, sessionKey);
      } catch (err) {
        pushFeedItem(sessionKey, {
          feed_type: "system_message",
          data: `Failed to start session: ${err}`,
        });
      } finally {
        setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [agent.folderPath, sessionKey, pushFeedItem],
  );

  return (
    <div className="h-full w-full flex flex-col">
      <ChatPanel
        sessionKey={sessionKey}
        feedItems={feedItems ?? []}
        isLoading={isLoading}
        onSend={handleSend}
        placeholder="Ask anything..."
        emptyState={
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>Start a conversation</EmptyTitle>
              <EmptyDescription>
                Type a message to talk to your assistant.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    </div>
  );
}
