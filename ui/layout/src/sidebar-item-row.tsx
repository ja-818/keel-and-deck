import type { KeyboardEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@houston-ai/core";
import type { SidebarItem } from "./sidebar";

export interface SidebarItemRowProps {
  item: SidebarItem;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  hasMenu: boolean;
  onSelect: (id: string) => void;
  onKeyDown: (e: KeyboardEvent, id: string) => void;
  onEditChange: (value: string) => void;
  onCommitRename: (id: string) => void;
  onCancelEdit: () => void;
  onStartRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
}

export function SidebarItemRow({
  item,
  isActive,
  isEditing,
  editValue,
  hasMenu,
  onSelect,
  onKeyDown,
  onEditChange,
  onCommitRename,
  onCancelEdit,
  onStartRename,
  onDelete,
}: SidebarItemRowProps) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-lg transition-colors duration-100",
        isActive ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={() => onCommitRename(item.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename(item.id);
            if (e.key === "Escape") onCancelEdit();
          }}
          className="flex-1 min-w-0 px-3 py-1.5 text-[13px] bg-background outline-none border border-border rounded-lg focus:border-foreground/30"
        />
      ) : (
        <button
          onClick={() => onSelect(item.id)}
          onKeyDown={(e) => onKeyDown(e, item.id)}
          className={cn(
            "flex-1 flex items-center gap-2 text-left px-3 py-1.5 text-[13px] min-w-0",
            isActive ? "text-foreground" : "text-accent-foreground",
          )}
        >
          {item.icon}
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
        </button>
      )}

      {!isEditing && (item.trailing || hasMenu) && (
        <div className="relative shrink-0 mr-1 h-7 min-w-7 flex items-center justify-end">
          {item.trailing && (
            <span
              className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none",
                hasMenu && "transition-opacity group-hover:opacity-0",
              )}
            >
              {item.trailing}
            </span>
          )}
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="absolute right-0 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom">
                {onStartRename && (
                  <DropdownMenuItem
                    onClick={() => onStartRename(item.id, item.name)}
                  >
                    Rename
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(item.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
