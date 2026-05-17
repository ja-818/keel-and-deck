import type { FeedItem } from "@houston-ai/chat";
import { normalizeToolkitSlug } from "./composio-toolkits";

export function parseComposioToolkitFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const slug = params.get("houston_toolkit");
    return slug && slug.length > 0 ? normalizeToolkitSlug(slug) : null;
  } catch {
    return null;
  }
}

export function extractComposioToolkits(content: string): string[] {
  const found = new Set<string>();
  const marker = /#houston_toolkit=([A-Za-z0-9_-]+)/g;
  for (const match of content.matchAll(marker)) {
    const slug = normalizeToolkitSlug(match[1] ?? "");
    if (slug) found.add(slug);
  }
  return [...found];
}

export function latestAssistantComposioToolkits(items: FeedItem[]): string[] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item.feed_type !== "assistant_text" &&
      item.feed_type !== "assistant_text_streaming"
    ) {
      continue;
    }
    const toolkits = extractComposioToolkits(item.data);
    if (toolkits.length > 0) return toolkits;
  }
  return [];
}
