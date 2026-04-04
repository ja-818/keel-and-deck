import { invoke } from "@tauri-apps/api/core";
import type { Agent } from "./types";

export const tauriAgents = {
  list: () => invoke<Agent[]>("list_agents"),
  create: (name: string) => invoke<Agent>("create_agent", { name }),
  rename: (path: string, newName: string) =>
    invoke<Agent>("rename_agent", { agentPath: path, newName }),
  delete: (path: string) => invoke<void>("delete_agent", { agentPath: path }),
};

export const tauriChat = {
  send: (workspacePath: string, prompt: string) =>
    invoke<string>("send_message", {
      workspacePath,
      prompt,
    }),
  loadHistory: (workspacePath: string) =>
    invoke<Array<{ feed_type: string; data: unknown }>>(
      "load_chat_history",
      { workspacePath },
    ),
};

export const tauriWorkspace = {
  readFile: (workspacePath: string, name: string) =>
    invoke<string>("read_workspace_file", { workspacePath, name }),
  writeFile: (workspacePath: string, name: string, content: string) =>
    invoke<void>("write_workspace_file", {
      workspacePath,
      name,
      content,
    }),
};
