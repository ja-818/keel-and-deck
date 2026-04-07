import { useState, useCallback, useMemo } from "react";
import { RoutinesGrid, RoutineDetail, RoutineForm } from "@houston-ai/routines";
import type { RoutineFormData, RoutineRun } from "@houston-ai/routines";
import {
  useRoutines,
  useRoutineRuns,
  useCreateRoutine,
  useUpdateRoutine,
  useDeleteRoutine,
  useRunRoutineNow,
} from "../../hooks/queries";
import type { TabProps } from "../../lib/types";

type View = { type: "grid" } | { type: "detail"; id: string } | { type: "form"; editId?: string };

const EMPTY_FORM: RoutineFormData = {
  name: "",
  description: "",
  prompt: "",
  schedule: "0 9 * * *",
  suppress_when_silent: true,
};

export default function RoutinesTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data: routines, isLoading } = useRoutines(path);
  const { data: allRuns } = useRoutineRuns(path);
  const createRoutine = useCreateRoutine(path);
  const updateRoutine = useUpdateRoutine(path);
  const deleteRoutine = useDeleteRoutine(path);
  const runNow = useRunRoutineNow(path);

  const [view, setView] = useState<View>({ type: "grid" });
  const [form, setForm] = useState<RoutineFormData>(EMPTY_FORM);

  // Compute last run per routine
  const lastRuns = useMemo(() => {
    if (!allRuns) return {};
    const map: Record<string, RoutineRun> = {};
    for (const run of allRuns) {
      const existing = map[run.routine_id];
      if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
        map[run.routine_id] = run;
      }
    }
    return map;
  }, [allRuns]);

  const handleCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setView({ type: "form" });
  }, []);

  const handleEdit = useCallback(
    (routineId: string) => {
      const r = routines?.find((x) => x.id === routineId);
      if (!r) return;
      setForm({
        name: r.name,
        description: r.description,
        prompt: r.prompt,
        schedule: r.schedule,
        suppress_when_silent: r.suppress_when_silent,
      });
      setView({ type: "form", editId: routineId });
    },
    [routines],
  );

  const handleSubmit = useCallback(async () => {
    if (view.type !== "form") return;
    if (view.editId) {
      await updateRoutine.mutateAsync({ routineId: view.editId, updates: form });
      setView({ type: "detail", id: view.editId });
    } else {
      await createRoutine.mutateAsync(form);
      setView({ type: "grid" });
    }
  }, [view, form, createRoutine, updateRoutine]);

  const handleToggle = useCallback(
    async (routineId: string, enabled: boolean) => {
      await updateRoutine.mutateAsync({ routineId, updates: { enabled } });
    },
    [updateRoutine],
  );

  const handleDelete = useCallback(
    async (routineId: string) => {
      await deleteRoutine.mutateAsync(routineId);
      setView({ type: "grid" });
    },
    [deleteRoutine],
  );

  const handleRunNow = useCallback(
    (routineId: string) => {
      runNow.mutate(routineId);
    },
    [runNow],
  );

  const selectedRoutine =
    view.type === "detail" ? routines?.find((r) => r.id === view.id) : undefined;
  const selectedRuns = useMemo(
    () =>
      view.type === "detail" && allRuns
        ? allRuns.filter((r) => r.routine_id === view.id)
        : [],
    [view, allRuns],
  );

  if (view.type === "form") {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-8">
          <h2 className="text-lg font-medium text-foreground mb-6">
            {view.editId ? "Edit routine" : "New routine"}
          </h2>
          <RoutineForm
            value={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={handleSubmit}
            onCancel={() =>
              setView(view.editId ? { type: "detail", id: view.editId } : { type: "grid" })
            }
            submitLabel={view.editId ? "Save" : "Create"}
          />
        </div>
      </div>
    );
  }

  if (view.type === "detail" && selectedRoutine) {
    return (
      <RoutineDetail
        routine={selectedRoutine}
        runs={selectedRuns}
        onBack={() => setView({ type: "grid" })}
        onEdit={() => handleEdit(selectedRoutine.id)}
        onRunNow={() => handleRunNow(selectedRoutine.id)}
        onToggle={(enabled) => handleToggle(selectedRoutine.id, enabled)}
        onDelete={() => handleDelete(selectedRoutine.id)}
      />
    );
  }

  return (
    <RoutinesGrid
      routines={routines ?? []}
      lastRuns={lastRuns}
      loading={isLoading}
      onSelect={(id) => setView({ type: "detail", id })}
      onCreate={handleCreate}
      onToggle={handleToggle}
    />
  );
}
