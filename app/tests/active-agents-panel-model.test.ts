import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";

import { conversationsForMission } from "../src/components/shell/active-agents-panel-model.ts";
import type { RawConversation } from "../src/lib/tauri.ts";

function conversation(
  id: string,
  parentAgentPath: string | null,
  parentSessionKey: string | null,
): RawConversation {
  return {
    id,
    title: id,
    agent_path: `/agents/${id}`,
    agent_name: id,
    session_key: `activity-${id}`,
    status: "done",
    type: "primary",
    updated_at: "2026-01-01T00:00:00Z",
    orchestration_parent_agent_path: parentAgentPath,
    orchestration_parent_session_key: parentSessionKey,
  } as RawConversation;
}

describe("active agents panel model", () => {
  it("filters delegated conversations by the active mission context", () => {
    const rows = [
      conversation("a", "/parent", "activity-1"),
      conversation("b", "/parent", "chat-legacy"),
      conversation("c", "/other", "activity-1"),
    ];

    deepStrictEqual(
      conversationsForMission(rows, { agentPath: "/parent", sessionKey: "activity-1" })
        .map((row) => row.id),
      ["a"],
    );
  });

  it("does not fall back to legacy chat keys when no mission is active", () => {
    const rows = [conversation("a", "/parent", "chat-parent")];

    deepStrictEqual(
      conversationsForMission(rows, { agentPath: "/parent", sessionKey: null }),
      [],
    );
  });
});
