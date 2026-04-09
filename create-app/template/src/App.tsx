import { useEffect, useCallback, useRef, useState } from "react";
import { ChatPanel } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Button,
} from "@houston-ai/core";
import { AppSidebar } from "@houston-ai/layout";
import { TabBar } from "@houston-ai/layout";
import { useAgentStore } from "./stores/agents";
import { useFeedStore } from "./stores/feeds";
import { useUIStore, type ViewMode } from "./stores/ui";
import { useSessionEvents } from "./hooks/use-session-events";
import { tauriChat } from "./lib/tauri";
import { ContextTab } from "./components/context-tab";
import { SkillsTab } from "./components/skills-tab";
import { LearningsTab } from "./components/learnings-tab";
import { FilesTab } from "./components/files-tab";
import { ConnectionsTab } from "./components/connections-tab";
import { ChannelsTab } from "./components/channels-tab";
import { CreateAgentDialog } from "./components/create-agent-dialog";

// Free-form primary chat lives under a stable per-agent session key.
// Activity/task/routine conversations use their own UUID-scoped keys.
const chatKey = (agentPath: string) => `chat:${agentPath}`;

const TABS = [
  { id: "chat" as const, label: "Chat" },
  { id: "context" as const, label: "Context" },
  { id: "skills" as const, label: "Skills" },
  { id: "learnings" as const, label: "Learnings" },
  { id: "files" as const, label: "Files" },
  { id: "connections" as const, label: "Connections" },
  { id: "channels" as const, label: "Channels" },
];

export function App() {
  const { agents, current, ready, loadAgents, setCurrentAgent, renameAgent, deleteAgent } =
    useAgentStore();
  const sessionKey = current ? chatKey(current.path) : null;
  const mainFeed = useFeedStore((s) =>
    current && sessionKey ? s.items[current.path]?.[sessionKey] : undefined,
  );
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setFeed = useFeedStore((s) => s.setFeed);
  const clearFeed = useFeedStore((s) => s.clearFeed);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const sendingRef = useRef(false);

  useSessionEvents();

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);


  // Load chat history when switching agents
  useEffect(() => {
    if (!current || !sessionKey) return;
    clearFeed(current.path, sessionKey);
    tauriChat.loadHistory(current.path, sessionKey).then((rows) => {
      if (rows.length > 0) setFeed(current.path, sessionKey, rows as FeedItem[]);
    });
  }, [current, sessionKey, setFeed, clearFeed]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!current || !sessionKey || sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);
      pushFeedItem(current.path, sessionKey, { feed_type: "user_message", data: text });
      try {
        await tauriChat.send(current.path, sessionKey, text);
      } catch (err) {
        pushFeedItem(current.path, sessionKey, {
          feed_type: "system_message",
          data: `Failed to start session: ${err}`,
        });
      } finally {
        setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [current, sessionKey, pushFeedItem],
  );

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground text-sm">Starting...</p>
      </div>
    );
  }

  // No agents yet — full-screen empty state
  if (agents.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>Welcome to {"{{APP_NAME_TITLE}}"}</EmptyTitle>
            <EmptyDescription>
              Create your first agent to get started.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setShowCreate(true)} className="mt-4">
            Create agent
          </Button>
        </Empty>
        {showCreate && (
          <CreateAgentDialog onClose={() => setShowCreate(false)} />
        )}
      </div>
    );
  }

  const sidebarItems = agents.map((a) => ({ id: a.path, name: a.name }));

  return (
    <div className="h-screen flex bg-background text-foreground">
      <AppSidebar
        items={sidebarItems}
        selectedId={current?.path ?? null}
        onSelect={(id) => {
          const agent = agents.find((a) => a.path === id);
          if (agent) setCurrentAgent(agent);
        }}
        onAdd={() => setShowCreate(true)}
        onRename={(id, newName) => renameAgent(id, newName)}
        onDelete={(id) => deleteAgent(id)}
        sectionLabel="Agents"
      >
        <div className="flex-1 flex flex-col min-w-0">
          <TabBar
            title={current?.name ?? "{{APP_NAME_TITLE}}"}
            tabs={TABS}
            activeTab={viewMode}
            onTabChange={(id) => setViewMode(id as ViewMode)}
          />
          <main className="flex-1 min-h-0">
            {!current ? (
              <NoAgentSelected />
            ) : viewMode === "chat" ? (
              <ChatView
                sessionKey={sessionKey ?? "chat"}
                feedItems={mainFeed ?? []}
                isLoading={isLoading}
                onSend={handleSend}
              />
            ) : viewMode === "context" ? (
              <ContextTab workspacePath={current.path} />
            ) : viewMode === "skills" ? (
              <SkillsTab workspacePath={current.path} />
            ) : viewMode === "learnings" ? (
              <LearningsTab workspacePath={current.path} />
            ) : viewMode === "files" ? (
              <FilesTab workspacePath={current.path} />
            ) : viewMode === "connections" ? (
              <ConnectionsTab workspacePath={current.path} />
            ) : (
              <ChannelsTab workspacePath={current.path} />
            )}
          </main>
        </div>
      </AppSidebar>

      {showCreate && (
        <CreateAgentDialog onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function ChatView({
  sessionKey,
  feedItems,
  isLoading,
  onSend,
}: {
  sessionKey: string;
  feedItems: FeedItem[];
  isLoading: boolean;
  onSend: (text: string) => void;
}) {
  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto">
      <ChatPanel
        sessionKey={sessionKey}
        feedItems={feedItems}
        isLoading={isLoading}
        onSend={(text) => onSend(text)}
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
  );
}

function NoAgentSelected() {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No agent selected</EmptyTitle>
          <EmptyDescription>
            Create or select an agent from the sidebar.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
