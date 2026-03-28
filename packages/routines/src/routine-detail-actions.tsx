/**
 * RoutineDetailActions — Action buttons for the routine detail page.
 * Save, Run Now, Pause/Resume, Delete.
 */
import { useState } from "react"
import { Pause, Play, RefreshCw, Save, Trash2 } from "lucide-react"
import { cn } from "@deck-ui/core"

export interface RoutineDetailActionsProps {
  isActive: boolean
  saving: boolean
  onSave: () => void
  onToggle: () => void
  onRunNow: () => void
  onDelete: () => void
}

export function RoutineDetailActions({
  isActive,
  saving,
  onSave,
  onToggle,
  onRunNow,
  onDelete,
}: RoutineDetailActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDelete()
  }

  const pillBtn = cn(
    "h-9 px-4 text-sm font-medium rounded-full transition-colors",
    "border border-black/[0.1]",
  )

  return (
    <div className="flex items-center gap-2 pt-4 border-t border-black/[0.06]">
      <button
        onClick={onSave}
        disabled={saving}
        className={cn(
          "h-9 px-4 text-sm font-medium rounded-full",
          "bg-[#0d0d0d] text-white hover:bg-[#0d0d0d]/90 transition-colors",
          "disabled:opacity-50",
        )}
      >
        <span className="flex items-center gap-1.5">
          <Save className="size-3.5" />
          {saving ? "Saving..." : "Save"}
        </span>
      </button>

      <button onClick={onRunNow} className={cn(pillBtn, "text-[#0d0d0d] hover:bg-[#f5f5f5]")}>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="size-3.5" /> Run Now
        </span>
      </button>

      <button onClick={onToggle} className={cn(pillBtn, "text-[#0d0d0d] hover:bg-[#f5f5f5]")}>
        <span className="flex items-center gap-1.5">
          {isActive ? (
            <><Pause className="size-3.5" /> Pause</>
          ) : (
            <><Play className="size-3.5" /> Resume</>
          )}
        </span>
      </button>

      <div className="flex-1" />

      {confirmDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-600">Delete?</span>
          <button
            onClick={handleDelete}
            className="h-9 px-3 text-sm font-medium rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className={cn(pillBtn, "text-[#0d0d0d] hover:bg-[#f5f5f5]")}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={handleDelete}
          className={cn(pillBtn, "text-[#9b9b9b] hover:text-red-600 hover:border-red-200")}
        >
          <span className="flex items-center gap-1.5">
            <Trash2 className="size-3.5" /> Delete
          </span>
        </button>
      )}
    </div>
  )
}
