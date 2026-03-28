import { useState } from "react"
import { cn } from "@deck-ui/core"
import { Trash2 } from "lucide-react"
import type { BoardItem } from "./types"

export interface CardProps {
  item: BoardItem
  onSelect: () => void
  onDelete?: () => void
  runningStatuses?: string[]
  actions?: React.ReactNode
}

export function Card({
  item,
  onSelect,
  onDelete,
  runningStatuses = ["running"],
  actions,
}: CardProps) {
  const isRunning = runningStatuses.includes(item.status)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowConfirm(true)
  }

  const confirmDelete = () => {
    onDelete?.()
    setShowConfirm(false)
  }

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowConfirm(false)
  }

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group/card relative rounded-lg bg-white px-3 py-2.5 cursor-pointer transition-all duration-200",
        isRunning
          ? "card-running-glow shadow-[0_2px_12px_rgba(59,130,246,0.12)]"
          : "shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]",
      )}
    >
      {/* Delete button */}
      {onDelete && !showConfirm && (
        <button
          onClick={handleDeleteClick}
          className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
          aria-label={`Delete ${item.title}`}
        >
          <Trash2 className="size-3" />
        </button>
      )}

      {/* Inline confirm */}
      {showConfirm && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              confirmDelete()
            }}
            className="h-5 px-1.5 rounded text-[10px] font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={cancelDelete}
            className="h-5 px-1.5 rounded text-[10px] font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <p className="text-sm text-foreground line-clamp-2 pr-5">
        {item.title}
      </p>

      {/* Footer: icon + subtitle + actions */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {item.icon && (
            <span className="size-4 shrink-0 flex items-center justify-center">
              {item.icon}
            </span>
          )}
          {item.subtitle && (
            <span className="text-[11px] text-muted-foreground truncate">
              {item.subtitle}
            </span>
          )}
        </div>

        <div className="shrink-0">
          {actions}
        </div>
      </div>
    </div>
  )
}
