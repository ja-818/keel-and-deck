import { create } from "zustand";
import { loadAllConfigs } from "../agents/loader";
import type { AgentDefinition } from "../lib/types";

interface AgentCatalogState {
  agents: AgentDefinition[];
  loading: boolean;
  loadConfigs: () => Promise<void>;
  getById: (id: string) => AgentDefinition | undefined;
}

export const useAgentCatalogStore = create<AgentCatalogState>((set, get) => ({
  agents: [],
  loading: false,

  loadConfigs: async () => {
    set({ loading: true });
    try {
      const agents = await loadAllConfigs();
      set({ agents, loading: false });
    } catch (e) {
      console.error("[agent-catalog] Failed to load:", e);
      set({ loading: false });
    }
  },

  getById: (id) => get().agents.find((a) => a.config.id === id),
}));
