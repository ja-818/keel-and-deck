import { cn } from "@deck-ui/core"
import { X } from "lucide-react"

export interface NavPillItem {
  id: string
  label: string
  badge?: string | number
}

export interface NavPillsProps {
  items: NavPillItem[]
  activeId: string | null
  onChange: (id: string | null) => void
  className?: string
}

export function NavPills({ items, activeId, onChange, className }: NavPillsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {items.map((item) => {
        const isActive = activeId === item.id

        return (
          <button
            key={item.id}
            onClick={() => onChange(isActive ? null : item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            {item.label}
            {item.badge != null && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-medium",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.badge}
              </span>
            )}
            {isActive && (
              <X
                className="size-3 opacity-70 hover:opacity-100 transition-opacity"
                aria-label="Close panel"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
