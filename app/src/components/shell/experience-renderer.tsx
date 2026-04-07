import { Suspense } from "react";
import { Spinner } from "@houston-ai/core";
import { resolveTabComponent } from "../../agents/tab-resolver";
import type { AgentDefinition, Agent, AgentTab } from "../../lib/types";

interface AgentRendererProps {
  agentDef: AgentDefinition;
  agent: Agent;
  tabs: AgentTab[];
  activeTabId: string;
}

export function AgentRenderer({
  agentDef,
  agent,
  tabs,
  activeTabId,
}: AgentRendererProps) {
  return (
    <div className="h-full w-full relative">
      {tabs.map((tab) => {
        const TabComponent = resolveTabComponent(tab, agentDef);
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={isActive ? "h-full w-full" : "hidden"}
          >
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center">
                  <Spinner className="size-5" />
                </div>
              }
            >
              <TabComponent agent={agent} agentDef={agentDef} />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
