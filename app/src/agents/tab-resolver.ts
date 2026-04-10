import { lazy, type ComponentType } from "react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";
import type { AgentTab, AgentDefinition, TabProps } from "../lib/types";

// Expose React on window so IIFE agent bundles can access it via globals
(window as any).Houston = { React, ReactDOM, jsxRuntime };
import ChatTab from "../components/tabs/chat-tab";
import BoardTab from "../components/tabs/board-tab";
import FilesTab from "../components/tabs/files-tab";
import ConnectionsTab from "../components/tabs/connections-tab";
import IntegrationsTab from "../components/tabs/integrations-tab";
import JobDescriptionTab from "../components/tabs/job-description-tab";
import RoutinesTab from "../components/tabs/routines-tab";
import EventsTab from "../components/tabs/events-tab";

const BUILTIN_TABS: Record<string, ComponentType<TabProps>> = {
  chat: ChatTab,
  board: BoardTab,
  files: FilesTab,
  integrations: IntegrationsTab,
  connections: ConnectionsTab,
  "job-description": JobDescriptionTab,
  routines: RoutinesTab,
  events: EventsTab,
};

// Cache for custom bundle components so they're not re-created on every render
const bundleCache = new Map<string, ComponentType<TabProps>>();

export function resolveTabComponent(
  tab: AgentTab,
  agentDef: AgentDefinition,
): ComponentType<TabProps> {
  // Built-in tab — eager, no loading delay
  if (tab.builtIn && BUILTIN_TABS[tab.builtIn]) {
    return BUILTIN_TABS[tab.builtIn];
  }

  // Custom component from bundle (tier 2) — lazy with cache
  // Bundles are IIFE format that access React via window.Houston globals.
  // We read the JS, evaluate it via <script>, and read exports from window.
  if (tab.customComponent && agentDef.path) {
    const cacheKey = `${agentDef.path}:${tab.customComponent}`;
    if (!bundleCache.has(cacheKey)) {
      const component = lazy(async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        const code = await invoke<string>("read_agent_file", {
          agent_path: agentDef.path,
          name: "bundle.js",
        });
        // Evaluate the IIFE — it assigns exports to window.__houston_bundle__
        const script = document.createElement("script");
        script.textContent = code;
        document.head.appendChild(script);
        document.head.removeChild(script);
        // Read and clean up the global
        const exports = (window as any).__houston_bundle__;
        (window as any).__houston_bundle__ = undefined;
        if (!exports) throw new Error("Bundle did not register exports");
        const Component = exports[tab.customComponent!];
        if (!Component) throw new Error(`Bundle does not export "${tab.customComponent}"`);
        return { default: Component };
      });
      bundleCache.set(cacheKey, component);
    }
    return bundleCache.get(cacheKey)!;
  }

  // Fallback
  return BUILTIN_TABS.chat;
}
