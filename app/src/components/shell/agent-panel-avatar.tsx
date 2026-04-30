import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";

export function AgentPanelAvatar({
  color,
  running,
}: {
  color?: string;
  running: boolean;
}) {
  return (
    <HoustonAvatar
      color={resolveAgentColor(color)}
      diameter={40}
      running={running}
    />
  );
}
