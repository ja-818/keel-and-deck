import { create } from "zustand";
import { mergeFeedItem } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";

/**
 * Feed store — nested by agent path, then by session key.
 *
 * Nested structure prevents cross-agent message bleeding: no code path can
 * accidentally read or write another agent's feed because you always need
 * both keys to address a bucket. Deleting an agent drops all its sessions
 * in one `clearAgent` call.
 */
interface FeedState {
  items: Record<string, Record<string, FeedItem[]>>;
  pushFeedItem: (agentPath: string, sessionKey: string, item: FeedItem) => void;
  setFeed: (agentPath: string, sessionKey: string, items: FeedItem[]) => void;
  clearFeed: (agentPath: string, sessionKey: string) => void;
  clearAgent: (agentPath: string) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  items: {},

  pushFeedItem: (agentPath, sessionKey, item) =>
    set((s) => {
      const bucket = s.items[agentPath] ?? {};
      return {
        items: {
          ...s.items,
          [agentPath]: {
            ...bucket,
            [sessionKey]: mergeFeedItem(bucket[sessionKey] ?? [], item),
          },
        },
      };
    }),

  setFeed: (agentPath, sessionKey, items) =>
    set((s) => ({
      items: {
        ...s.items,
        [agentPath]: { ...(s.items[agentPath] ?? {}), [sessionKey]: items },
      },
    })),

  clearFeed: (agentPath, sessionKey) =>
    set((s) => {
      const bucket = s.items[agentPath];
      if (!bucket) return s;
      const { [sessionKey]: _, ...rest } = bucket;
      return { items: { ...s.items, [agentPath]: rest } };
    }),

  clearAgent: (agentPath) =>
    set((s) => {
      const { [agentPath]: _, ...rest } = s.items;
      return { items: rest };
    }),
}));
