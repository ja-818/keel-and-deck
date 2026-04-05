import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "../lib/types";

interface WorkspaceState {
  workspaces: Workspace[];
  current: Workspace | null;
  loading: boolean;
  loadWorkspaces: () => Promise<void>;
  setCurrent: (ws: Workspace) => void;
  create: (name: string, experienceId: string) => Promise<Workspace>;
  delete: (id: string) => Promise<void>;
  rename: (id: string, newName: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  current: null,
  loading: false,

  loadWorkspaces: async () => {
    set({ loading: true });
    try {
      const workspaces = await invoke<Workspace[]>("list_workspaces");
      const current = get().current;
      const selected =
        workspaces.find((w) => w.id === current?.id) ?? null;
      set({ workspaces, current: selected, loading: false });
    } catch (e) {
      console.error("[workspaces] Failed to load:", e);
      set({ loading: false });
    }
  },

  setCurrent: (ws) => {
    set({ current: ws });
    invoke("set_preference", {
      key: "last_workspace_id",
      value: ws.id,
    }).catch((e) => console.error("[workspaces] Failed to save preference:", e));
  },

  create: async (name, experienceId) => {
    const ws = await invoke<Workspace>("create_workspace", {
      name,
      experienceId,
    });
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      current: ws,
    }));
    invoke("set_preference", {
      key: "last_workspace_id",
      value: ws.id,
    }).catch((e) => console.error("[workspaces] Failed to save preference:", e));
    return ws;
  },

  delete: async (id) => {
    await invoke<void>("delete_workspace", { workspaceId: id });
    set((s) => {
      const workspaces = s.workspaces.filter((w) => w.id !== id);
      const current =
        s.current?.id === id ? workspaces[0] ?? null : s.current;
      return { workspaces, current };
    });
  },

  rename: async (id, newName) => {
    await invoke<void>("rename_workspace", { workspaceId: id, newName });
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, name: newName } : w,
      ),
      current: s.current?.id === id ? { ...s.current, name: newName } : s.current,
    }));
  },
}));
