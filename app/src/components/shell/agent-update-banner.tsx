import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
} from "@houston-ai/core";
import { RefreshCw } from "lucide-react";
import { useAgentCatalogStore } from "../../stores/agent-catalog";

export function AgentUpdateBanner() {
  const updatedRepos = useAgentCatalogStore((s) => s.updatedRepos);
  const dismiss = useAgentCatalogStore((s) => s.dismissUpdates);

  if (updatedRepos.length === 0) return null;

  const names = updatedRepos.map((r) => r.split("/").pop() || r);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-4" />
            Agent update available
          </DialogTitle>
          <DialogDescription>
            {names.length === 1
              ? `${names[0]} has a new version available.`
              : `${names.join(", ")} have new versions available.`}
            {" "}The update has been downloaded. Reload to apply it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => window.location.reload()}
            className="rounded-full flex-1"
          >
            Reload now
          </Button>
          <Button
            variant="outline"
            onClick={dismiss}
            className="rounded-full"
          >
            Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
