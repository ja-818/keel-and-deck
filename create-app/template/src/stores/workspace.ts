import { create } from "zustand";
import { tauriProjects, tauriSessions } from "../lib/tauri";
import type { Project } from "../lib/types";

const DEFAULT_NAME = "Workspace";
const DOCUMENTS_BASE = "~/Documents/{{APP_NAME_TITLE}}";

interface WorkspaceState {
  workspace: Project | null;
  ready: boolean;
  init: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: null,
  ready: false,

  init: async () => {
    const projects = await tauriProjects.list();

    if (projects.length === 0) {
      const ws = await tauriProjects.create(
        DEFAULT_NAME,
        `${DOCUMENTS_BASE}/${DEFAULT_NAME}/`,
      );
      await tauriSessions.ensureWorkspace(ws.id);
      set({ workspace: ws, ready: true });
      return;
    }

    const ws = projects[0];
    await tauriSessions.ensureWorkspace(ws.id);
    set({ workspace: ws, ready: true });
  },
}));
