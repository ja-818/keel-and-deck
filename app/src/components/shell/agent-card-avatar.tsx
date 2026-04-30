import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";

export function AgentCardAvatar({ color }: { color?: string }) {
  return <HoustonAvatar color={resolveAgentColor(color)} diameter={16} />;
}
