import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import type { KeelEvent } from "../lib/types";

export function useSessionEvents() {
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const handlerRef = useRef(pushFeedItem);
  handlerRef.current = pushFeedItem;

  useEffect(() => {
    const unlisten = listen<KeelEvent>("keel-event", (event) => {
      const payload = event.payload;

      switch (payload.type) {
        case "FeedItem": {
          const activeId = useUIStore.getState().currentSessionId;
          const isDesktopDupe =
            payload.data.session_key === activeId &&
            payload.data.item.feed_type === "user_message";
          if (!isDesktopDupe) {
            handlerRef.current("main", payload.data.item);
          }
          break;
        }
        case "SessionStatus":
          if (payload.data.status === "error" && payload.data.error) {
            handlerRef.current("main", {
              feed_type: "system_message",
              data: `Session error: ${payload.data.error}`,
            });
          }
          break;
        case "Toast":
          console.log(`[toast:${payload.data.variant}]`, payload.data.message);
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
