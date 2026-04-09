import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import {
  Empty, EmptyHeader, EmptyTitle, EmptyDescription,
} from "@houston-ai/core";
import { ConnectionRow } from "@houston-ai/connections";
import type { Connection } from "@houston-ai/connections";
import houstonBlack from "../../assets/houston-black.svg";

export function LoadingState() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Next frame: flip width to 100% so the transition actually animates.
    const raf = requestAnimationFrame(() => {
      if (barRef.current) barRef.current.style.width = "100%";
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Empty className="border-0">
      <img
        src={houstonBlack}
        alt="Houston"
        className="h-12 w-auto mb-2 animate-pulse"
      />
      <EmptyHeader>
        <EmptyTitle>Loading your integrations</EmptyTitle>
        <EmptyDescription>
          This can take up to two minutes on first load. Hang tight —
          we're checking every connected app.
        </EmptyDescription>
      </EmptyHeader>
      <div className="w-48 h-[2px] rounded-full bg-black/10 overflow-hidden">
        <div
          ref={barRef}
          className="h-full bg-black rounded-full"
          style={{ width: "0%", transition: "width 120s linear" }}
        />
      </div>
    </Empty>
  );
}

export function NotConfiguredState({ onAuth }: { onAuth: () => void }) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>Connect your apps</EmptyTitle>
        <EmptyDescription>
          Sign in to Composio so your agent can use Gmail, Slack, Google
          Drive, and 100+ other services on your behalf.
        </EmptyDescription>
      </EmptyHeader>
      <button
        onClick={onAuth}
        className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200"
      >
        Sign in to Composio
      </button>
    </Empty>
  );
}

export function NeedsAuthState({ onAuth }: { onAuth: () => void }) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>Connect to Composio</EmptyTitle>
        <EmptyDescription>
          Sign in to Composio so your agent can use Gmail, Slack, Google
          Drive, and 100+ other services on your behalf.
        </EmptyDescription>
      </EmptyHeader>
      <button
        onClick={onAuth}
        className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200"
      >
        Sign in to Composio
      </button>
    </Empty>
  );
}

export function ErrorState({
  message,
  onRetry,
  onReconnect,
}: {
  message: string;
  onRetry: () => void;
  onReconnect: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="space-y-2 text-center max-w-md">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Couldn't load integrations
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200"
        >
          Retry
        </button>
        <button
          onClick={onReconnect}
          className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-border bg-background text-foreground text-xs font-medium hover:bg-secondary transition-colors duration-200"
        >
          Reconnect
          <ExternalLink className="size-3" />
        </button>
      </div>
    </div>
  );
}

interface TrackedEntry {
  toolkit: string;
  use_count: number;
  last_used_at: string;
}

export function UsedSection({
  connections,
  tracked,
}: {
  connections: Connection[];
  tracked: TrackedEntry[];
}) {
  if (connections.length === 0) return null;

  const trackedMap = new Map(tracked.map((t) => [t.toolkit, t]));

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-medium text-foreground">
          Used by this agent
        </h2>
        <span className="text-xs text-muted-foreground">
          ({connections.length})
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {connections.map((conn) => {
          const info = trackedMap.get(conn.toolkit);
          return (
            <div key={conn.toolkit} className="relative">
              <ConnectionRow connection={conn} />
              {info && (
                <p className="text-[11px] text-muted-foreground ml-[54px] -mt-2 pb-1">
                  Used {info.use_count} {info.use_count === 1 ? "time" : "times"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AvailableSection({
  connections,
  hasUsed,
  onManage,
}: {
  connections: Connection[];
  hasUsed: boolean;
  onManage: () => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-foreground">
          {hasUsed ? "Available integrations" : "Connected apps"}
        </h2>
        <button
          onClick={onManage}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200"
        >
          Manage
          <ExternalLink className="size-3" />
        </button>
      </div>
      {connections.length === 0 && !hasUsed && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No apps connected yet. Connect apps in Composio to get started.
        </p>
      )}
      {connections.length === 0 && hasUsed && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          All connected apps have been used by this agent.
        </p>
      )}
      {connections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {connections.map((conn) => (
            <ConnectionRow key={conn.toolkit} connection={conn} />
          ))}
        </div>
      )}
    </section>
  );
}
