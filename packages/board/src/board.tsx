import { useMemo } from "react"
import { Column } from "./column"
import type { BoardItem, BoardColumn } from "./types"

export interface BoardProps {
  columns: BoardColumn[]
  items: BoardItem[]
  selectedId?: string | null
  onSelect?: (item: BoardItem) => void
  onDelete?: (item: BoardItem) => void
  emptyState?: React.ReactNode
  renderCard?: (item: BoardItem) => React.ReactNode
  runningStatuses?: string[]
  actions?: (item: BoardItem) => React.ReactNode
}

export function Board({
  columns,
  items,
  onSelect,
  onDelete,
  emptyState,
  renderCard,
  runningStatuses,
  actions,
}: BoardProps) {
  const columnData = useMemo(() => {
    return columns.map((col) => {
      const colItems = items
        .filter((item) => col.statuses.includes(item.status))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() -
            new Date(a.updatedAt).getTime(),
        )
      return { ...col, items: colItems }
    })
  }, [columns, items])

  // Empty state — no items at all
  if (items.length === 0 && emptyState) {
    return (
      <div className="flex-1 flex flex-col items-center pt-[20vh] gap-4 px-8">
        {emptyState}
      </div>
    )
  }

  return (
    <div className="flex-1 flex gap-3 p-3 min-h-0 overflow-hidden">
      {columnData.map((col) => (
        <Column
          key={col.id}
          label={col.label}
          items={col.items}
          onSelect={onSelect ?? (() => {})}
          onDelete={onDelete}
          renderCard={renderCard}
          runningStatuses={runningStatuses}
          actions={actions}
        />
      ))}
    </div>
  )
}
