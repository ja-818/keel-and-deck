import { ChevronRight } from "lucide-react";
import type { Group } from "../sidebar-groups";

export function SidebarGroup({
  group,
  isOpen,
  onToggle,
  activePage,
  onSelect,
}: {
  group: Group;
  isOpen: boolean;
  onToggle: () => void;
  activePage: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          className="size-3 shrink-0 transition-transform duration-150"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        {group.label}
      </button>
      <div
        className="overflow-hidden transition-all duration-150"
        style={{
          maxHeight: isOpen ? `${group.items.length * 32}px` : "0px",
          opacity: isOpen ? 1 : 0,
        }}
      >
        {group.items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left pl-6 pr-3 py-1.5 rounded-lg text-[13px] transition-colors duration-100 truncate ${
              activePage === item.id
                ? "bg-accent text-foreground font-medium"
                : "text-accent-foreground hover:bg-accent/50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
