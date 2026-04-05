import { create } from "zustand";
import { mergeFeedItem } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";

interface FeedState {
  items: Record<string, FeedItem[]>;
  pushFeedItem: (sessionKey: string, item: FeedItem) => void;
  setFeed: (sessionKey: string, items: FeedItem[]) => void;
  clearFeed: (sessionKey: string) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  items: {},

  pushFeedItem: (sessionKey, item) => {
    console.log("[feed:push]", sessionKey, item.feed_type, item);
    return set((s) => ({
      items: {
        ...s.items,
        [sessionKey]: mergeFeedItem(s.items[sessionKey] ?? [], item),
      },
    }));
  },

  setFeed: (sessionKey, items) =>
    set((s) => ({
      items: { ...s.items, [sessionKey]: items },
    })),

  clearFeed: (sessionKey) =>
    set((s) => {
      const { [sessionKey]: _, ...rest } = s.items;
      return { items: rest };
    }),
}));
