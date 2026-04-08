import { useCallback, useMemo } from "react";
import { ToolBlock } from "@houston-ai/chat";
import type { ToolEntry } from "@houston-ai/chat";
import { FileCard } from "../components/file-card";

/** Tool short names that produce files the user might want to open. */
const FILE_TOOLS = new Set(["Write", "Edit"]);

function shortName(name: string): string {
  return name.includes("__") ? name.split("__").pop()! : name;
}

/**
 * Returns `isSpecialTool` and `renderToolResult` callbacks for rendering
 * clickable file cards on Write/Edit tool results.
 */
export function useFileToolRenderer(agentPath: string) {
  const isSpecialTool = useCallback(
    (toolName: string) => FILE_TOOLS.has(shortName(toolName)),
    [],
  );

  const renderToolResult = useCallback(
    (tool: ToolEntry, index: number) => {
      const inp = tool.input as Record<string, unknown> | null | undefined;
      const filePath = inp?.file_path as string | undefined;
      const isError = tool.result?.is_error ?? false;

      return (
        <div key={index} className="space-y-2">
          <ToolBlock tool={tool} isActive={false} />
          {filePath && !isError && (
            <FileCard filePath={filePath} agentPath={agentPath} />
          )}
        </div>
      );
    },
    [agentPath],
  );

  return useMemo(
    () => ({ isSpecialTool, renderToolResult }),
    [isSpecialTool, renderToolResult],
  );
}
