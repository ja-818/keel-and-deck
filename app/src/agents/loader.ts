import { builtinConfigs } from "./builtin";
import type { AgentDefinition, AgentConfig } from "../lib/types";

export async function loadAllConfigs(): Promise<AgentDefinition[]> {
  const byId = new Map<string, AgentDefinition>();

  for (const cfg of builtinConfigs) {
    byId.set(cfg.id, { config: cfg, source: "builtin" });
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const installed = await invoke<Array<{ config: AgentConfig; path: string }>>(
      "list_installed_configs"
    );
    for (const inst of installed) {
      byId.set(inst.config.id, {
        config: inst.config,
        source: "installed",
        path: inst.path,
      });
    }
  } catch {
    console.warn("Could not load installed agent configs");
  }

  return Array.from(byId.values());
}
