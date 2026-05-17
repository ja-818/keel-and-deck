export interface DispatchAgentIntent {
  id?: string;
  name: string;
  rolePrompt: string;
  taskPrompt: string;
  prompt?: string;
  dependsOn?: string[];
}

export interface SaveAgentIntent {
  name: string;
  agentPath: string;
}

export interface AdjustAgentIntent {
  adjustment: string;
  targetNodeIds: string[];
}

export interface DispatchLinks {
  content: string;
  createAgentIntents: string[];
  adjustAgentIntents: AdjustAgentIntent[];
  saveAgentIntents: string[];
  pendingAction: DispatchActionKind | null;
}

export function decodeCreateAgentIntents(intentsJson: string): DispatchAgentIntent[] {
  try {
    const parsed = parseMaybeEncodedJson(intentsJson);
    if (Array.isArray(parsed)) {
      const normalized = parsed.map(normalizeDispatchIntent);
      if (normalized.every((item): item is DispatchAgentIntent => item != null)) {
        return normalized;
      }
    }
  } catch {
    // Invalid assistant link, ignore it in the UI.
  }
  return [];
}

function normalizeDispatchIntent(item: unknown): DispatchAgentIntent | null {
  if (!item || typeof item !== "object") return null;
  const value = item as {
    id?: unknown;
    name?: unknown;
    rolePrompt?: unknown;
    taskPrompt?: unknown;
    prompt?: unknown;
    dependsOn?: unknown;
  };
  if (value.id !== undefined && typeof value.id !== "string") return null;
  if (typeof value.name !== "string") return null;
  if (
    value.dependsOn !== undefined &&
    (!Array.isArray(value.dependsOn) ||
      !value.dependsOn.every((dep: unknown) => typeof dep === "string"))
  ) {
    return null;
  }

  const legacyPrompt = typeof value.prompt === "string" ? value.prompt : "";
  const rolePrompt =
    typeof value.rolePrompt === "string" && value.rolePrompt.trim().length > 0
      ? value.rolePrompt
      : legacyPrompt
        ? `You are a reusable specialized agent named ${value.name}. Understand the user's mission, ask one targeted question if essential context is missing, and deliver complete work in plain language.`
        : "";
  const taskPrompt =
    typeof value.taskPrompt === "string" && value.taskPrompt.trim().length > 0
      ? value.taskPrompt
      : legacyPrompt;
  if (rolePrompt.trim().length === 0 || taskPrompt.trim().length === 0) {
    return null;
  }
  const normalized: DispatchAgentIntent = {
    name: value.name,
    rolePrompt,
    taskPrompt,
  };
  if (value.id !== undefined) normalized.id = value.id;
  if (legacyPrompt) normalized.prompt = legacyPrompt;
  if (value.dependsOn !== undefined) normalized.dependsOn = value.dependsOn;
  return normalized;
}

export function decodeSaveAgentIntents(agentsJson: string): SaveAgentIntent[] {
  try {
    const parsed = parseMaybeEncodedJson(agentsJson);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof item.name === "string" &&
          typeof item.agentPath === "string",
      )
    ) {
      return parsed;
    }
  } catch {
    // Invalid assistant link, ignore it in the UI.
  }
  return [];
}

export function decodeAdjustAgentIntent(intentJson: string): AdjustAgentIntent | null {
  try {
    const parsed = parseMaybeEncodedJson(intentJson);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { adjustment?: unknown }).adjustment === "string" &&
      Array.isArray((parsed as { targetNodeIds?: unknown }).targetNodeIds) &&
      (parsed as { targetNodeIds: unknown[] }).targetNodeIds.every(
        (nodeId) => typeof nodeId === "string",
      )
    ) {
      return {
        adjustment: (parsed as { adjustment: string }).adjustment,
        targetNodeIds: (parsed as { targetNodeIds: string[] }).targetNodeIds,
      };
    }
  } catch {
    // Invalid assistant link, ignore it in the UI.
  }
  return null;
}

export function parseCreateAgentsFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.pathname !== "/_/create-agents") return null;
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const intents = params.get("intents");
    return intents && intents.length > 0 ? intents : null;
  } catch {
    return null;
  }
}

export function parseAdjustAgentsFromHref(href: string): AdjustAgentIntent | null {
  try {
    const url = new URL(href);
    if (url.pathname !== "/_/adjust-agents") return null;
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const intent = params.get("intent");
    if (!intent) return null;
    const decoded = decodeAdjustAgentIntent(intent);
    return decoded && decoded.adjustment.trim().length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function extractDispatchLinks(content: string): DispatchLinks {
  const create = extractMarkdownDispatchLinks(
    content,
    "[suggest_agents](",
    "create",
    parseCreateAgentsFromHref,
    (payload) => decodeCreateAgentIntents(payload).length > 0,
  );
  const adjust = extractMarkdownDispatchLinks(
    create.content,
    "[adjust_agents](",
    "adjust",
    parseAdjustAgentsFromHref,
    (payload) => payload.adjustment.trim().length > 0,
  );
  const save = extractMarkdownDispatchLinks(
    adjust.content,
    "[save_agents](",
    "save",
    parseSaveAgentsFromHref,
    (payload) => decodeSaveAgentIntents(payload).length > 0,
  );
  return {
    content: save.content.replace(/\n{3,}/g, "\n\n").trim(),
    createAgentIntents: create.payloads,
    adjustAgentIntents: adjust.payloads,
    saveAgentIntents: save.payloads,
    pendingAction:
      save.pendingAction ?? adjust.pendingAction ?? create.pendingAction ?? null,
  };
}

function parseMaybeEncodedJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return JSON.parse(decodeURIComponent(input));
  }
}

export function parseSaveAgentsFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.pathname !== "/_/save-agents") return null;
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const agents = params.get("agents");
    return agents && agents.length > 0 ? agents : null;
  } catch {
    return null;
  }
}

export function buildAdjustDispatchActionId(
  parentAgentPath: string,
  parentSessionKey: string,
  intent: AdjustAgentIntent,
  dispatchMessageKey: string,
): string {
  const targetNodeIds = [...intent.targetNodeIds].sort();
  return `adjust-${stableHash(
    JSON.stringify({
      parentAgentPath,
      parentSessionKey,
      dispatchMessageKey,
      adjustment: normalizeActionText(intent.adjustment),
      targetNodeIds,
    }),
  )}`;
}

export function buildSaveDispatchActionId(
  parentAgentPath: string,
  parentSessionKey: string,
  agents: SaveAgentIntent[],
  dispatchMessageKey: string,
): string {
  const normalizedAgents = agents
    .map((agent) => ({
      name: normalizeActionText(agent.name),
      agentPath: agent.agentPath,
    }))
    .sort((left, right) => left.agentPath.localeCompare(right.agentPath));
  return `save-${stableHash(
    JSON.stringify({
      parentAgentPath,
      parentSessionKey,
      dispatchMessageKey,
      agents: normalizedAgents,
    }),
  )}`;
}

function normalizeActionText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
import {
  extractMarkdownDispatchLinks,
  type DispatchActionKind,
} from "./markdown-dispatch-link.ts";
