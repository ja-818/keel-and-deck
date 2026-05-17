import assert from "node:assert/strict";
import { deriveStatus } from "../src/chat-status.ts";
import type { FeedItem } from "../src/types.ts";

assert.equal(deriveStatus([], false), "ready");
assert.equal(deriveStatus([], true), "submitted");

assert.equal(
  deriveStatus([{ feed_type: "thinking_streaming", data: "working" }], false),
  "streaming",
);
assert.equal(
  deriveStatus([{ feed_type: "assistant_text_streaming", data: "hello" }], false),
  "streaming",
);

const terminalItems: FeedItem[] = [
  { feed_type: "thinking", data: "done thinking" },
  { feed_type: "tool_call", data: { name: "tool", input: {} } },
  { feed_type: "tool_result", data: { content: "ok", is_error: false } },
  { feed_type: "user_message", data: "hello" },
  { feed_type: "system_message", data: "Stopped by user" },
];

for (const item of terminalItems) {
  assert.equal(deriveStatus([item], false), "ready", item.feed_type);
  assert.equal(deriveStatus([item], true), "streaming", item.feed_type);
}
