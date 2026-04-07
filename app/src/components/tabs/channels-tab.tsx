import { useCallback } from "react";
import { ChannelsView } from "@houston-ai/connections";
import type { ChannelConnection, ChannelType } from "@houston-ai/connections";
import { useChannels, useAddChannel, useRemoveChannel } from "../../hooks/queries";
import type { TabProps, ChannelEntry } from "../../lib/types";

function toChannelConnection(entry: ChannelEntry): ChannelConnection {
  let config: Record<string, string>;
  try {
    config = JSON.parse(entry.token);
  } catch {
    config = { token: entry.token };
  }
  return {
    id: entry.id,
    type: entry.channel_type as ChannelType,
    name: entry.name,
    status: "disconnected",
    config,
    lastActiveAt: null,
    messageCount: 0,
  };
}

export default function ChannelsTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data: channels, isLoading: loading } = useChannels(path);
  const addChannel = useAddChannel(path);
  const removeChannel = useRemoveChannel(path);

  const handleAdd = useCallback(
    async (type: ChannelType, config: Record<string, string>) => {
      const existing = channels ?? [];
      const label = type === "slack" ? "Slack" : "Telegram";
      const count = existing.filter((e) => e.channel_type === type).length;
      const name = count === 0 ? label : `${label} ${count + 1}`;
      const token = JSON.stringify(config);
      await addChannel.mutateAsync({ channel_type: type, name, token });
    },
    [channels, addChannel],
  );

  const handleDelete = useCallback(
    async (channel: ChannelConnection) => {
      await removeChannel.mutateAsync(channel.id);
    },
    [removeChannel],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        <ChannelsView
          channels={(channels ?? []).map(toChannelConnection)}
          loading={loading}
          onAddChannel={handleAdd}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
