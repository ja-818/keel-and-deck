import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { HoustonEvent } from "@houston-ai/core";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentStore } from "../stores/agents";
import { tauriActivity } from "../lib/tauri";

async function sendNotification(title: string, body: string) {
  try {
    const {
      isPermissionGranted,
      requestPermission,
      sendNotification: notify,
    } = await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (granted) {
      notify({ title, body, sound: "Glass" });
    }
  } catch (e) {
    console.error("[notification] Failed:", e);
  }
}

/**
 * Subscribe to "houston-event" from the Rust backend.
 * Handles FeedItem, SessionStatus, Toast, AuthRequired, and native notifications.
 *
 * NOTE: Data invalidation is handled by useWorkspaceInvalidation (TanStack Query).
 * This hook only handles push-based events (streaming, toasts, notifications).
 */
export function useSessionEvents() {
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const addToast = useUIStore((s) => s.addToast);
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);

  const handlersRef = useRef({
    pushFeedItem,
    addToast,
    setAuthRequired,
    getWorkspace: () => useWorkspaceStore.getState().current,
    getAgent: () => useAgentStore.getState().current,
  });
  handlersRef.current = {
    pushFeedItem,
    addToast,
    setAuthRequired,
    getWorkspace: () => useWorkspaceStore.getState().current,
    getAgent: () => useAgentStore.getState().current,
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const unlisten = listen<HoustonEvent>("houston-event", (event) => {
      const h = handlersRef.current;
      const payload = event.payload;

      switch (payload.type) {
        case "FeedItem":
          h.pushFeedItem(
            payload.data.session_key,
            payload.data.item as FeedItem,
          );
          break;
        case "SessionStatus": {
          const { status, error, session_key } = payload.data;
          if (status === "error" && error) {
            h.pushFeedItem(session_key, {
              feed_type: "system_message",
              data: `Session error: ${error}`,
            } as FeedItem);
          }
          if (status === "completed") {
            // Move activity to "needs_you" — the ActivityChanged event
            // emitted by the Rust update command will auto-invalidate queries.
            // Skip routine-* sessions — the routine runner handles their lifecycle.
            if (session_key.startsWith("activity-") && !session_key.startsWith("routine-")) {
              const activityId = session_key.replace("activity-", "");
              const agent = h.getAgent();
              if (agent?.folderPath) {
                tauriActivity.update(agent.folderPath, activityId, { status: "needs_you" }).catch((e) =>
                  console.error("[session] Failed to update activity status:", e),
                );
              }
            }
            const workspace = h.getWorkspace();
            const agent = h.getAgent();
            const workspaceName = workspace?.name ?? "Houston";
            const agentName = agent?.name ?? "Agent";
            sendNotification(
              `${workspaceName} — ${agentName}`,
              "Your agent has finished working.",
            );
          }
          break;
        }
        case "Toast":
          h.addToast({
            title: payload.data.message,
          });
          break;
        case "AuthRequired":
          h.setAuthRequired(true);
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
