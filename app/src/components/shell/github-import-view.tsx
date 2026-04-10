/**
 * GithubImportView — owner/repo input + install for the New Agent dialog.
 * Follows the same pattern as add-skill-dialog-repo-view.tsx.
 *
 * Stages: input → loading → done
 */
import { useCallback, useState } from "react";
import { Button, Spinner } from "@houston-ai/core";
import { AlertCircle, Check, Github } from "lucide-react";

interface GithubImportViewProps {
  onInstall: (url: string) => Promise<string>;
}

type Stage =
  | { kind: "input" }
  | { kind: "loading" }
  | { kind: "done"; agentId: string };

export function GithubImportView({ onInstall }: GithubImportViewProps) {
  const [source, setSource] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "input" });
  const [error, setError] = useState("");

  const isLoading = stage.kind === "loading";

  const handleInstall = useCallback(async () => {
    const trimmed = source.trim();
    if (!trimmed) return;
    setError("");
    setStage({ kind: "loading" });
    try {
      const agentId = await onInstall(trimmed);
      setStage({ kind: "done", agentId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage({ kind: "input" });
    }
  }, [source, onInstall]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 px-6 pb-3 space-y-2">
        {stage.kind !== "done" && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setError("");
                  if (stage.kind !== "input") setStage({ kind: "input" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && source.trim() && !isLoading) {
                    handleInstall();
                  }
                }}
                placeholder="owner/repo"
                disabled={isLoading}
                autoFocus
                className="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm
                           placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring transition-colors
                           disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <Button
              onClick={handleInstall}
              disabled={!source.trim() || isLoading}
              className="rounded-full shrink-0"
            >
              {isLoading ? <Spinner className="size-4" /> : "Install"}
            </Button>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            {error}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6">
        {stage.kind === "input" && !error && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Enter a public GitHub repo in owner/repo format
          </p>
        )}

        {stage.kind === "loading" && (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}

        {stage.kind === "done" && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Check className="size-4 text-emerald-600 shrink-0" />
              <span>
                Installed <strong>{stage.agentId}</strong>. Select it from the
                Houston Store tab to create an agent.
              </span>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setStage({ kind: "input" });
                setSource("");
                setError("");
              }}
              className="rounded-full w-full"
            >
              Install another
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
