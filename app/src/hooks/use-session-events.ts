import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { HoustonEvent } from "@houston-ai/core";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentStore } from "../stores/agents";
import { tauriActivity } from "../lib/tauri";
import { logger } from "../lib/logger";

// Pending navigation set when a completion notification fires.
// Consumed on the next window focus event (however it arrives).
let pendingNotificationNav: { agentId: string; activityId: string } | null = null;
let pendingNavTimer: ReturnType<typeof setTimeout> | null = null;

function consumePendingNav() {
  if (!pendingNotificationNav) return;
  const { agentId, activityId } = pendingNotificationNav;
  pendingNotificationNav = null;
  if (pendingNavTimer) { clearTimeout(pendingNavTimer); pendingNavTimer = null; }

  const agents = useAgentStore.getState().agents;
  logger.debug(`[notification] consuming nav: agentId=${agentId} activityId=${activityId} agents=[${agents.map(a => a.id).join(",")}]`);
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    logger.debug("[notification] agent not found — cannot navigate");
    return;
  }

  logger.debug(`[notification] navigating → agent=${agent.name} activity=${activityId}`);
  useUIStore.getState().setViewMode("activity");
  useAgentStore.getState().setCurrent(agent);
  useUIStore.getState().setActivityPanelId(activityId);
}

async function sendNotification(
  title: string,
  body: string,
  nav?: { agentId: string; activityId: string },
) {
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
      if (nav) {
        pendingNotificationNav = nav;
        if (pendingNavTimer) clearTimeout(pendingNavTimer);
        pendingNavTimer = setTimeout(() => { pendingNotificationNav = null; }, 5 * 60 * 1000);
        logger.debug(`[notification] pending nav set: agentId=${nav.agentId} activityId=${nav.activityId}`);
      }
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
            const workspace = h.getWorkspace();
            const agent = h.getAgent();
            const workspaceName = workspace?.name ?? "Houston";
            const agentName = agent?.name ?? "Agent";
            let nav: { agentId: string; activityId: string } | undefined;

            // Move activity to "needs_you" — the ActivityChanged event
            // emitted by the Rust update command will auto-invalidate queries.
            // Skip routine-* sessions — the routine runner handles their lifecycle.
            if (session_key.startsWith("activity-") && !session_key.startsWith("routine-")) {
              const activityId = session_key.replace("activity-", "");
              if (agent?.folderPath) {
                tauriActivity.update(agent.folderPath, activityId, { status: "needs_you" }).catch((e) =>
                  console.error("[session] Failed to update activity status:", e),
                );
              }
              if (agent?.id) {
                nav = { agentId: agent.id, activityId };
              } else {
                logger.debug(`[notification] session completed but agent.id missing: session_key=${session_key}`);
              }
            }

            sendNotification(`${workspaceName} — ${agentName}`, "Your agent has finished working.", nav);
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

    // Case: app in background — user clicks notification → OS activates app →
    // Rust emits "app-activated" via RunEvent::Resumed → we consume pending nav.
    const unlistenActivated = listen("app-activated", () => {
      logger.debug(`[notification] app-activated event fired: pendingNav=${JSON.stringify(pendingNotificationNav)}`);
      consumePendingNav();
    });

    // Fallback: browser-level focus and Tauri window focus (belt + suspenders).
    const handleFocus = () => {
      if (!pendingNotificationNav) return;
      logger.debug(`[notification] window focus event fired (browser): pendingNav=${JSON.stringify(pendingNotificationNav)}`);
      consumePendingNav();
    };
    window.addEventListener("focus", handleFocus);

    const unlistenTauriFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused || !pendingNotificationNav) return;
      logger.debug(`[notification] onFocusChanged fired: focused=${focused} pendingNav=${JSON.stringify(pendingNotificationNav)}`);
      consumePendingNav();
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenActivated.then((fn) => fn());
      window.removeEventListener("focus", handleFocus);
      unlistenTauriFocus.then((fn) => fn());
    };
  }, []);
}
