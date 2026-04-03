/**
 * Chat helper components -- tool activity display.
 *
 * Generic version: no Houston-specific tool detection. Consumers can provide
 * custom tool mappings or a renderToolResult render prop to handle
 * application-specific tool results.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ToolEntry } from "./feed-to-messages";
import { Loader2, CheckIcon } from "lucide-react";

// Re-export types and conversion for convenient imports
export type { ToolEntry, ChatMessage } from "./feed-to-messages";
export { feedItemsToMessages } from "./feed-to-messages";

// ---------------------------------------------------------------------------
// ToolActivity -- shows tool usage with a live, alive feel
// ---------------------------------------------------------------------------

const DEFAULT_TOOL_LABELS: Record<string, string> = {
  Read: "Reading file",
  Write: "Writing file",
  Edit: "Editing file",
  Bash: "Running command",
  Glob: "Searching files",
  Grep: "Searching code",
  WebSearch: "Searching the web",
  WebFetch: "Fetching page",
  ToolSearch: "Looking up tools",
};

function humanizeToolName(
  name: string,
  customLabels?: Record<string, string>,
): string {
  const short = name.includes("__") ? name.split("__").pop()! : name;
  const labels = { ...DEFAULT_TOOL_LABELS, ...customLabels };
  return labels[short] || short.replace(/_/g, " ");
}

interface CollapsedTool {
  name: string;
  count: number;
  hasResult: boolean;
  /** The input of the last tool in the group (shown when active) */
  lastInput?: Record<string, unknown>;
}

function collapseToolEntries(tools: ToolEntry[]): CollapsedTool[] {
  const result: CollapsedTool[] = [];
  for (const tool of tools) {
    const last = result[result.length - 1];
    if (last && last.name === tool.name) {
      last.count++;
      if (tool.result) last.hasResult = true;
      last.lastInput = tool.input as Record<string, unknown> | undefined;
    } else {
      result.push({
        name: tool.name,
        count: 1,
        hasResult: !!tool.result,
        lastInput: tool.input as Record<string, unknown> | undefined,
      });
    }
  }
  return result;
}

/**
 * Split collapsed entries into completed groups + the active tool.
 * When the last entry in a group is still running (no result, streaming),
 * peel it off as a separate "active" item so the user sees:
 *   [check] Running command 23x
 *   [spinner] Running command — npm install
 */
function splitActive(
  collapsed: CollapsedTool[],
  isStreaming: boolean,
): { completed: CollapsedTool[]; active: CollapsedTool | null } {
  if (!isStreaming || collapsed.length === 0) {
    return { completed: collapsed, active: null };
  }
  const last = collapsed[collapsed.length - 1];
  if (last.hasResult) {
    return { completed: collapsed, active: null };
  }
  // Peel the active tool off the last group
  if (last.count > 1) {
    const completedLast = { ...last, count: last.count - 1, hasResult: true };
    const activeTool = { ...last, count: 1, hasResult: false };
    return {
      completed: [...collapsed.slice(0, -1), completedLast],
      active: activeTool,
    };
  }
  return {
    completed: collapsed.slice(0, -1),
    active: last,
  };
}

export interface ToolActivityProps {
  tools: ToolEntry[];
  isStreaming: boolean;
  /** Custom tool name → human label mappings, merged with defaults */
  toolLabels?: Record<string, string>;
}

/** Extract a short detail string from tool input for display. */
function toolDetail(input?: Record<string, unknown>): string | null {
  if (!input) return null;
  // Bash: show command
  if (typeof input.command === "string") {
    const cmd = input.command as string;
    return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
  }
  // Read/Write/Edit: show file path
  if (typeof input.file_path === "string") {
    const fp = input.file_path as string;
    const parts = fp.split("/");
    return parts.length > 2 ? parts.slice(-2).join("/") : fp;
  }
  // Grep/Glob: show pattern
  if (typeof input.pattern === "string") return input.pattern as string;
  return null;
}

export function ToolActivity({
  tools,
  isStreaming,
  toolLabels,
}: ToolActivityProps) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!isStreaming) return;
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const collapsed = collapseToolEntries(tools);
  const { completed, active } = splitActive(collapsed, isStreaming);

  return (
    <div className="space-y-0.5 py-1">
      {completed.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-xs py-0.5 text-muted-foreground/40"
        >
          <CheckIcon className="size-3 text-muted-foreground/30 shrink-0" />
          <span>{humanizeToolName(item.name, toolLabels)}</span>
          {item.count > 1 && (
            <span className="text-muted-foreground/30">{item.count}x</span>
          )}
        </div>
      ))}
      {active && (
        <div className="flex items-center gap-2 text-xs py-0.5 text-foreground/70">
          <Loader2 className="size-3 animate-spin text-foreground/40 shrink-0" />
          <span className="font-medium">
            {humanizeToolName(active.name, toolLabels)}
          </span>
          {toolDetail(active.lastInput) && (
            <span className="text-muted-foreground/40 truncate max-w-[300px]">
              {toolDetail(active.lastInput)}
            </span>
          )}
        </div>
      )}
      {isStreaming && tools.length > 0 && (
        <div className="text-[10px] text-muted-foreground/30 pl-5 pt-0.5">
          {tools.length} {tools.length === 1 ? "step" : "steps"} · {elapsed}s
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolsAndCards -- generic version with optional custom tool result rendering
// ---------------------------------------------------------------------------

export interface ToolsAndCardsProps {
  tools: ToolEntry[];
  isStreaming: boolean;
  /** Custom tool name → human label mappings for ToolActivity */
  toolLabels?: Record<string, string>;
  /**
   * Predicate to identify "special" tools that should be rendered via
   * renderToolResult instead of the default ToolActivity list.
   * Defaults to returning false (all tools shown in ToolActivity).
   */
  isSpecialTool?: (toolName: string) => boolean;
  /**
   * Render prop for special tool results. Called for each tool where
   * isSpecialTool returns true and the tool has a result.
   */
  renderToolResult?: (tool: ToolEntry, index: number) => ReactNode;
}

export function ToolsAndCards({
  tools,
  isStreaming,
  toolLabels,
  isSpecialTool,
  renderToolResult,
}: ToolsAndCardsProps) {
  const specialTools = isSpecialTool
    ? tools.filter((t) => isSpecialTool(t.name) && t.result)
    : [];
  const otherTools = isSpecialTool
    ? tools.filter((t) => !isSpecialTool(t.name))
    : tools;

  return (
    <>
      {otherTools.length > 0 && (
        <ToolActivity
          tools={otherTools}
          isStreaming={isStreaming}
          toolLabels={toolLabels}
        />
      )}
      {renderToolResult &&
        specialTools.map((t, i) => (
          <div key={`special-${i}`} className="py-3">
            {renderToolResult(t, i)}
          </div>
        ))}
    </>
  );
}
