import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Blend, Settings, ArrowLeftFromLine, ArrowRightFromLine } from "lucide-react";
import { ConfirmDialog } from "@houston-ai/core";
import { AppSidebar, WorkspaceSwitcher } from "@houston-ai/layout";
import { EXPERIENCE_LEVEL_PREF_KEY } from "../../lib/experience-level";
import { tauriPreferences } from "../../lib/tauri";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useUIStore } from "../../stores/ui";
import { UpdateChecker } from "./update-checker";
import { UserMenu } from "./user-menu";
import { CreateWorkspaceDialog } from "./workspace-dialog";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { buildAgentSidebarItems } from "./agent-sidebar-items";
import { orderAgents } from "../../lib/agent-order";

export function Sidebar({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["shell", "common", "portable"]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);

  const agents = useAgentStore((s) => s.agents);
  const currentAgent = useAgentStore((s) => s.current);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [createWsOpen, setCreateWsOpen] = useState(false);

  const getById = useAgentCatalogStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const experienceLevel = useUIStore((s) => s.experienceLevel);
  const setExperienceLevel = useUIStore((s) => s.setExperienceLevel);

  const visibleAgents = agents.filter((agent) => !agent.temporary);
  const sorted = orderAgents(visibleAgents);
  const activitySummaries = useAgentActivitySummaries(visibleAgents);

  const items = buildAgentSidebarItems({
    agents: sorted,
    summaries: activitySummaries,
    runningLabel: (count) =>
      t("shell:sidebar.runningCount", { count }),
    needsYouLabel: (count) =>
      t("shell:sidebar.needsYouCount", { count }),
    onChangeColor: (agentId, color) => {
      void handleChangeColor(agentId, color);
    },
    onShareAgent: (agentId) => useUIStore.getState().setShareAgentId(agentId),
    shareLabel: t("portable:shareMenu"),
  });
  const isTopLevel = viewMode === "dashboard" || viewMode === "connections" || viewMode === "settings";

  const handleWorkspaceSwitch = async (wsId: string) => {
    if (wsId === currentWorkspace?.id) return;
    const ws = workspaces.find((s) => s.id === wsId);
    if (!ws) return;
    setCurrentWorkspace(ws);
    await loadAgents(ws.id);
  };

  const handleCreateWorkspace = () => {
    setCreateWsOpen(true);
  };


  const handleSelectAgent = (agentId: string) => {
    const agent = visibleAgents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    const def = getById(agent.configId);
    const tab = def?.config.defaultTab ?? "chat";
    setViewMode(tab);
  };

  const handleRename = async (agentId: string, newName: string) => {
    if (!currentWorkspace) return;
    await renameAgent(currentWorkspace.id, agentId, newName);
  };

  async function handleChangeColor(agentId: string, color: string) {
    if (!currentWorkspace) return;
    await updateAgentColor(currentWorkspace.id, agentId, color);
  }

  const handleDelete = (agentId: string) => {
    setPendingDeleteId(agentId);
  };

  const confirmDelete = async () => {
    if (!currentWorkspace || !pendingDeleteId) return;
    await deleteAgent(currentWorkspace.id, pendingDeleteId);
    setPendingDeleteId(null);
  };

  return (
    <>
    <ConfirmDialog
      open={pendingDeleteId !== null}
      onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
      title={t("shell:agentDelete.title")}
      description={t("shell:agentDelete.description")}
      confirmLabel={t("common:actions.delete")}
      onConfirm={confirmDelete}
    />
    <CreateWorkspaceDialog open={createWsOpen} onOpenChange={setCreateWsOpen} />
    <div className="flex h-full flex-1 min-w-0">
      <AppSidebar
        header={
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentId={currentWorkspace?.id ?? null}
            currentName={currentWorkspace?.name ?? t("shell:sidebar.selectWorkspace")}
            onSwitch={handleWorkspaceSwitch}
            onCreate={handleCreateWorkspace}
          />
        }
        navItems={[
          {
            id: "dashboard",
            label: t("shell:sidebar.missionControl"),
            icon: <LayoutDashboard className="h-4 w-4" />,
            onClick: () => setViewMode("dashboard"),
            dataAttrs: { "data-tour-target": "nav-dashboard" },
          },
          {
            id: "connections",
            label: t("shell:sidebar.integrations"),
            icon: <Blend className="h-4 w-4" />,
            onClick: () => setViewMode("connections"),
            dataAttrs: { "data-tour-target": "nav-connections" },
          },
          {
            id: "settings",
            label: t("shell:sidebar.settings"),
            icon: <Settings className="h-4 w-4" />,
            onClick: () => setViewMode("settings"),
          },
        ]}
        activeNavId={isTopLevel ? viewMode : undefined}
        sectionLabel={t("shell:sidebar.yourAgents")}
        items={items}
        selectedId={!isTopLevel ? currentAgent?.id ?? null : null}
        onSelect={handleSelectAgent}
        onAdd={() => setDialogOpen(true)}
        addItemDataAttrs={{ "data-tour-target": "newAgent" }}
        onRename={handleRename}
        onDelete={handleDelete}
        labels={{
          addItem: t("shell:sidebar.addAgent"),
          moreOptions: t("shell:sidebar.agentMenu"),
          renameItem: t("common:actions.rename"),
          deleteItem: t("common:actions.delete"),
        }}
        footer={
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                const nextLevel = experienceLevel === "beginner" ? "professional" : "beginner";
                setExperienceLevel(nextLevel);
                tauriPreferences
                  .set(EXPERIENCE_LEVEL_PREF_KEY, nextLevel)
                  .catch((e) => console.error("[experience] persist failed:", e));
              }}
              className="flex items-center gap-2 w-full h-8 px-3 text-xs text-muted-foreground hover:bg-black/5 transition-colors"
            >
              {experienceLevel === "beginner" ? (
                <>
                  <ArrowRightFromLine className="h-3.5 w-3.5 shrink-0" />
                  {t("beginner.toggleToPro")}
                </>
              ) : (
                <>
                  <ArrowLeftFromLine className="h-3.5 w-3.5 shrink-0" />
                  {t("beginner.toggleToBeginner")}
                </>
              )}
            </button>
            <UserMenu />
            <UpdateChecker />
          </div>
        }
      >
        <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
          {children}
        </div>
      </AppSidebar>
    </div>
    </>
  );
}
