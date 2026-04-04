import { invoke } from "@tauri-apps/api/core";
import type { Project } from "./types";

/** Type-safe wrappers around Tauri invoke() calls. */

export const tauriProjects = {
  list: () => invoke<Project[]>("list_projects"),
  create: (name: string, folderPath: string) =>
    invoke<Project>("create_project", { name, folderPath }),
};

export const tauriSessions = {
  ensureWorkspace: (projectId: string) =>
    invoke<void>("ensure_workspace", { projectId }),
  start: (projectId: string, prompt: string) =>
    invoke<string>("start_session", { projectId, prompt }),
  loadFeed: (projectId: string) =>
    invoke<Array<{ feed_type: string; data: unknown }>>(
      "load_chat_feed",
      { projectId },
    ),
};

export const tauriWorkspace = {
  readFile: (projectId: string, fileName: string) =>
    invoke<string>("read_workspace_file", { projectId, fileName }),
  writeFile: (projectId: string, fileName: string, content: string) =>
    invoke<void>("write_workspace_file", { projectId, fileName, content }),
};
