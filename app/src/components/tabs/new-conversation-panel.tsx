import { useCallback, useRef, useState } from "react";
import { KanbanDetailPanel } from "@houston-ai/board";
import { ChatPanel } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import { useFeedStore } from "../../stores/feeds";
import { tauriChat, tauriTasks } from "../../lib/tauri";

interface NewConversationPanelProps {
  workspacePath: string;
  onClose: () => void;
  /** Called after the task is created with its ID — board should select it */
  onCreated: (taskId: string) => void;
}

const SESSION_KEY = "new-conversation";

export function NewConversationPanel({
  workspacePath,
  onClose,
  onCreated,
}: NewConversationPanelProps) {
  const feedItems = useFeedStore((s) => s.items[SESSION_KEY]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const [isLoading, setIsLoading] = useState(false);
  const sendingRef = useRef(false);

  const handleSend = useCallback(
    async (text: string) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);
      pushFeedItem(SESSION_KEY, { feed_type: "user_message", data: text });

      try {
        // Create task with the message as title
        const title =
          text.length > 80 ? text.slice(0, 77) + "..." : text;
        const task = await tauriTasks.create(
          workspacePath,
          title,
          text,
        );

        // Set to running immediately
        await tauriTasks.update(workspacePath, task.id, {
          status: "running",
        });

        // Start the session with task-specific session key
        await tauriChat.send(workspacePath, text, `task-${task.id}`);

        // Switch to the created task
        onCreated(task.id);
      } catch (err) {
        pushFeedItem(SESSION_KEY, {
          feed_type: "system_message",
          data: `Failed to start: ${err}`,
        });
      } finally {
        setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [workspacePath, pushFeedItem, onCreated],
  );

  return (
    <KanbanDetailPanel
      title="New conversation"
      subtitle="Describe what you want the agent to do"
      onClose={onClose}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatPanel
          sessionKey={SESSION_KEY}
          feedItems={(feedItems ?? []) as FeedItem[]}
          isLoading={isLoading}
          onSend={handleSend}
          placeholder="What should the agent work on?"
          emptyState={
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyTitle>Start a conversation</EmptyTitle>
                <EmptyDescription>
                  Describe the task and the agent will start working on it.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        />
      </div>
    </KanbanDetailPanel>
  );
}
