import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  getConversationScopeKey,
  parseConversationScopeKey,
} from "../src/lib/conversation-scope.ts";

describe("conversation scope keys", () => {
  it("round-trips agent path and session key", () => {
    const key = getConversationScopeKey("/tmp/agent", "chat-123");

    deepStrictEqual(parseConversationScopeKey(key), {
      agentPath: "/tmp/agent",
      sessionKey: "chat-123",
    });
  });

  it("rejects malformed keys", () => {
    strictEqual(parseConversationScopeKey("missing-separator"), null);
    strictEqual(parseConversationScopeKey("\u0000chat-123"), null);
    strictEqual(parseConversationScopeKey("/tmp/agent\u0000"), null);
  });

  it("does not collide when different agents share a session key", () => {
    const first = getConversationScopeKey("/tmp/agent-a", "activity-1");
    const second = getConversationScopeKey("/tmp/agent-b", "activity-1");

    strictEqual(first === second, false);
    deepStrictEqual(parseConversationScopeKey(first), {
      agentPath: "/tmp/agent-a",
      sessionKey: "activity-1",
    });
    deepStrictEqual(parseConversationScopeKey(second), {
      agentPath: "/tmp/agent-b",
      sessionKey: "activity-1",
    });
  });
});
