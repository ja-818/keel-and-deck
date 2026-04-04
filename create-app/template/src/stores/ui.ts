import { create } from "zustand";

export type ViewMode = "chat" | "claude-md";

interface UIState {
  viewMode: ViewMode;
  currentSessionId: string | null;
  setViewMode: (mode: ViewMode) => void;
  setCurrentSessionId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "chat",
  currentSessionId: null,
  setViewMode: (viewMode) => set({ viewMode }),
  setCurrentSessionId: (currentSessionId) => set({ currentSessionId }),
}));
