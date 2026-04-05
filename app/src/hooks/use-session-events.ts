import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { HoustonEvent } from "@houston-ai/core";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";

/**
 * Subscribe to "houston-event" from the Rust backend.
 * Handles FeedItem, SessionStatus, Toast, and AuthRequired events.
 */
export function useSessionEvents() {
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const addToast = useUIStore((s) => s.addToast);
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);

  const handlersRef = useRef({ pushFeedItem, addToast, setAuthRequired });
  handlersRef.current = { pushFeedItem, addToast, setAuthRequired };

  useEffect(() => {
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
        case "SessionStatus":
          if (payload.data.status === "error" && payload.data.error) {
            h.pushFeedItem(payload.data.session_key, {
              feed_type: "system_message",
              data: `Session error: ${payload.data.error}`,
            } as FeedItem);
          }
          break;
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
