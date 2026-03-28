import { ArrowLeft, Loader2 } from "lucide-react"
import { cn } from "@deck-ui/core"

const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  needs_you: "Needs You",
  done: "Done",
  approved: "Done",
  completed: "Done",
  error: "Failed",
  failed: "Failed",
}

export interface DetailPanelProps {
  title: string
  subtitle?: string
  status?: string
  onClose: () => void
  children: React.ReactNode
  actions?: React.ReactNode
  runningStatuses?: string[]
  statusLabels?: Record<string, string>
}

export function DetailPanel({
  title,
  subtitle,
  status,
  onClose,
  children,
  actions,
  runningStatuses = ["running"],
  statusLabels,
}: DetailPanelProps) {
  const labels = statusLabels ?? STATUS_LABEL
  const isRunning = status ? runningStatuses.includes(status) : false

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-black/[0.06]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="size-7 flex items-center justify-center rounded-md text-[#8e8e8e] hover:text-[#0d0d0d] hover:bg-black/[0.04] transition-colors"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#0d0d0d] truncate">
              {title}
            </p>
            {(subtitle || status) && (
              <p className="text-[11px] text-[#8e8e8e]">
                {subtitle}
                {subtitle && status && (
                  <span className="mx-1">&middot;</span>
                )}
                {status && (
                  <span className={cn(isRunning && "text-blue-500")}>
                    {labels[status] ?? status}
                  </span>
                )}
              </p>
            )}
          </div>
          {isRunning && (
            <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />
          )}
          {actions}
        </div>
      </div>

      {/* Content */}
      {children}
    </div>
  )
}
