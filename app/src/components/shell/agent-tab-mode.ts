import type { AgentTab } from "../../lib/types";

export type ExperienceLevel = "beginner" | "professional";

interface ResolveAgentTabsInput {
  tabs: AgentTab[];
  defaultTab?: string;
  viewMode: string;
  experienceLevel: ExperienceLevel;
}

interface ResolvedAgentTabs {
  tabs: AgentTab[];
  activeTab: string;
  fallbackTab: string;
}

export function resolveAgentTabsForExperience({
  tabs,
  defaultTab,
  viewMode,
  experienceLevel,
}: ResolveAgentTabsInput): ResolvedAgentTabs {
  const resolvedTabs =
    experienceLevel === "beginner"
      ? tabs.map((tab) =>
          tab.id === "activity"
            ? { ...tab, builtIn: "chat", badge: undefined }
            : tab,
        )
      : tabs;
  const tabIds = new Set(resolvedTabs.map((tab) => tab.id));
  const fallbackTab =
    defaultTab && tabIds.has(defaultTab) ? defaultTab : resolvedTabs[0]?.id ?? "activity";
  const activeTab = tabIds.has(viewMode) ? viewMode : fallbackTab;
  return { tabs: resolvedTabs, activeTab, fallbackTab };
}
