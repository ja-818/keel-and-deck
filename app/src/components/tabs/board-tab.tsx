import { useState, useEffect, useCallback } from "react";
import { KanbanBoard } from "@houston-ai/board";
import type { KanbanItem } from "@houston-ai/board";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Button,
  useHoustonEvent,
} from "@houston-ai/core";
import type { HoustonEvent } from "@houston-ai/core";
import { SplitView } from "@houston-ai/layout";
import { Plus } from "lucide-react";
import { tauriTasks } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { BoardDetail } from "./board-detail";
import { NewConversationPanel } from "./new-conversation-panel";

function useColumns(onAdd: () => void) {
  return [
    { id: "running", label: "Running", statuses: ["running"], onAdd },
    { id: "needs_you", label: "Needs you", statuses: ["needs_you"] },
    { id: "done", label: "Done", statuses: ["done"] },
  ];
}

export default function BoardTab({ workspace }: TabProps) {
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const path = workspace.folderPath;
  const columns = useColumns(() => setPanelOpen(true));

  const loadTasks = useCallback(async () => {
    try {
      const tasks = await tauriTasks.list(path);
      setItems(
        tasks.map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: t.description,
          status: t.status,
          updatedAt: new Date().toISOString(),
        })),
      );
    } catch (e) {
      console.error("[board] Failed to load tasks:", e);
    }
  }, [path]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Auto-refresh when session status changes (task might move columns)
  const handleEvent = useCallback(
    (payload: HoustonEvent) => {
      if (
        payload.type === "SessionStatus" ||
        payload.type === "IssuesChanged" ||
        payload.type === "ConversationsChanged"
      ) {
        loadTasks();
      }
    },
    [loadTasks],
  );
  useHoustonEvent<HoustonEvent>("houston-event", handleEvent);

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      await tauriTasks.delete(path, item.id);
      if (selectedId === item.id) setSelectedId(null);
      await loadTasks();
    },
    [path, selectedId, loadTasks],
  );

  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      await tauriTasks.update(path, item.id, { status: "done" });
      await loadTasks();
    },
    [path, loadTasks],
  );

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  const emptyState = (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>No conversations yet</EmptyTitle>
        <EmptyDescription>
          Start one to delegate work to your AI agent.
        </EmptyDescription>
      </EmptyHeader>
      <Button
        onClick={() => setPanelOpen(true)}
        className="mt-4 rounded-full gap-1.5"
        size="sm"
      >
        <Plus className="size-4" />
        New conversation
      </Button>
    </Empty>
  );

  const board = (
    <div className="flex flex-col h-full">
      <KanbanBoard
        columns={columns}
        items={items}
        selectedId={selectedId}
        runningStatuses={["running"]}
        approveStatuses={["needs_you"]}
        onSelect={(item) => setSelectedId(item.id)}
        onDelete={handleDelete}
        onApprove={handleApprove}
        emptyState={emptyState}
      />
    </div>
  );

  const showNewPanel = panelOpen && !selectedItem;

  const rightPanel = selectedItem ? (
    <BoardDetail
      key={selectedItem.id}
      item={selectedItem}
      workspacePath={path}
      onClose={() => setSelectedId(null)}
    />
  ) : showNewPanel ? (
    <NewConversationPanel
      workspacePath={path}
      onClose={() => setPanelOpen(false)}
      onCreated={(taskId) => {
        setPanelOpen(false);
        loadTasks();
        setSelectedId(taskId);
      }}
    />
  ) : null;

  return (
    <div className="h-full overflow-hidden">
      {rightPanel ? (
        <SplitView left={board} right={rightPanel} />
      ) : (
        board
      )}
    </div>
  );
}
