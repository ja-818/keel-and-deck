import { Suspense } from "react";
import { Spinner } from "@houston-ai/core";
import { resolveTabComponent } from "../../experiences/tab-resolver";
import type { Experience, Workspace, ExperienceTab } from "../../lib/types";

interface ExperienceRendererProps {
  experience: Experience;
  workspace: Workspace;
  tabs: ExperienceTab[];
  activeTabId: string;
}

export function ExperienceRenderer({
  experience,
  workspace,
  tabs,
  activeTabId,
}: ExperienceRendererProps) {
  return (
    <div className="h-full relative">
      {tabs.map((tab) => {
        const TabComponent = resolveTabComponent(tab, experience);
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={isActive ? "h-full" : "hidden"}
          >
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center">
                  <Spinner className="size-5" />
                </div>
              }
            >
              <TabComponent workspace={workspace} experience={experience} />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
