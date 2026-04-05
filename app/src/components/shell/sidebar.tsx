import type { ReactNode } from "react";
import { AppSidebar } from "@houston-ai/layout";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useExperienceStore } from "../../stores/experiences";
import { useUIStore } from "../../stores/ui";

export function Sidebar({ children }: { children: ReactNode }) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const current = useWorkspaceStore((s) => s.current);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const rename = useWorkspaceStore((s) => s.rename);
  const deleteWs = useWorkspaceStore((s) => s.delete);
  const setDialogOpen = useUIStore((s) => s.setCreateWorkspaceDialogOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const getById = useExperienceStore((s) => s.getById);

  const sorted = [...workspaces].sort((a, b) => {
    const aTime = a.lastOpenedAt ?? a.createdAt;
    const bTime = b.lastOpenedAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });

  const items = sorted.map((ws) => {
    const exp = getById(ws.experienceId);
    const subtitle = exp?.manifest.name;
    return { id: ws.id, name: ws.name, subtitle };
  });

  const handleSelect = (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setCurrent(ws);

    // Set viewMode to the experience's default tab
    const exp = getById(ws.experienceId);
    if (exp?.manifest.defaultTab) {
      setViewMode(exp.manifest.defaultTab);
    }
  };

  return (
    <AppSidebar
      items={items}
      selectedId={current?.id ?? null}
      onSelect={handleSelect}
      onAdd={() => setDialogOpen(true)}
      onRename={(id, newName) => rename(id, newName)}
      onDelete={(id) => deleteWs(id)}
      sectionLabel="Workspaces"
    >
      {children}
    </AppSidebar>
  );
}
