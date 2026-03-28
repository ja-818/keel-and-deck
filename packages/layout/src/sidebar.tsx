import type { KeyboardEvent, ReactNode } from "react";
import { Plus } from "lucide-react";
import { cn } from "@deck-ui/core";

export interface SidebarItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface AppSidebarProps {
  items: SidebarItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onAdd?: () => void;
  header?: ReactNode;
}

export function AppSidebar({
  items,
  selectedId,
  onSelect,
  onDelete,
  onAdd,
  header,
}: AppSidebarProps) {
  const handleKeyDown = (e: KeyboardEvent, id: string) => {
    if (onDelete && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      onDelete(id);
    }
  };

  return (
    <aside className="w-[200px] bg-[#f5f5f5] flex flex-col h-full shrink-0 border-r border-black/[0.06]">
      {/* Header: logo/branding slot + add button */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">{header}</div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="size-7 flex items-center justify-center rounded-md text-[#8e8e8e] hover:text-[#0d0d0d] hover:bg-black/[0.05] transition-colors"
          >
            <Plus className="size-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto px-2">
        {items.map((item) => {
          const isActive = item.id === selectedId;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              onKeyDown={(e) => handleKeyDown(e, item.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition-colors duration-100 truncate flex items-center gap-2",
                isActive
                  ? "bg-black/[0.07] text-[#0d0d0d]"
                  : "text-[#424242] hover:bg-black/[0.04]"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
