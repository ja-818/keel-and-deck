import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { ConnectionRow } from "./connection-row";
import type { Connection, ConnectionsResult } from "./types";

export interface ConnectionsViewProps {
  result: ConnectionsResult | null;
  loading: boolean;
  onRetry: () => void;
  onManage: () => void;
}

export function ConnectionsView({
  result,
  loading,
  onRetry,
  onManage,
}: ConnectionsViewProps) {
  const items: Connection[] =
    result?.status === "ok" ? result.connections : [];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">
        {/* Header -- only when there are connections */}
        {!loading && items.length > 0 && (
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-[#0d0d0d] tracking-tight">
                Connected apps
              </h1>
              <p className="text-[13px] text-[#8e8e8e] mt-1">
                Services Houston can use across all your projects
              </p>
            </div>
            <button
              onClick={onManage}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-[#0d0d0d] text-white text-xs font-medium hover:bg-[#424242] transition-colors duration-200 shrink-0"
            >
              Manage connections
              <ExternalLink className="size-3" />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="size-5 text-[#b4b4b4] animate-spin" />
            <p className="text-[13px] text-[#8e8e8e]">
              Checking your connections...
            </p>
          </div>
        )}

        {/* Not configured */}
        {!loading && result?.status === "not_configured" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="space-y-2 text-center max-w-md">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Connect your apps
              </h1>
              <p className="text-sm text-[#5d5d5d]">
                Set up Composio so Houston can use Gmail, Slack, Google Drive,
                and 100+ other services on your behalf.
              </p>
            </div>
            <button
              onClick={onManage}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#0d0d0d] text-white text-sm font-medium hover:bg-[#424242] transition-colors duration-200"
            >
              Set up connections
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        )}

        {/* Needs auth */}
        {!loading && result?.status === "needs_auth" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="space-y-2 text-center max-w-md">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Composio needs authentication
              </h1>
              <p className="text-sm text-[#5d5d5d]">
                Open Claude Code in your terminal and type{" "}
                <code className="px-1.5 py-0.5 bg-[#f4f4f4] rounded text-[13px]">
                  /mcp
                </code>{" "}
                to complete the OAuth setup for Composio.
              </p>
            </div>
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#0d0d0d] text-white text-sm font-medium hover:bg-[#424242] transition-colors duration-200"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Error */}
        {!loading && result?.status === "error" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="space-y-2 text-center max-w-md">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Couldn't load connections
              </h1>
              <p className="text-sm text-[#5d5d5d]">
                Composio is set up but we couldn't fetch your connections. This
                can happen if your authentication expired or the service is
                temporarily unavailable.
              </p>
              <p className="text-xs text-[#8e8e8e] font-mono mt-2">
                {result.message}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#0d0d0d] text-white text-sm font-medium hover:bg-[#424242] transition-colors duration-200"
              >
                <RefreshCw className="size-3.5" />
                Retry
              </button>
              <button
                onClick={onManage}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-black/15 bg-white text-[#0d0d0d] text-sm font-medium hover:bg-gray-50 transition-colors duration-200"
              >
                Reconnect
                <ExternalLink className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Empty -- configured, no active connections */}
        {!loading && result?.status === "ok" && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="space-y-2 text-center max-w-md">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                No apps connected yet
              </h1>
              <p className="text-sm text-[#5d5d5d]">
                Connect Gmail, Slack, Google Drive, and 100+ other services so
                Houston can use them across all your projects.
              </p>
            </div>
            <button
              onClick={onManage}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#0d0d0d] text-white text-sm font-medium hover:bg-[#424242] transition-colors duration-200"
            >
              Add a connection
              <ExternalLink className="size-3.5" />
            </button>
          </div>
        )}

        {/* Connection grid */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {items.map((conn) => (
              <ConnectionRow key={conn.toolkit} connection={conn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
