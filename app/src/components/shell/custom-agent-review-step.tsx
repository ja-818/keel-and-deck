import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Wand2, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button, DialogHeader, DialogTitle, Input } from "@houston-ai/core";
import type {
  GenerateCustomAgentResponse,
  StackEntry,
} from "@houston-ai/engine-client";
import { tauriConnections, tauriRoutines, tauriSkills } from "../../lib/tauri";
import { writePendingStackIntegrations } from "../../lib/pending-stack-integrations";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import type { Workspace } from "../../lib/types";

interface Props {
  intent: string;
  stack: StackEntry[];
  provider: "anthropic" | "openai" | string;
  workspace: Workspace;
  onBack: () => void;
  /** Fired once the agent, skills, and (optional) routine are all
   *  persisted along with the pending-integrations file. Parent closes
   *  the dialog and switches to the new agent's view. */
  onCreated: (agentPath: string) => void;
}

/**
 * Step 3 of `CreateAgentDialog`. Triggered when the user clicks
 * "Create custom agent with this stack" in `StoreStepDiscover`. The
 * component owns the entire generate → review → persist cycle.
 */
export function CustomAgentReviewStep({
  intent,
  stack,
  provider,
  workspace,
  onBack,
  onCreated,
}: Props) {
  const { t } = useTranslation("shell");
  const createAgent = useAgentStore((s) => s.create);
  const addToast = useUIStore((s) => s.addToast);

  const generate = useMutation({
    mutationFn: () =>
      tauriConnections.generateCustomAgent(
        intent,
        stack,
        (provider === "anthropic" || provider === "openai" ? provider : undefined),
      ),
  });

  // Auto-fire the generation as soon as the component mounts. We do NOT
  // re-fire on re-renders — the mutation library handles that, but we
  // guard with isIdle so a parent re-render mid-call doesn't double-shoot.
  useEffect(() => {
    if (generate.isIdle) generate.mutate();
  }, [generate]);

  return (
    <>
      <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
        <DialogTitle className="flex items-center gap-2">
          <Wand2 className="size-4 text-violet-500" />
          {t("customAgent.dialogTitle")}
        </DialogTitle>
      </DialogHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
        {generate.isPending && (
          <GeneratingState stack={stack} />
        )}

        {generate.isError && (
          <ErrorState
            message={errorMessage(generate.error)}
            onRetry={() => generate.mutate()}
          />
        )}

        {generate.data && (
          <ReviewForm
            generated={generate.data}
            stack={stack}
            workspaceId={workspace.id}
            onBack={onBack}
            createAgent={createAgent}
            onToast={addToast}
            onCreated={onCreated}
          />
        )}
      </div>

      {/* Back button visible during generation/error so the user isn't
          trapped if the LLM hangs. */}
      {(generate.isPending || generate.isError) && (
        <div className="shrink-0 px-6 pb-4">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-4 mr-1.5" />
            {t("customAgent.back")}
          </Button>
        </div>
      )}
    </>
  );
}

function GeneratingState({ stack }: { stack: StackEntry[] }) {
  const { t } = useTranslation("shell");
  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-5 text-center space-y-3">
      <Loader2 className="size-6 mx-auto animate-spin text-violet-500" />
      <p className="text-sm text-foreground font-medium">
        {t("customAgent.generating")}
      </p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {stack.map((e) => (
          <span
            key={e.toolkit}
            className="text-[11px] bg-background text-muted-foreground px-2 py-0.5 rounded-full"
          >
            {e.name}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t("customAgent.generatingHint")}
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation("shell");
  return (
    <div className="rounded-lg border border-red-300/40 bg-red-50/40 dark:bg-red-950/20 px-3 py-3 space-y-2">
      <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
        <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">{t("customAgent.generationError")}</p>
          <p className="text-xs mt-0.5 break-words">{message}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {t("customAgent.retry")}
      </Button>
    </div>
  );
}

function ReviewForm({
  generated,
  stack,
  workspaceId,
  onBack,
  createAgent,
  onToast,
  onCreated,
}: {
  generated: GenerateCustomAgentResponse;
  stack: StackEntry[];
  workspaceId: string;
  onBack: () => void;
  createAgent: ReturnType<typeof useAgentStore.getState>["create"];
  onToast: (toast: { title: string; variant?: "error" | "success" | "info" }) => void;
  onCreated: (agentPath: string) => void;
}) {
  const { t } = useTranslation("shell");
  const [name, setName] = useState(generated.name);
  const [description, setDescription] = useState(generated.description);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(
    () => new Set(generated.skills.map((s) => s.name)),
  );
  const [routineEnabled, setRoutineEnabled] = useState(generated.routine != null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleSkill = (skillName: string) => {
    setEnabledSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillName)) next.delete(skillName);
      else next.add(skillName);
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSubmitError(t("customAgent.nameRequired"));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // configId = "blank" so the agent inherits the standard tab set
      // (activity, routines, files, job-description, integrations). A
      // dedicated "custom" config_id would require its own AgentConfig
      // with tabs, which is extra surface for no functional gain.
      const { agent } = await createAgent(
        workspaceId,
        trimmedName,
        "blank",
        undefined,
        generated.claudeMd,
        undefined,
        undefined,
        undefined,
      );

      // Skills + routines run after the agent exists. Partial failures
      // toast but do NOT abort: the agent itself succeeded, and a
      // missing skill is recoverable from the skills tab.
      for (const skill of generated.skills) {
        if (!enabledSkills.has(skill.name)) continue;
        try {
          await tauriSkills.create(
            agent.folderPath,
            skill.name,
            skill.description,
            skill.content,
          );
        } catch (e) {
          onToast({
            title: t("customAgent.skillFailed", { name: skill.name }),
            variant: "error",
          });
          console.error("[customAgent] createSkill failed", e);
        }
      }

      if (generated.routine && routineEnabled) {
        try {
          await tauriRoutines.create(agent.folderPath, {
            name: generated.routine.name,
            description: generated.routine.description,
            prompt: generated.routine.prompt,
            schedule: generated.routine.schedule,
            enabled: true,
            suppress_when_silent: generated.routine.suppressWhenSilent,
            timezone: generated.routine.timezone ?? null,
          });
        } catch (e) {
          onToast({
            title: t("customAgent.routineFailed"),
            variant: "error",
          });
          console.error("[customAgent] createRoutine failed", e);
        }
      }

      const pending = stack.filter((e) => !e.connected);
      // Persist to the agent's .houston/ folder so the pending-
      // integrations panel survives reloads. Best-effort: if the write
      // fails the panel just won't appear after reload, but the agent
      // itself is fine — connections can still be made from the
      // Integrations tab.
      try {
        await writePendingStackIntegrations(agent.folderPath, pending);
      } catch (e) {
        console.error("[customAgent] writePendingStackIntegrations failed", e);
      }
      onCreated(agent.folderPath);
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">
          {t("customAgent.nameLabel")}
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">
          {t("customAgent.descriptionLabel")}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>

      {generated.skills.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            {t("customAgent.skillsTitle")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("customAgent.skillsHint")}
          </p>
          <div className="space-y-1.5">
            {generated.skills.map((skill) => (
              <label
                key={skill.name}
                className="flex items-start gap-2 p-2 rounded-lg border border-border bg-background cursor-pointer hover:bg-secondary/40"
              >
                <input
                  type="checkbox"
                  checked={enabledSkills.has(skill.name)}
                  onChange={() => toggleSkill(skill.name)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {skill.name}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {skill.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {generated.routine && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {t("customAgent.routineTitle")}
            </p>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={routineEnabled}
                onChange={(e) => setRoutineEnabled(e.target.checked)}
              />
              <span className="text-xs text-muted-foreground">
                {routineEnabled
                  ? t("customAgent.routineOn")
                  : t("customAgent.routineOff")}
              </span>
            </label>
          </div>
          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <button
              type="button"
              onClick={() => setRoutineOpen((o) => !o)}
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-secondary/40"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {generated.routine.name}
                </span>
                <code className="text-[11px] bg-secondary text-foreground px-1.5 py-0.5 rounded">
                  {generated.routine.schedule}
                </code>
              </div>
              {routineOpen ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>
            {routineOpen && (
              <div className="px-3 pb-3 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("customAgent.routinePreview")}
                </p>
                <pre className="text-xs text-foreground whitespace-pre-wrap font-mono bg-secondary/40 rounded p-2">
                  {generated.routine.prompt}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {submitError && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2.5">
          <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="size-4 mr-1.5" />
          {t("customAgent.back")}
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin mr-1.5" />
          ) : (
            <Wand2 className="size-4 mr-1.5" />
          )}
          {t("customAgent.create")}
        </Button>
      </div>
    </div>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
