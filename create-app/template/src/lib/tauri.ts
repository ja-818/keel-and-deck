import { invoke } from "@tauri-apps/api/core";
import type { Project, Issue } from "./types";

/** Type-safe wrappers around Tauri invoke() calls. */

export const tauriProjects = {
  list: () => invoke<Project[]>("list_projects"),
  create: (name: string, folderPath: string) =>
    invoke<Project>("create_project", { name, folderPath }),
};

export const tauriIssues = {
  list: (projectId: string) =>
    invoke<Issue[]>("list_issues", { projectId }),
  create: (projectId: string, title: string, description: string) =>
    invoke<Issue>("create_issue", { projectId, title, description }),
};

export const tauriSessions = {
  start: (projectId: string, prompt: string) =>
    invoke<string>("start_session", { projectId, prompt }),
};
