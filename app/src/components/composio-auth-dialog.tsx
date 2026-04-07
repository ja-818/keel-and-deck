import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@houston-ai/core";
import { Loader2, ExternalLink, ChevronDown } from "lucide-react";
import type { ComposioAuthState } from "../hooks/use-composio-auth";

interface ComposioAuthDialogProps {
  state: ComposioAuthState;
  onClose: () => void;
  onReopen: () => void;
  onTogglePaste: () => void;
  onPasteChange: (value: string) => void;
  onPasteSubmit: () => void;
}

export function ComposioAuthDialog({
  state,
  onClose,
  onReopen,
  onTogglePaste,
  onPasteChange,
  onPasteSubmit,
}: ComposioAuthDialogProps) {
  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connecting to Composio</DialogTitle>
          <DialogDescription>
            Complete the sign-in in your browser, then return here.
          </DialogDescription>
        </DialogHeader>

        {!state.error && (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="size-4 text-muted-foreground animate-spin shrink-0" />
            <p className="text-sm text-muted-foreground">
              Waiting for browser callback...
            </p>
          </div>
        )}

        {state.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}

        {state.authUrl && (
          <button
            onClick={onReopen}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-background text-foreground text-sm font-medium hover:bg-secondary transition-colors duration-200 self-start"
          >
            Open in browser again
            <ExternalLink className="size-3.5" />
          </button>
        )}

        <div className="border-t border-border pt-3">
          <button
            onClick={onTogglePaste}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`size-3 transition-transform duration-200 ${state.pasteExpanded ? "" : "-rotate-90"}`}
            />
            Having trouble?
          </button>

          {state.pasteExpanded && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                If the browser redirected but nothing happened, copy the URL
                from your browser's address bar and paste it here.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={state.pasteValue}
                  onChange={(e) => onPasteChange(e.target.value)}
                  placeholder="http://127.0.0.1:19823/callback?code=..."
                  className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={(e) => { if (e.key === "Enter") onPasteSubmit(); }}
                />
                <button
                  onClick={onPasteSubmit}
                  disabled={!state.pasteValue.trim() || state.submitting}
                  className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {state.submitting ? "..." : "Submit"}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
