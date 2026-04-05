import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useExperienceStore } from "../stores/experiences";
import { useWorkspaceStore } from "../stores/workspaces";
import { useUIStore } from "../stores/ui";

/**
 * App initialization hook. Called once in App.tsx.
 * Loads experiences, workspaces, restores last workspace,
 * checks Claude CLI availability, and sets initial viewMode.
 */
export function useHoustonInit() {
  const initRef = useRef(false);
  const loadExperiences = useExperienceStore((s) => s.loadExperiences);
  const getById = useExperienceStore((s) => s.getById);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const setCurrent = useWorkspaceStore((s) => s.setCurrent);
  const setClaudeAvailable = useUIStore((s) => s.setClaudeAvailable);
  const setViewMode = useUIStore((s) => s.setViewMode);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      // 1. Load experiences
      await loadExperiences();

      // 2. Load workspaces
      await loadWorkspaces();

      // 3. Restore last workspace from preferences
      try {
        const lastId = await invoke<string | null>("get_preference", {
          key: "last_workspace_id",
        });
        if (lastId) {
          const workspaces = useWorkspaceStore.getState().workspaces;
          const saved = workspaces.find((w) => w.id === lastId);
          if (saved) {
            setCurrent(saved);

            // Set initial viewMode from experience's defaultTab
            const experience = useExperienceStore
              .getState()
              .getById(saved.experienceId);
            if (experience?.manifest.defaultTab) {
              setViewMode(experience.manifest.defaultTab);
            }
          }
        }
      } catch (e) {
        console.error("[init] Failed to restore last workspace:", e);
      }

      // 4. Check Claude CLI availability
      try {
        const available = await invoke<boolean>("check_claude_cli");
        setClaudeAvailable(available);
      } catch {
        setClaudeAvailable(false);
      }
    }

    init();
  }, [loadExperiences, loadWorkspaces, setCurrent, setClaudeAvailable, setViewMode, getById]);
}
