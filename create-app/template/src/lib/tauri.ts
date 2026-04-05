import { invoke } from "@tauri-apps/api/core";
import type { ConnectionsResult } from "@houston-ai/connections";
import type {
  Agent,
  SkillSummary,
  SkillDetail,
  CommunitySkillResult,
  FileEntry,
  LearningsData,
  ChannelEntry,
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
  installFromRepo: (workspacePath: string, source: string) =>
    invoke<string[]>("install_skills_from_repo", { workspacePath, source }),
  searchCommunity: (query: string) =>
    invoke<CommunitySkillResult[]>("search_community_skills", { query }),
  installCommunity: (workspacePath: string, source: string, skillId: string) =>
    invoke<string>("install_community_skill", { workspacePath, source, skillId }),
};

export const tauriLearnings = {
  load: (workspacePath: string) =>
    invoke<LearningsData>("load_learnings", { workspacePath }),
  add: (workspacePath: string, text: string) =>
    invoke<void>("add_learning", { workspacePath, text }),
  replace: (workspacePath: string, index: number, text: string) =>
    invoke<void>("replace_learning", { workspacePath, index, text }),
  remove: (workspacePath: string, index: number) =>
    invoke<void>("remove_learning", { workspacePath, index }),
};

export const tauriConnections = {
  list: () => invoke<ConnectionsResult>("list_composio_connections"),
};

export const tauriChannels = {
  list: (workspacePath: string) =>
    invoke<ChannelEntry[]>("list_channels_config", { workspacePath }),
  add: (workspacePath: string, input: { channel_type: string; name: string; token: string }) =>
    invoke<ChannelEntry>("add_channel_config", { workspacePath, input }),
  remove: (workspacePath: string, channelId: string) =>
    invoke<void>("remove_channel_config", { workspacePath, channelId }),
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
  rename: (workspacePath: string, relativePath: string, newName: string) =>
    invoke<void>("rename_file", { workspacePath, relativePath, newName }),
  createFolder: (workspacePath: string, name: string) =>
    invoke<void>("create_workspace_folder", { workspacePath, folderName: name }),
  revealWorkspace: (workspacePath: string) =>
    invoke<void>("reveal_workspace", { workspacePath }),
};
