import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@houston-ai/core";
import { Plus, Trash2 } from "lucide-react";
import { tauriConfig } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";

// ── Section wrapper ──────────────────────────────────────────────

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {description && (
        <p className="text-xs text-muted-foreground/60 mt-0.5 mb-3">{description}</p>
      )}
      {!description && <div className="mb-3" />}
      {children}
    </section>
  );
}

// ── Auto-save textarea ───────────────────────────────────────────

export function AutoSaveTextarea({
  value: initialValue,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (content: string) => Promise<unknown>;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(initialValue); }, [initialValue]);

  const handleBlur = async () => {
    if (value !== initialValue) {
      setSaving(true);
      await onSave(value);
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      {saving && (
        <span className="absolute top-2 right-3 text-[10px] text-muted-foreground/50">Saving...</span>
      )}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={Math.max(6, value.split("\n").length + 1)}
        className="w-full text-sm text-foreground leading-relaxed bg-[#f9f9f9] outline-none rounded-xl px-4 py-3 border border-black/[0.04] hover:border-black/[0.1] focus:border-black/[0.15] focus:bg-white transition-all duration-200 resize-none placeholder:text-muted-foreground/30"
      />
    </div>
  );
}

// ── Learnings section ────────────────────────────────────────────

export function LearningsSection({
  entries,
  onAdd,
  onRemove,
}: {
  entries: { index: number; text: string }[];
  onAdd: (text: string) => Promise<unknown>;
  onRemove: (index: number) => Promise<unknown>;
}) {
  const [newText, setNewText] = useState("");

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAdd(newText.trim());
    setNewText("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Add a learning..."
          className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="icon" className="rounded-full shrink-0" onClick={handleAdd} disabled={!newText.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {entries.length > 0 && (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.index} className="flex items-start gap-2 text-sm">
              <span className="flex-1 bg-secondary rounded-lg px-3 py-2">{entry.text}</span>
              <button
                onClick={() => onRemove(entry.index)}
                className="shrink-0 mt-1.5 size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Settings form ────────────────────────────────────────────────

export function SettingsForm({ agentPath, config }: { agentPath: string; config: Record<string, unknown> }) {
  const qc = useQueryClient();
  const [devCommand, setDevCommand] = useState((config.devCommand as string) ?? "");
  const [worktreeMode, setWorktreeMode] = useState((config.worktreeMode as boolean) ?? false);

  useEffect(() => {
    setDevCommand((config.devCommand as string) ?? "");
    setWorktreeMode((config.worktreeMode as boolean) ?? false);
  }, [config]);

  const saveConfig = useCallback(
    async (updates: Record<string, unknown>) => {
      const merged = { ...config, ...updates };
      await tauriConfig.write(agentPath, merged);
      qc.invalidateQueries({ queryKey: queryKeys.config(agentPath) });
    },
    [agentPath, config, qc],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">Dev command</label>
        <input
          type="text"
          value={devCommand}
          onChange={(e) => setDevCommand(e.target.value)}
          onBlur={() => saveConfig({ devCommand })}
          placeholder="e.g. pnpm dev, npm run dev, cargo run"
          className="w-full rounded-xl border border-black/[0.04] bg-[#f9f9f9] px-4 py-2.5 text-sm outline-none hover:border-black/[0.1] focus:border-black/[0.15] focus:bg-white transition-all duration-200 placeholder:text-muted-foreground/30"
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-medium text-muted-foreground block">Worktree mode</label>
          <span className="text-xs text-muted-foreground/60">Create a separate git worktree for each mission</span>
        </div>
        <button
          onClick={() => {
            const next = !worktreeMode;
            setWorktreeMode(next);
            saveConfig({ worktreeMode: next });
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
            worktreeMode ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
              worktreeMode ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
