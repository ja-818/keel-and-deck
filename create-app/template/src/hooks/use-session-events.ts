import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useFeedStore } from "../stores/feeds";
import type { HoustonEvent } from "../lib/types";

export function useSessionEvents() {
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const handlerRef = useRef(pushFeedItem);
  handlerRef.current = pushFeedItem;

  useEffect(() => {
    const unlisten = listen<HoustonEvent>("houston-event", (event) => {
      const payload = event.payload;

      switch (payload.type) {
        case "FeedItem":
          handlerRef.current(
            payload.data.agent_path,
            payload.data.session_key,
            payload.data.item,
          );
          break;
        case "SessionStatus":
          if (payload.data.status === "error" && payload.data.error) {
            handlerRef.current(
              payload.data.agent_path,
              payload.data.session_key,
              {
                feed_type: "system_message",
                data: `Session error: ${payload.data.error}`,
              },
            );
          }
          break;
        case "Toast":
          console.log(
            `[toast:${payload.data.variant}]`,
            payload.data.message,
          );
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
