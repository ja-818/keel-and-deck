import { useState, useEffect, useCallback } from "react";
import { KanbanBoard } from "@houston-ai/board";
import type { KanbanItem } from "@houston-ai/board";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import { tauriTasks } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";

interface ColumnDef {
  id: string;
  label: string;
  statuses: string[];
}

const COLUMNS: ColumnDef[] = [
  { id: "queue", label: "Queue", statuses: ["queue"] },
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "needs_you", label: "Needs you", statuses: ["needs_you"] },
  { id: "done", label: "Done", statuses: ["done"] },
];

export default function BoardTab({ workspace }: TabProps) {
  const [items, setItems] = useState<KanbanItem[]>([]);
  const path = workspace.folderPath;

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

  return (
    <KanbanBoard
      columns={COLUMNS}
      items={items}
      runningStatuses={["running"]}
      approveStatuses={["needs_you"]}
      onApprove={async (item) => {
        await tauriTasks.update(path, item.id, { status: "done" });
        loadTasks();
      }}
      onDelete={async (item) => {
        await tauriTasks.delete(path, item.id);
        loadTasks();
      }}
      emptyState={
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>
              Tasks created by your assistant will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
