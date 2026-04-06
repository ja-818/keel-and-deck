import type { ReactNode } from "react";
import { LayoutDashboard, Link2, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  ScrollArea,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { useSpaceStore } from "../../stores/spaces";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useExperienceStore } from "../../stores/experiences";
import { useUIStore } from "../../stores/ui";
import { SpaceSwitcher, SidebarNavItem } from "./sidebar-parts";

export function Sidebar({ children }: { children: ReactNode }) {
  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpace = useSpaceStore((s) => s.current);
  const setCurrentSpace = useSpaceStore((s) => s.setCurrent);
  const createSpace = useSpaceStore((s) => s.create);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const current = useWorkspaceStore((s) => s.current);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);

  const getById = useExperienceStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setDialogOpen = useUIStore((s) => s.setCreateWorkspaceDialogOpen);

  const sorted = [...workspaces].sort((a, b) => {
    const aTime = a.lastOpenedAt ?? a.createdAt;
    const bTime = b.lastOpenedAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });

  const handleSpaceSwitch = async (spaceId: string) => {
    if (spaceId === currentSpace?.id) return;
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    setCurrentSpace(space);
    await loadWorkspaces(space.id);
  };

  const handleCreateSpace = async () => {
    const name = window.prompt("Space name");
    if (!name?.trim()) return;
    const space = await createSpace(name.trim());
    setCurrentSpace(space);
    await loadWorkspaces(space.id);
  };

  const handleSelectWorkspace = (wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId);
    if (!ws) return;
    setCurrent(ws);
    const exp = getById(ws.experienceId);
    setViewMode(exp?.manifest.defaultTab ?? "chat");
  };

  const renameWs = useWorkspaceStore((s) => s.rename);
  const deleteWs = useWorkspaceStore((s) => s.delete);

  const handleRename = async (wsId: string, currentName: string) => {
    const newName = window.prompt("Rename workspace", currentName);
    if (!newName?.trim() || newName.trim() === currentName) return;
    if (!currentSpace) return;
    await renameWs(currentSpace.id, wsId, newName.trim());
  };

  const handleDelete = async (wsId: string) => {
    if (!currentSpace) return;
    if (!window.confirm("Delete this workspace? This cannot be undone.")) return;
    await deleteWs(currentSpace.id, wsId);
  };

  const isTopLevel = viewMode === "dashboard" || viewMode === "connections";

  return (
    <div className="flex h-full">
      <aside className="w-[200px] flex-shrink-0 bg-secondary border-r border-border flex flex-col">
        <SpaceSwitcher
          spaces={spaces}
          currentId={currentSpace?.id ?? null}
          currentName={currentSpace?.name ?? "Select space"}
          onSwitch={handleSpaceSwitch}
          onCreate={handleCreateSpace}
        />

        <nav className="px-2 py-1 space-y-0.5">
          <SidebarNavItem
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Dashboard"
            active={viewMode === "dashboard"}
            onClick={() => setViewMode("dashboard")}
          />
          <SidebarNavItem
            icon={<Link2 className="h-4 w-4" />}
            label="Connections"
            active={viewMode === "connections"}
            onClick={() => setViewMode("connections")}
          />
        </nav>

        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Your AI Workspaces
          </span>
          <button
            onClick={() => setDialogOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-0.5 pb-2">
            {sorted.map((ws) => {
              const isSelected = !isTopLevel && current?.id === ws.id;
              return (
                <div
                  key={ws.id}
                  className={`group flex items-center rounded-lg transition-colors ${
                    isSelected
                      ? "bg-accent font-medium text-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <button
                    onClick={() => handleSelectWorkspace(ws.id)}
                    className="flex-1 text-left text-sm py-1.5 px-2.5 truncate"
                  >
                    {ws.name}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 transition-opacity">
                        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="bottom">
                      <DropdownMenuItem onClick={() => handleRename(ws.id, ws.name)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(ws.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </ScrollArea>

      </aside>

      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">{children}</div>
    </div>
  );
}
