import { cn } from "@deck-ui/core"
import { useCallback } from "react"

export interface AppTopBarProps {
  /** App title or logo — rendered on the left side. */
  title?: React.ReactNode
  /** Navigation controls (e.g., NavPills) — rendered on the right side. */
  navigation?: React.ReactNode
  /** Extra action buttons — rendered after navigation. */
  actions?: React.ReactNode
  /** Add left padding for macOS traffic lights (close/minimize/maximize). */
  trafficLightPadding?: boolean
  /** Called when the user drags the bar (for window dragging). Apps should call their platform's startDragging API. */
  onDrag?: () => void
  /** Additional CSS classes. */
  className?: string
  children?: React.ReactNode
}

export function AppTopBar({
  title,
  navigation,
  actions,
  trafficLightPadding = false,
  onDrag,
  className,
  children,
}: AppTopBarProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onDrag) return
      const target = e.target as HTMLElement
      if (target.closest("button, a, input, [role='button']")) return
      onDrag()
    },
    [onDrag],
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      data-tauri-drag-region
      className={cn(
        "flex items-center h-11 shrink-0 border-b border-border bg-secondary cursor-default select-none",
        trafficLightPadding ? "pl-[78px]" : "pl-4",
        className,
      )}
    >
      {title && (
        <div className="pointer-events-none select-none shrink-0 pr-4">
          {title}
        </div>
      )}

      <div className="flex-1 h-full" />

      {navigation && (
        <div className="flex items-center shrink-0 px-2">
          {navigation}
        </div>
      )}

      {actions && (
        <div className="flex items-center gap-1 ml-1 pr-4 shrink-0">
          {actions}
        </div>
      )}

      {children}
    </div>
  )
}
