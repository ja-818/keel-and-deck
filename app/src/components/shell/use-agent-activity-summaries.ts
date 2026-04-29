import { useMemo } from "react";
import { useAllConversations } from "../../hooks/queries";
import type { Agent } from "../../lib/types";
import { buildAgentActivitySummaries } from "./agent-activity-summary-model";

export function useAgentActivitySummaries(
  agents: Pick<Agent, "id" | "folderPath">[],
) {
  const agentPaths = useMemo(
    () => agents.map((agent) => agent.folderPath),
    [agents],
  );
  const { data: conversations } = useAllConversations(agentPaths);

  return useMemo(
    () => buildAgentActivitySummaries(agents, conversations ?? []),
    [agents, conversations],
  );
}
