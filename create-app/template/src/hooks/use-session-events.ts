import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useFeedStore } from "../stores/feeds";
import { useIssueStore } from "../stores/issues";
import { useProjectStore } from "../stores/projects";
import type { KeelEvent } from "../lib/types";

/**
 * Subscribe to keel-event from the Rust backend.
 * Dispatches events to the appropriate Zustand stores.
 */
export function useSessionEvents() {
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const updateIssueStatus = useIssueStore((s) => s.updateIssueStatus);
  const currentProject = useProjectStore((s) => s.currentProject);
  const loadIssues = useIssueStore((s) => s.loadIssues);

  useEffect(() => {
    const unlisten = listen<KeelEvent>("keel-event", (event) => {
      const payload = event.payload;

      switch (payload.type) {
        case "FeedItem":
          pushFeedItem(payload.data.session_key, payload.data.item);
          break;

        case "IssueStatusChanged":
          updateIssueStatus(payload.data.issue_id, payload.data.status);
          break;

        case "IssuesChanged":
          if (currentProject && payload.data.project_id === currentProject.id) {
            loadIssues(currentProject.id);
          }
          break;

        case "Toast":
          console.log(`[toast:${payload.data.variant}]`, payload.data.message);
          break;

        case "AuthRequired":
          console.warn("[auth]", payload.data.message);
          break;

        case "CompletionToast":
          console.log("[done]", payload.data.title);
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [pushFeedItem, updateIssueStatus, currentProject, loadIssues]);
}
