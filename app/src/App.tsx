import "./styles/globals.css";
import { ToastContainer } from "@houston-ai/core";
import type { Toast } from "@houston-ai/core";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Button,
} from "@houston-ai/core";
import { TabBar } from "@houston-ai/layout";
import { useHoustonInit } from "./hooks/use-houston-init";
import { useSessionEvents } from "./hooks/use-session-events";
import { useWorkspaceStore } from "./stores/workspaces";
import { useExperienceStore } from "./stores/experiences";
import { useUIStore } from "./stores/ui";
import { Sidebar } from "./components/shell/sidebar";
import { CreateWorkspaceDialog } from "./components/shell/create-workspace-dialog";
import { ExperienceRenderer } from "./components/shell/experience-renderer";

export default function App() {
  useHoustonInit();
  useSessionEvents();

  const current = useWorkspaceStore((s) => s.current);
  const loading = useWorkspaceStore((s) => s.loading);
  const getById = useExperienceStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);
  const setDialogOpen = useUIStore((s) => s.setCreateWorkspaceDialogOpen);

  const experience = current ? getById(current.experienceId) : undefined;
  const tabs = experience?.manifest.tabs ?? [];
  const activeTab = tabs.find((t) => t.id === viewMode) ?? tabs[0];

  // Map UIStore toasts to ToastContainer format
  const mappedToasts: Toast[] = toasts.map((t) => ({
    id: t.id,
    message: t.title,
    variant: "info" as const,
  }));

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground text-sm">Starting...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar>
        <main className="flex-1 flex flex-col min-w-0">
          {current && experience && activeTab ? (
            <>
              <TabBar
                title={current.name}
                tabs={tabs.map((t) => ({ id: t.id, label: t.label }))}
                activeTab={viewMode}
                onTabChange={setViewMode}
              />
              <div className="flex-1 flex overflow-hidden">
                <ExperienceRenderer
                  experience={experience}
                  workspace={current}
                  activeTab={activeTab}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyTitle>Welcome to Houston</EmptyTitle>
                  <EmptyDescription>
                    Create your first workspace to get started.
                  </EmptyDescription>
                </EmptyHeader>
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="mt-4 rounded-full"
                >
                  New workspace
                </Button>
              </Empty>
            </div>
          )}
        </main>
      </Sidebar>

      <CreateWorkspaceDialog />
      <ToastContainer toasts={mappedToasts} onDismiss={dismissToast} />
    </div>
  );
}
