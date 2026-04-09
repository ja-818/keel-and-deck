import { useEffect, useRef } from "react";
import { ExternalLink, Download, Loader2 } from "lucide-react";
import {
  Empty, EmptyHeader, EmptyTitle, EmptyDescription,
} from "@houston-ai/core";
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
          Checking Composio state…
        </EmptyDescription>
      </EmptyHeader>
      <div className="w-48 h-[2px] rounded-full bg-black/10 overflow-hidden">
        <div
          ref={barRef}
          className="h-full bg-black rounded-full"
          style={{ width: "0%", transition: "width 5s linear" }}
        />
      </div>
    </Empty>
  );
}

/**
 * Composio CLI is not installed yet. Ask the user to install it.
 * The install step is a one-time ~80 MB download from Composio's
 * official installer — Houston shells out to it under the hood.
 */
export function NotInstalledState({
  onInstall,
  installing,
}: {
  onInstall: () => void;
  installing: boolean;
}) {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>Connect your apps</EmptyTitle>
        <EmptyDescription>
          Houston uses the Composio CLI to let your agent use Gmail, Slack,
          Google Drive, and 100+ other services on your behalf. One-time
          install, about 80 MB.
        </EmptyDescription>
      </EmptyHeader>
      <button
        onClick={onInstall}
        disabled={installing}
        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors duration-200 disabled:opacity-60"
      >
        {installing ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            Installing…
          </>
        ) : (
          <>
            <Download className="size-3" />
            Install Composio
          </>
        )}
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
          Open Composio dashboard
          <ExternalLink className="size-3" />
        </button>
      </div>
    </div>
  );
}

/**
 * Header shown on the "ok" state — the user is signed in and can
 * browse apps to connect.
 */
export function SignedInHeader({
  email,
  orgName,
}: {
  email: string | null;
  orgName: string | null;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-foreground">
        Signed in to Composio
      </h2>
      <p className="text-xs text-muted-foreground mt-1">
        {email ?? "(unknown email)"}
        {orgName ? ` · ${orgName}` : ""}
      </p>
    </div>
  );
}
