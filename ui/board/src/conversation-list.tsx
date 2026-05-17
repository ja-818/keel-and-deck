import { Card, Badge } from "@houston-ai/core"
import { MessageSquare } from "lucide-react"
import type { ConversationEntry } from "./types"

export interface ConversationListProps {
  entries: ConversationEntry[]
  onSelect: (entry: ConversationEntry) => void
  showAgentName?: boolean
  labels?: {
    status?: Partial<Record<string, string>>
    justNow?: string
    minutesAgo?: (count: number) => string
    hoursAgo?: (count: number) => string
    daysAgo?: (count: number) => string
  }
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  running: "default",
  needs_you: "outline",
  done: "secondary",
  cancelled: "outline",
}

const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  needs_you: "Needs you",
  done: "Done",
  cancelled: "Cancelled",
}

function formatRelative(
  iso: string | undefined,
  labels: NonNullable<ConversationListProps["labels"]>,
): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return labels.justNow ?? "just now"
  if (mins < 60) return labels.minutesAgo?.(mins) ?? `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return labels.hoursAgo?.(hours) ?? `${hours}h ago`
  const days = Math.floor(hours / 24)
  return labels.daysAgo?.(days) ?? `${days}d ago`
}

export function ConversationList({
  entries,
  onSelect,
  showAgentName = true,
  labels = {},
}: ConversationListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map((entry) => (
        <Card
          key={entry.id}
          className="cursor-pointer border-black/5 px-4 py-3 transition-[background-color,box-shadow] hover:bg-muted/30 hover:shadow-sm"
          onClick={() => onSelect(entry)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {entry.type === "primary" && (
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <span className="text-sm font-medium truncate block">
                  {entry.title}
                </span>
                {showAgentName && entry.agentName && (
                  <span className="text-xs text-muted-foreground truncate block">
                    {entry.agentName}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {entry.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatRelative(entry.updatedAt, labels)}
                </span>
              )}
              {entry.status && (
                <Badge
                  variant={STATUS_VARIANT[entry.status] ?? "outline"}
                  className="rounded-full text-xs"
                >
                  {labels.status?.[entry.status] ?? STATUS_LABEL[entry.status] ?? entry.status}
                </Badge>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
