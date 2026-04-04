import { invoke } from "@tauri-apps/api/core";
import type {
  Agent,
  SkillSummary,
  SkillDetail,
  FileEntry,
  MemorySnapshot,
} from "./types";

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

export const tauriSkills = {
  list: (workspacePath: string) =>
    invoke<SkillSummary[]>("list_skills", { workspacePath }),
  load: (workspacePath: string, name: string) =>
    invoke<SkillDetail>("load_skill", { workspacePath, name }),
  create: (workspacePath: string, name: string, description: string, content: string) =>
    invoke<void>("create_skill", { workspacePath, name, description, content }),
  delete: (workspacePath: string, name: string) =>
    invoke<void>("delete_skill", { workspacePath, name }),
  save: (workspacePath: string, name: string, content: string) =>
    invoke<void>("save_skill", { workspacePath, name, content }),
};

export const tauriMemory = {
  load: (workspacePath: string) =>
    invoke<MemorySnapshot>("load_memory", { workspacePath }),
  addEntry: (workspacePath: string, target: string, text: string) =>
    invoke<void>("add_memory_entry", { workspacePath, target, text }),
  replaceEntry: (
    workspacePath: string,
    target: string,
    index: number,
    text: string,
  ) =>
    invoke<void>("replace_memory_entry", {
      workspacePath,
      target,
      index,
      text,
    }),
  removeEntry: (workspacePath: string, target: string, index: number) =>
    invoke<void>("remove_memory_entry", { workspacePath, target, index }),
};

export const tauriFiles = {
  list: (workspacePath: string) =>
    invoke<FileEntry[]>("list_project_files", { workspacePath }),
  open: (workspacePath: string, relativePath: string) =>
    invoke<void>("open_file", { workspacePath, relativePath }),
  reveal: (workspacePath: string, relativePath: string) =>
    invoke<void>("reveal_file", { workspacePath, relativePath }),
  delete: (workspacePath: string, relativePath: string) =>
    invoke<void>("delete_file", { workspacePath, relativePath }),
  revealWorkspace: (workspacePath: string) =>
    invoke<void>("reveal_workspace", { workspacePath }),
};
