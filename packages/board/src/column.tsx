import { AnimatePresence, motion } from "framer-motion"
import type { BoardItem } from "./types"
import { Card } from "./card"

export interface ColumnProps {
  label: string
  items: BoardItem[]
  selectedId?: string | null
  onSelect: (item: BoardItem) => void
  onDelete?: (item: BoardItem) => void
  runningStatuses?: string[]
  renderCard?: (item: BoardItem) => React.ReactNode
  actions?: (item: BoardItem) => React.ReactNode
}

export function Column({
  label,
  items,
  onSelect,
  onDelete,
  runningStatuses,
  renderCard,
  actions,
}: ColumnProps) {
  return (
    <div className="min-w-[180px] flex-1 flex flex-col h-full min-h-0 rounded-xl bg-[#f9f9f9]">
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-center shrink-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-foreground">{label}</h3>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground/60 tabular-nums">
              {items.length}
            </span>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 px-1.5 pb-1.5 space-y-1.5 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {renderCard ? (
                renderCard(item)
              ) : (
                <Card
                  item={item}
                  onSelect={() => onSelect(item)}
                  onDelete={onDelete ? () => onDelete(item) : undefined}
                  runningStatuses={runningStatuses}
                  actions={actions?.(item)}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
