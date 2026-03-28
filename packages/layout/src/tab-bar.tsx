import type { ReactNode } from "react";
import { cn } from "@deck-ui/core";

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

export interface TabBarProps {
  title?: string;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  actions?: ReactNode;
  menu?: ReactNode;
}

export function TabBar({
  title,
  tabs,
  activeTab,
  onTabChange,
  actions,
  menu,
}: TabBarProps) {
  return (
    <div className="shrink-0 px-5 pt-4">
      {/* Title row + menu + actions */}
      {(title || menu || actions) && (
        <div className="flex items-center gap-2 mb-3">
          {title && (
            <h1 className="text-xl font-semibold text-[#0d0d0d]">{title}</h1>
          )}
          {menu}
          {actions && (
            <div className="ml-auto flex items-center gap-2">{actions}</div>
          )}
        </div>
      )}

      {/* Tab strip */}
      <div className="flex items-center gap-5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex items-center gap-1.5 pb-2.5 text-sm transition-colors duration-200",
                isActive
                  ? "text-[#0d0d0d] font-medium"
                  : "text-[#8e8e8e] hover:text-[#0d0d0d]"
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xs font-medium",
                    isActive
                      ? "bg-[#0d0d0d] text-white"
                      : "bg-[#e3e3e3] text-[#424242]"
                  )}
                >
                  {tab.badge}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0d0d0d] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
