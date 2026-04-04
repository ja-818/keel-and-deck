import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { tauriWorkspace } from "../lib/tauri";

interface ClaudeMdEditorProps {
  projectId: string;
}

export function ClaudeMdEditor({ projectId }: ClaudeMdEditorProps) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    tauriWorkspace
      .readFile(projectId, "CLAUDE.md")
      .then((text) => {
        setContent(text);
        setSavedContent(text);
      })
      .catch((err) => console.error("Failed to load CLAUDE.md:", err))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await tauriWorkspace.writeFile(projectId, "CLAUDE.md", content);
      setSavedContent(content);
    } catch (err) {
      console.error("Failed to save CLAUDE.md:", err);
    } finally {
      setSaving(false);
    }
  }, [projectId, content]);

  const hasChanges = content !== savedContent;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">CLAUDE.md</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Instructions your agent follows on every session
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="flex items-center gap-1.5 rounded-full h-9 px-3 text-sm font-medium
            bg-primary text-primary-foreground
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:opacity-90 transition-opacity"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
        className="flex-1 w-full resize-none rounded-xl border border-black/10 bg-secondary
          p-4 text-sm font-mono leading-relaxed text-foreground
          placeholder:text-muted-foreground
          focus:outline-none focus:ring-2 focus:ring-ring/20"
        placeholder="# Agent Instructions&#10;&#10;Write rules and context for your agent..."
      />
    </div>
  );
}
