import { create } from "zustand";
import { tauriAgents } from "../lib/tauri";
import type { Agent } from "../lib/types";

interface AgentState {
  agents: Agent[];
  current: Agent | null;
  ready: boolean;
  loadAgents: () => Promise<void>;
  createAgent: (name: string) => Promise<void>;
  renameAgent: (path: string, newName: string) => Promise<void>;
  deleteAgent: (path: string) => Promise<void>;
  setCurrentAgent: (agent: Agent) => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  current: null,
  ready: false,

  loadAgents: async () => {
    const agents = await tauriAgents.list();
    const current = get().current;
    const selected =
      agents.find((a) => a.path === current?.path) ?? agents[0] ?? null;
    set({ agents, current: selected, ready: true });
  },

  createAgent: async (name: string) => {
    const agent = await tauriAgents.create(name);
    set((s) => ({
      agents: [...s.agents, agent].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      current: agent,
    }));
  },

  renameAgent: async (path: string, newName: string) => {
    const agent = await tauriAgents.rename(path, newName);
    set((s) => ({
      agents: s.agents
        .map((a) => (a.path === path ? agent : a))
        .sort((a, b) => a.name.localeCompare(b.name)),
      current: s.current?.path === path ? agent : s.current,
    }));
  },

  deleteAgent: async (path: string) => {
    await tauriAgents.delete(path);
    set((s) => {
      const agents = s.agents.filter((a) => a.path !== path);
      const current =
        s.current?.path === path ? agents[0] ?? null : s.current;
      return { agents, current };
    });
  },

  setCurrentAgent: (agent) => set({ current: agent }),
}));
