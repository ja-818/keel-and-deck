import { Suspense } from "react";
import { Spinner } from "@houston-ai/core";
import { resolveTabComponent } from "../../experiences/tab-resolver";
import type { Experience, Workspace, ExperienceTab } from "../../lib/types";

interface ExperienceRendererProps {
  experience: Experience;
  workspace: Workspace;
  activeTab: ExperienceTab;
}

export function ExperienceRenderer({
  experience,
  workspace,
  activeTab,
}: ExperienceRendererProps) {
  const TabComponent = resolveTabComponent(activeTab, experience);

  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="size-5" />
        </div>
      }
    >
      <TabComponent workspace={workspace} experience={experience} />
    </Suspense>
  );
}
