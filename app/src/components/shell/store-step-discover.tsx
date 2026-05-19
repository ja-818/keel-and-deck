import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, ChevronDown, ChevronUp, Wand2, X } from "lucide-react";
import type { RecommendStackResponse, StackEntry } from "@houston-ai/engine-client";
import { tauriConnections } from "../../lib/tauri";

interface Props {
  /** Slugs of toolkits already authorized in Composio. Passed to the
   *  recommender so it can mark them as connected and bias toward
   *  reuse. */
  connectedToolkits: string[];
  /** Fired whenever the user submits an intent and gets back a stack.
   *  Receives the toolkit slugs from the primary stack so the parent
   *  can re-rank agent cards. Empty array clears the highlight. */
  onStackRecommended: (toolkitSlugs: string[]) => void;
  /** Fired when the user clicks "Create custom agent with this stack".
   *  Hands the parent dialog the intent + the full stack so it can
   *  switch to the custom-agent review step. */
  onCreateCustomAgent: (intent: string, stack: StackEntry[]) => void;
}

/**
 * Disclosure rendered at the top of StoreStep. Lets the user describe
 * their goal in plain language; calls the recommender; surfaces the
 * tool stack that goal needs. The store-step parent then re-ranks
 * agent cards so the one whose `integrations[]` best matches the
 * recommended stack floats to the top.
 *
 * Unlike the version in the Connections tab, this one does NOT offer
 * "Connect" buttons inline. Connecting happens after the agent is
 * created and opened, via the normal Composio link cards in chat or
 * the Integrations tab. Keeping it informational here avoids
 * mid-flow OAuth popups that would interrupt agent creation.
 */
export function StoreStepDiscover({
  connectedToolkits,
  onStackRecommended,
  onCreateCustomAgent,
}: Props) {
  const { t } = useTranslation("shell");
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState("");
  /** Local, user-editable copy of the recommended stack. Reset every
   *  time a fresh recommendation lands; the user can prune entries with
   *  the X button before clicking "Create custom agent". */
  const [editedStack, setEditedStack] = useState<StackEntry[]>([]);

  const recommend = useMutation({
    mutationFn: async (goal: string) => {
      return tauriConnections.recommendStack(goal, connectedToolkits);
    },
    onSuccess: (data: RecommendStackResponse) => {
      onStackRecommended(data.primaryStack.map((e) => e.toolkit));
    },
  });

  // Reset the editable stack whenever a new recommendation lands so the
  // user always starts from the model's fresh proposal.
  useEffect(() => {
    if (recommend.data) {
      setEditedStack(recommend.data.primaryStack);
    }
  }, [recommend.data]);

  const removeFromStack = useCallback((toolkit: string) => {
    setEditedStack((prev) => {
      const next = prev.filter((e) => e.toolkit !== toolkit);
      onStackRecommended(next.map((e) => e.toolkit));
      return next;
    });
  }, [onStackRecommended]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = intent.trim();
      if (trimmed.length === 0 || recommend.isPending) return;
      recommend.mutate(trimmed);
    },
    [intent, recommend],
  );

  return (
    <div className="mb-4 rounded-2xl border border-border bg-secondary/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/60 transition-colors duration-150"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-500" />
          <span className="text-sm font-medium text-foreground">
            {t("storeDiscover.title")}
          </span>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("storeDiscover.subtitle")}
          </p>
          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder={t("storeDiscover.placeholder")}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
              disabled={recommend.isPending}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={intent.trim().length === 0 || recommend.isPending}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-200"
              >
                {recommend.isPending ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    {t("storeDiscover.thinking")}
                  </>
                ) : (
                  t("storeDiscover.submit")
                )}
              </button>
            </div>
          </form>

          {recommend.isError && (
            <p className="text-xs text-red-600">{t("storeDiscover.error")}</p>
          )}

          {recommend.data && editedStack.length > 0 && (
            <div className="rounded-lg bg-background border border-border p-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-foreground mb-2">
                  {t("storeDiscover.stackLabel")}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {editedStack.map((entry) => (
                    <StackChip
                      key={entry.toolkit}
                      entry={entry}
                      onRemove={removeFromStack}
                    />
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {t("storeDiscover.rankedHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onCreateCustomAgent(intent.trim(), editedStack)
                }
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors duration-200"
              >
                <Wand2 className="size-3.5" />
                {t("customAgent.button")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StackChip({
  entry,
  onRemove,
}: {
  entry: StackEntry;
  onRemove: (toolkit: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const initial = entry.name.charAt(0).toUpperCase();

  return (
    <li
      className="inline-flex items-center gap-1.5 text-[11px] bg-secondary text-foreground pl-1 pr-1 py-0.5 rounded-full"
      title={entry.reason}
    >
      <span className="flex-shrink-0 size-5 rounded-full bg-background overflow-hidden flex items-center justify-center">
        {!imgError && entry.logoUrl ? (
          <img
            src={entry.logoUrl}
            alt=""
            className="size-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-[9px] font-medium text-muted-foreground">
            {initial}
          </span>
        )}
      </span>
      <span className="font-medium">{entry.name}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{entry.role}</span>
      <button
        type="button"
        onClick={() => onRemove(entry.toolkit)}
        className="ml-0.5 flex-shrink-0 size-4 rounded-full hover:bg-background flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Remove ${entry.name}`}
      >
        <X className="size-3" />
      </button>
    </li>
  );
}
