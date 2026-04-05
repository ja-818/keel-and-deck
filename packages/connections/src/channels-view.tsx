/**
 * ChannelsView — Full channels management view following the SkillsGrid pattern.
 * Empty state, channel list with section header, and dialog for adding channels.
 */
import { useState } from "react"
import { Plus } from "lucide-react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@houston-ai/core"
import type { ChannelConnection, ChannelType } from "./types"
import { CHANNEL_LABELS } from "./types"
import { ChannelConnectionCard } from "./channel-connection-card"
import { ChannelSetupForm } from "./channel-setup-form"

export interface ChannelsViewProps {
  channels: ChannelConnection[]
  loading?: boolean
  onAddChannel: (type: ChannelType, config: Record<string, string>) => Promise<void>
  onConnect?: (channel: ChannelConnection) => void
  onDisconnect?: (channel: ChannelConnection) => void
  onConfigure?: (channel: ChannelConnection) => void
  onDelete?: (channel: ChannelConnection) => void
}

const CHANNEL_TYPES: ChannelType[] = ["slack", "telegram"]

export function ChannelsView({
  channels,
  loading,
  onAddChannel,
  onConnect,
  onDisconnect,
  onConfigure,
  onDelete,
}: ChannelsViewProps) {
  const [setupType, setSetupType] = useState<ChannelType | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  const handleSetupSubmit = async (config: Record<string, string>) => {
    if (!setupType) return
    setSetupLoading(true)
    setSetupError(null)
    try {
      await onAddChannel(setupType, config)
      setSetupType(null)
    } catch (e) {
      setSetupError(String(e))
    } finally {
      setSetupLoading(false)
    }
  }

  const closeDialog = () => {
    setSetupType(null)
    setSetupError(null)
  }

  // Loading
  if (loading && channels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading channels...
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Empty state */}
      {channels.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No channels yet</EmptyTitle>
              <EmptyDescription>
                Connect Slack or Telegram so your agent can receive
                and respond to messages.
              </EmptyDescription>
            </EmptyHeader>
            <AddChannelButton onSelect={setSetupType} />
          </Empty>
        </div>
      )}

      {/* Channel list */}
      {channels.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-foreground">
                  Channels
                </h2>
                <AddChannelButton onSelect={setSetupType} variant="outline" />
              </div>
              <div className="space-y-2">
                {channels.map((channel) => (
                  <ChannelConnectionCard
                    key={channel.id}
                    connection={channel}
                    onConnect={onConnect}
                    onDisconnect={onDisconnect}
                    onConfigure={onConfigure}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Add channel dialog */}
      <Dialog open={setupType !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Set up {setupType ? CHANNEL_LABELS[setupType] : "channel"}
            </DialogTitle>
            <DialogDescription>
              {setupType === "telegram"
                ? "Enter your bot token from @BotFather to connect Telegram."
                : "Enter your Slack app tokens to connect your workspace."}
            </DialogDescription>
          </DialogHeader>
          {setupType && (
            <ChannelSetupForm
              type={setupType}
              onSubmit={handleSetupSubmit}
              onCancel={closeDialog}
              loading={setupLoading}
              error={setupError}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddChannelButton({
  onSelect,
  variant,
}: {
  onSelect: (type: ChannelType) => void
  variant?: "default" | "outline"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className="rounded-full"
        >
          <Plus className="size-3.5" />
          Add channel
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {CHANNEL_TYPES.map((type) => (
          <DropdownMenuItem key={type} onClick={() => onSelect(type)}>
            {CHANNEL_LABELS[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
