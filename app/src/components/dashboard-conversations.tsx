import { useState, useEffect, useCallback } from "react";
import { ConversationList } from "@houston-ai/board";
import type { ConversationEntry } from "@houston-ai/board";
import { useHoustonEvent } from "@houston-ai/core";
import type { HoustonEvent } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";
import { tauriConversations } from "../lib/tauri";
import type { Workspace } from "../lib/types";

interface Props {
  workspace: Workspace;
  onBack: () => void;
  onSelect: (entry: ConversationEntry) => void;
}

export function DashboardConversations({ workspace, onBack, onSelect }: Props) {
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw = await tauriConversations.list(workspace.folderPath);
      setEntries(
        raw.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          type: r.type,
          sessionKey: r.session_key,
          updatedAt: r.updated_at,
        })),
      );
    } catch (e) {
      console.error("[dashboard] Failed to load conversations:", e);
    } finally {
      setLoading(false);
    }
  }, [workspace.folderPath]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when tasks change
  const handleEvent = useCallback(
    (payload: HoustonEvent) => {
      if (
        payload.type === "SessionStatus" ||
        payload.type === "IssuesChanged" ||
        payload.type === "ConversationsChanged"
      ) {
        load();
      }
    },
    [load],
  );
  useHoustonEvent<HoustonEvent>("houston-event", handleEvent);

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="size-4" />
        All workspaces
      </button>

      <h1 className="text-[28px] font-normal text-foreground mb-6">
        {workspace.name}
      </h1>

      {loading ? null : (
        <ConversationList entries={entries} onSelect={onSelect} />
      )}
    </div>
  );
}
