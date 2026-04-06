import { useState, useEffect, useCallback } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  ScrollArea,
  Button,
  cn,
} from "@houston-ai/core";
import {
  useProgressSteps,
  ChannelAvatar,
  feedItemsToMessages,
} from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import { ChevronRight, Check, Circle, Loader2, Plus } from "lucide-react";
import { tauriChannels } from "../../lib/tauri";
import { useFeedStore } from "../../stores/feeds";
import type { Workspace, ChannelEntry } from "../../lib/types";

interface ChatSidebarProps {
  workspace: Workspace;
  sessionKey: string;
}

export function ChatSidebar({ workspace, sessionKey }: ChatSidebarProps) {
  const feedItems = useFeedStore((s) => s.items[sessionKey]) ?? [];

  return (
    <div className="w-[240px] shrink-0 border-l border-border bg-secondary flex flex-col h-full">
      <ScrollArea className="flex-1">
        <ProgressSection feedItems={feedItems} />
        <ChannelsSection workspace={workspace} />
      </ScrollArea>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress                                                          */
/* ------------------------------------------------------------------ */

function ProgressSection({ feedItems }: { feedItems: FeedItem[] }) {
  const [open, setOpen] = useState(true);
  const progressSteps = useProgressSteps(feedItems);
  const toolSteps = useToolSteps(feedItems);
  const steps = progressSteps.length > 0 ? progressSteps : toolSteps;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors">
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        Progress
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-3 space-y-0.5">
          {steps.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-2">
              Progress will appear when the agent starts working
            </p>
          ) : (
            steps.map((step, i) => <StepRow key={i} step={step} />)
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SidebarStep {
  title: string;
  status: "pending" | "active" | "done";
}

function StepRow({ step }: { step: SidebarStep }) {
  return (
    <div className="flex items-start gap-2.5 px-2 py-1.5 rounded-md">
      <div className="mt-0.5 shrink-0">
        {step.status === "done" && (
          <div className="size-4 rounded-full bg-[#00a240] flex items-center justify-center">
            <Check className="size-2.5 text-white" strokeWidth={3} />
          </div>
        )}
        {step.status === "active" && (
          <Loader2 className="size-4 text-foreground/60 animate-spin" strokeWidth={1.5} />
        )}
        {step.status === "pending" && (
          <Circle className="size-4 text-muted-foreground/25" strokeWidth={1.5} />
        )}
      </div>
      <span
        className={cn(
          "text-xs leading-snug",
          step.status === "done" && "text-foreground/50",
          step.status === "active" && "text-foreground font-medium",
          step.status === "pending" && "text-foreground/60",
        )}
      >
        {step.title}
      </span>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  Read: "Reading file",
  Write: "Writing file",
  Edit: "Editing file",
  Bash: "Running command",
  Glob: "Searching files",
  Grep: "Searching code",
  WebSearch: "Searching the web",
  WebFetch: "Fetching page",
};

function useToolSteps(feedItems: FeedItem[]): SidebarStep[] {
  const messages = feedItemsToMessages(feedItems);
  const allTools = messages.flatMap((m) => m.tools);
  if (allTools.length === 0) return [];

  const steps: SidebarStep[] = [];
  for (const tool of allTools) {
    const name = tool.name.includes("__")
      ? tool.name.split("__").pop()!
      : tool.name;
    const label = TOOL_LABELS[name] || name.replace(/_/g, " ");
    const last = steps[steps.length - 1];
    if (last && last.title === label) continue;
    steps.push({
      title: label,
      status: tool.result ? "done" : "active",
    });
  }
  return steps;
}

/* ------------------------------------------------------------------ */
/*  Channels                                                          */
/* ------------------------------------------------------------------ */

function ChannelsSection({ workspace }: { workspace: Workspace }) {
  const [open, setOpen] = useState(true);
  const [channels, setChannels] = useState<ChannelEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const entries = await tauriChannels.list(workspace.folderPath);
      setChannels(entries);
    } catch (e) {
      console.error("[chat-sidebar] Failed to load channels:", e);
    }
  }, [workspace.folderPath]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors border-t border-border">
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        Channels
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-3 space-y-1">
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-2">
              No channels configured
            </p>
          ) : (
            channels.map((ch) => <ChannelRow key={ch.id} channel={ch} />)
          )}
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full h-7 text-xs mt-2 gap-1"
          >
            <Plus className="size-3" />
            Add channel
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ChannelRow({ channel }: { channel: ChannelEntry }) {
  const type = channel.channel_type.toLowerCase();
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
      <ChannelAvatar source={type} size="sm" />
      <span className="text-xs text-foreground truncate flex-1">
        {channel.name}
      </span>
      <div className="size-2 rounded-full bg-muted-foreground/25 shrink-0" />
    </div>
  );
}
