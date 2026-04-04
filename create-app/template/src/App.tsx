import { useEffect, useCallback, useRef, useState } from "react";
import { ChatPanel } from "@deck-ui/chat";
import type { FeedItem } from "@deck-ui/chat";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@deck-ui/core";
import { MessageSquare, FileText } from "lucide-react";
import { useWorkspaceStore } from "./stores/workspace";
import { useFeedStore } from "./stores/feeds";
import { useUIStore, type ViewMode } from "./stores/ui";
import { useSessionEvents } from "./hooks/use-session-events";
import { tauriSessions } from "./lib/tauri";
import { ClaudeMdEditor } from "./components/claude-md-editor";

const MAIN_KEY = "main";

const TABS: { id: ViewMode; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "claude-md", label: "CLAUDE.md", icon: FileText },
];

export function App() {
  const { workspace, init } = useWorkspaceStore();
  const mainFeed = useFeedStore((s) => s.items[MAIN_KEY]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setFeed = useFeedStore((s) => s.setFeed);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [isLoading, setIsLoading] = useState(false);
  const sendingRef = useRef(false);

  useSessionEvents();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (workspace) {
      tauriSessions.loadFeed(workspace.id).then((rows) => {
        if (rows.length > 0) {
          setFeed(MAIN_KEY, rows as FeedItem[]);
        }
      });
    }
  }, [workspace, setFeed]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!workspace || sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);

      pushFeedItem(MAIN_KEY, { feed_type: "user_message", data: text });

      try {
        await tauriSessions.start(workspace.id, text);
      } catch (err) {
        pushFeedItem(MAIN_KEY, {
          feed_type: "system_message",
          data: `Failed to start session: ${err}`,
        });
      } finally {
        setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [workspace, pushFeedItem],
  );

  if (!workspace) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground text-sm">Starting...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="h-[52px] flex items-center justify-between px-4 border-b border-black/5">
        <span className="text-sm font-semibold">{"{{APP_NAME_TITLE}}"}</span>
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={`flex items-center gap-1.5 rounded-full h-8 px-3 text-sm font-medium transition-colors ${
                viewMode === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 min-h-0">
        {viewMode === "chat" && (
          <div className="h-full flex flex-col max-w-3xl mx-auto">
            <ChatPanel
              sessionKey={MAIN_KEY}
              feedItems={mainFeed ?? []}
              isLoading={isLoading}
              onSend={handleSend}
              placeholder="Ask anything..."
              emptyState={
                <Empty className="border-0">
                  <EmptyHeader>
                    <EmptyTitle>Start a conversation</EmptyTitle>
                    <EmptyDescription>
                      Type a message to talk to your agent.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              }
            />
          </div>
        )}
        {viewMode === "claude-md" && (
          <ClaudeMdEditor projectId={workspace.id} />
        )}
      </main>
    </div>
  );
}
