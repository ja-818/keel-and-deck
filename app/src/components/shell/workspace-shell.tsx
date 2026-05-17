import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, PanelRightOpen, Plus } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ToastContainer,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type Toast,
} from "@houston-ai/core";
import { shortcutLabel } from "../../lib/shortcuts";
import { TabBar } from "@houston-ai/layout";
import { useActivity, useAllConversations } from "../../hooks/queries";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { missionContextKey, useUIStore } from "../../stores/ui";
import { AgentRenderer } from "./experience-renderer";
import { ActiveAgentsPanel } from "./active-agents-panel";
import { conversationsForMission } from "./active-agents-panel-model";
import { Dashboard } from "../dashboard";
import { IntegrationsView } from "../tabs/integrations-view";
import { SettingsView } from "../settings/settings-view";
import { Sidebar } from "./sidebar";
import { HoustonLogo } from "./experience-card";
import { CreateAgentDialog } from "./create-workspace-dialog";
import { ExportAgentWizard } from "../portable/export-wizard";
import { ImportAgentWizard } from "../portable/import-wizard";
import { AgentUpdateBanner } from "./agent-update-banner";
import { DetailPanelProvider } from "./detail-panel-context";
import { MissionSearchInput } from "../mission-search-input";
import { UiTour } from "./ui-tour";
import { CommandPalette } from "../command-palette";
import { ShortcutCheatsheet } from "../shortcut-cheatsheet";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { cn } from "@houston-ai/core";
import { resolveAgentTabsForExperience } from "./agent-tab-mode";

interface WorkspaceShellProps {
  toasts: Toast[];
  onDismissToast: (id: string) => void;
}

export function WorkspaceShell({ toasts, onDismissToast }: WorkspaceShellProps) {
  const { t } = useTranslation(["agents", "shell", "board"]);
  const currentAgent = useAgentStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const getById = useAgentCatalogStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const onStartMission = useUIStore((s) => s.onStartMission);
  const boardActions = useUIStore((s) => s.boardActions);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const activeMissionAgentPath = useUIStore((s) => s.activeMissionAgentPath);
  const activeMissionSessionKey = useUIStore((s) => s.activeMissionSessionKey);
  const activeAgentsDrawerClosed = useUIStore((s) => s.activeAgentsDrawerClosed);
  const setActiveAgentsDrawerOpen = useUIStore((s) => s.setActiveAgentsDrawerOpen);
  const setCreateAgentDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const agentMissionSearchQuery = useUIStore((s) =>
    currentAgent ? s.agentMissionSearchQueries[currentAgent.folderPath] ?? "" : "",
  );
  const agentMissionSearchLoading = useUIStore((s) =>
    currentAgent ? s.agentMissionSearchLoading[currentAgent.folderPath] ?? false : false,
  );
  const setAgentMissionSearchQuery = useUIStore((s) => s.setAgentMissionSearchQuery);
  const experienceLevel = useUIStore((s) => s.experienceLevel);
  const uiTourActive = useUIStore((s) => s.uiTourActive);
  const setUiTourActive = useUIStore((s) => s.setUiTourActive);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(null);
  const agentDef = currentAgent ? getById(currentAgent.configId) : undefined;
  const tabs = agentDef?.config.tabs ?? [];
  const { data: activities } = useActivity(currentAgent?.folderPath);
  const needsYouCount = (activities ?? []).filter((a) => a.status === "needs_you").length;
  const isAgentView =
    viewMode !== "dashboard" && viewMode !== "connections" && viewMode !== "settings";
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const firstAgentTab = agentDef?.config.defaultTab ?? tabs[0]?.id ?? "activity";
  // Map a desired tab id to one this agent actually has, falling back to its
  // default. Keeps the tour from spotlighting an absent tab on agents that
  // don't expose every built-in.
  const tabOr = (id: string) => (tabIds.has(id) ? id : firstAgentTab);

  const isBeginner = experienceLevel === "beginner";
  const tabMode = useMemo(
    () =>
      resolveAgentTabsForExperience({
        tabs,
        defaultTab: agentDef?.config.defaultTab,
        viewMode,
        experienceLevel: isBeginner ? "beginner" : "professional",
      }),
    [agentDef?.config.defaultTab, isBeginner, tabs, viewMode],
  );
  const visibleTabs = tabMode.tabs;
  const activeTab = tabMode.activeTab;
  const hasActivityTab = visibleTabs.some((tab) => tab.id === "activity");

  useEffect(() => {
    if (isAgentView && visibleTabs.length > 0 && !visibleTabs.some((tab) => tab.id === viewMode)) {
      setViewMode(tabMode.fallbackTab);
    }
  }, [isAgentView, setViewMode, tabMode.fallbackTab, visibleTabs, viewMode]);

  // Sub-agent paths for beginner mode right panel — all agents except assistant.
  const allAgentPaths = useMemo(
    () => (isBeginner ? agents.map((a) => a.folderPath) : []),
    [isBeginner, agents],
  );
  const { data: allConversations } = useAllConversations(allAgentPaths);
  const activeMissionKey = activeMissionAgentPath && activeMissionSessionKey
    ? missionContextKey(activeMissionAgentPath, activeMissionSessionKey)
    : null;
  const activeSubAgentConversations = useMemo(() => {
    return conversationsForMission(allConversations, {
      agentPath: activeMissionAgentPath,
      sessionKey: activeMissionSessionKey,
    });
  }, [activeMissionAgentPath, activeMissionSessionKey, allConversations]);
  const hasActiveSubAgents =
    activeSubAgentConversations.length > 0 &&
    activeTab === "activity" &&
    currentAgent?.folderPath === activeMissionAgentPath;
  const activeAgentsDrawerOpen = activeMissionKey
    ? !activeAgentsDrawerClosed[activeMissionKey]
    : false;

  useKeyboardShortcuts();

  if (experienceLevel === "beginner" && currentAgent && isAgentView) {
    return (
      <DetailPanelProvider value={panelContainer}>
        <div className="flex h-screen bg-background text-foreground">
          <Sidebar>
            <div className="flex min-w-0 flex-1 overflow-hidden">
              <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {visibleTabs.length > 0 && agentDef ? (
                  <>
                    <div data-tour-target="tabs">
                      <TabBar
                        title={currentAgent.name}
                        tabs={visibleTabs.map((tab) => ({
                          id: tab.id,
                          label: t(`agents:tabLabels.${tab.id}`, { defaultValue: tab.label }),
                          badge: tab.badge === "activity" ? needsYouCount : undefined,
                          disabled: tab.disabled,
                          chip: tab.chip,
                        }))}
                        activeTab={activeTab}
                        onTabChange={setViewMode}
                      />
                    </div>
                    <main className="min-h-0 flex-1 overflow-hidden">
                      <AgentRenderer
                        agentDef={agentDef}
                        agent={currentAgent}
                        tabs={visibleTabs}
                        activeTabId={activeTab}
                      />
                    </main>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyTitle>{t("agents:empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("agents:empty.description")}</EmptyDescription>
                      </EmptyHeader>
                      <Button
                        className="mt-4 rounded-full"
                        onClick={() => setCreateAgentDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        {t("shell:newAgent.dialogTitle")}
                      </Button>
                    </Empty>
                  </div>
                )}
              </main>
              {hasActiveSubAgents && !activeAgentsDrawerOpen && (
                <div className="flex h-full items-start border-l border-border bg-background px-2 py-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-2 rounded-full"
                    onClick={() => setActiveAgentsDrawerOpen(true)}
                    aria-label={t("shell:beginner.showActiveAgents")}
                  >
                    <PanelRightOpen className="size-4" />
                    <span className="text-xs font-medium">
                      {t("shell:beginner.activeAgentsCount", {
                        count: activeSubAgentConversations.length,
                      })}
                    </span>
                  </Button>
                </div>
              )}
              {hasActiveSubAgents && activeAgentsDrawerOpen && (
                <div
                  className="h-full overflow-hidden border-l border-border"
                  style={{ width: "32%", minWidth: 300, maxWidth: 380 }}
                >
                  <ActiveAgentsPanel
                    conversations={activeSubAgentConversations}
                    onClose={() => setActiveAgentsDrawerOpen(false)}
                  />
                </div>
              )}
            </div>
          </Sidebar>
        </div>
        <CreateAgentDialog />
        <AgentUpdateBanner />
        <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
      </DetailPanelProvider>
    );
  }

  return (
    <DetailPanelProvider value={panelContainer}>
      <div
        className={cn(
          "flex h-screen bg-background text-foreground",
          uiTourActive && "pointer-events-none [&_*]:select-none",
        )}
      >
        <Sidebar>
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <main
              data-tour-target="main"
              className="flex min-w-0 flex-1 flex-col overflow-hidden"
            >
              {viewMode === "dashboard" ? (
                <Dashboard />
              ) : viewMode === "connections" ? (
                <IntegrationsView title={t("shell:sidebar.integrations")} />
              ) : viewMode === "settings" ? (
                <SettingsView />
              ) : currentAgent && agentDef && visibleTabs.length > 0 && isAgentView ? (
                <>
                  <div data-tour-target="tabs">
                    <TabBar
                      title={currentAgent.name}
                      tabs={visibleTabs.map((tab) => ({
                        id: tab.id,
                        label: t(`agents:tabLabels.${tab.id}`, { defaultValue: tab.label }),
                        badge: tab.badge === "activity" ? needsYouCount : undefined,
                        disabled: tab.disabled,
                        chip: tab.chip,
                      }))}
                      activeTab={activeTab}
                      onTabChange={setViewMode}
                      actions={
                        <div data-keep-panel-open className="flex items-center gap-2">
                          {currentAgent && hasActivityTab && (
                            <MissionSearchInput
                              value={agentMissionSearchQuery}
                              isSearchingText={agentMissionSearchLoading}
                              labels={{
                                placeholder: t("board:search.placeholder"),
                                clear: t("board:search.clear"),
                                searchingText: t("board:search.searchingText"),
                              }}
                              className="relative w-[240px]"
                              onChange={(value) => {
                                setAgentMissionSearchQuery(currentAgent.folderPath, value);
                                if (viewMode !== "activity") setViewMode("activity");
                              }}
                            />
                          )}
                          <Button
                            data-tour-target="appTour"
                            variant="ghost"
                            className="rounded-full"
                            onClick={() => setUiTourActive(true)}
                          >
                            {t("shell:tabActions.startTour")}
                            <Compass className="size-4" />
                          </Button>
                          {onStartMission && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  data-tour-target="newMission"
                                  onClick={() => {
                                    setViewMode("activity");
                                    setTimeout(() => {
                                      useUIStore.getState().onStartMission?.();
                                    }, 50);
                                  }}
                                >
                                  <HoustonLogo size={16} />
                                  {t("shell:tabActions.newMission")}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                {shortcutLabel("newMission")}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {boardActions.map((action) => (
                            <Button
                              key={action.id}
                              variant="secondary"
                              onClick={() => {
                                setViewMode("activity");
                                setTimeout(() => action.onClick(), 50);
                              }}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      }
                    />
                  </div>
                  <main className="min-h-0 flex-1 overflow-hidden">
                    <AgentRenderer
                      agentDef={agentDef}
                      agent={currentAgent}
                      tabs={visibleTabs}
                      activeTabId={activeTab}
                    />
                  </main>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center">
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyTitle>{t("agents:empty.title")}</EmptyTitle>
                      <EmptyDescription>{t("agents:empty.description")}</EmptyDescription>
                    </EmptyHeader>
                    <Button
                      className="mt-4 rounded-full"
                      onClick={() => setCreateAgentDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      {t("shell:newAgent.dialogTitle")}
                    </Button>
                  </Empty>
                </div>
              )}
            </main>
            {missionPanelOpen && (
              <div
                ref={setPanelContainer}
                className="h-full overflow-hidden border-l border-border"
                style={{ width: "45%", minWidth: 380 }}
              />
            )}
          </div>
        </Sidebar>
        <CreateAgentDialog />
        <ExportAgentWizard />
        <ImportAgentWizard />
        <AgentUpdateBanner />
        <CommandPalette />
        <ShortcutCheatsheet />
        <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
      </div>
      {uiTourActive && (
        <UiTour
          steps={[
            {
              title: t("shell:uiTour.steps.assistant.title"),
              body: t("shell:uiTour.steps.assistant.body"),
              targetSelector: "[data-tour-target='agents']",
              onEnter: () => setViewMode(firstAgentTab),
            },
            {
              title: t("shell:uiTour.steps.board.title"),
              body: t("shell:uiTour.steps.board.body"),
              targetSelector: "[data-tour-target='main']",
              onEnter: () => setViewMode(firstAgentTab),
            },
            {
              title: t("shell:uiTour.steps.newMission.title"),
              body: t("shell:uiTour.steps.newMission.body"),
              targetSelector: "[data-tour-target='newMission']",
              onEnter: () => setViewMode(firstAgentTab),
            },
            {
              title: t("shell:uiTour.steps.tabActivity.title"),
              body: t("shell:uiTour.steps.tabActivity.body"),
              targetSelector: "[data-tour-target='tab-activity']",
              onEnter: () => setViewMode(tabOr("activity")),
            },
            {
              title: t("shell:uiTour.steps.tabRoutines.title"),
              body: t("shell:uiTour.steps.tabRoutines.body"),
              targetSelector: "[data-tour-target='tab-routines']",
              onEnter: () => setViewMode(tabOr("routines")),
            },
            {
              title: t("shell:uiTour.steps.tabFiles.title"),
              body: t("shell:uiTour.steps.tabFiles.body"),
              targetSelector: "[data-tour-target='tab-files']",
              onEnter: () => setViewMode(tabOr("files")),
            },
            {
              title: t("shell:uiTour.steps.tabJobDescription.title"),
              body: t("shell:uiTour.steps.tabJobDescription.body"),
              targetSelector: "[data-tour-target='tab-job-description']",
              onEnter: () => setViewMode(tabOr("job-description")),
            },
            {
              title: t("shell:uiTour.steps.missionControl.title"),
              body: t("shell:uiTour.steps.missionControl.body"),
              targetSelector: "[data-tour-target='nav-dashboard']",
              onEnter: () => setViewMode("dashboard"),
            },
            {
              title: t("shell:uiTour.steps.integrations.title"),
              body: t("shell:uiTour.steps.integrations.body"),
              targetSelector: "[data-tour-target='nav-connections']",
              onEnter: () => setViewMode("connections"),
            },
            {
              title: t("shell:uiTour.steps.appTour.title"),
              body: t("shell:uiTour.steps.appTour.body"),
              targetSelector: "[data-tour-target='appTour']",
              onEnter: () => {
                setCreateAgentDialogOpen(false);
                setViewMode(firstAgentTab);
              },
            },
            {
              title: t("shell:uiTour.steps.newAgent.title"),
              body: t("shell:uiTour.steps.newAgent.body"),
              targetSelector: "[data-tour-target='newAgent']",
              onEnter: () => {
                setCreateAgentDialogOpen(false);
                setViewMode(firstAgentTab);
              },
            },
            {
              title: t("shell:uiTour.steps.agentStore.title"),
              body: t("shell:uiTour.steps.agentStore.body"),
              targetSelector: "[data-tour-target='agentStore']",
              spotlightPadding: 4,
              placement: "viewport-right",
              onEnter: () => setCreateAgentDialogOpen(true),
            },
            {
              title: t("shell:uiTour.steps.outro.title"),
              body: t("shell:uiTour.steps.outro.body"),
              confirmLabel: t("shell:uiTour.steps.outro.confirm"),
              onEnter: () => setCreateAgentDialogOpen(false),
            },
          ]}
          onDismiss={() => {
            setUiTourActive(false);
            setCreateAgentDialogOpen(false);
          }}
        />
      )}
    </DetailPanelProvider>
  );
}
