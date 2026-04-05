import { lazy, type ComponentType } from "react";
import type { ExperienceTab, Experience, TabProps } from "../lib/types";

type TabImport = () => Promise<{ default: ComponentType<TabProps> }>;

const BUILTIN_TABS: Record<string, TabImport> = {
  chat: () => import("../components/tabs/chat-tab"),
  board: () => import("../components/tabs/board-tab"),
  skills: () => import("../components/tabs/skills-tab"),
  learnings: () => import("../components/tabs/learnings-tab"),
  files: () => import("../components/tabs/files-tab"),
  connections: () => import("../components/tabs/connections-tab"),
  context: () => import("../components/tabs/context-tab"),
  routines: () => import("../components/tabs/routines-tab"),
  channels: () => import("../components/tabs/channels-tab"),
  events: () => import("../components/tabs/events-tab"),
};

export function resolveTabComponent(
  tab: ExperienceTab,
  experience: Experience,
): ComponentType<TabProps> {
  // Built-in tab
  if (tab.builtIn && BUILTIN_TABS[tab.builtIn]) {
    return lazy(BUILTIN_TABS[tab.builtIn]);
  }

  // Custom component from bundle (tier 2) — placeholder for now
  if (tab.customComponent && experience.bundleUrl) {
    return lazy(async () => {
      const module = await import(/* @vite-ignore */ experience.bundleUrl!);
      const Component = module[tab.customComponent!];
      if (!Component) throw new Error(`Bundle does not export "${tab.customComponent}"`);
      return { default: Component };
    });
  }

  // Fallback
  return lazy(BUILTIN_TABS.chat);
}
