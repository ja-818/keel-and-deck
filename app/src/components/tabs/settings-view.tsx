import { useState, useEffect } from "react";
import { Spinner } from "@houston-ai/core";
import { Sun, Moon } from "lucide-react";
import { ProviderPicker } from "../shell/provider-picker";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useUIStore } from "../../stores/ui";
import { tauriPreferences } from "../../lib/tauri";
import { setTheme, type Theme } from "../../lib/theme";

export function SettingsView() {
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const updateProvider = useWorkspaceStore((s) => s.updateProvider);
  const addToast = useUIStore((s) => s.addToast);
  const [theme, setCurrentTheme] = useState<Theme>("light");

  useEffect(() => {
    tauriPreferences.get("theme").then((v) => {
      if (v === "dark") setCurrentTheme("dark");
    }).catch(() => {});
  }, []);

  if (!currentWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  const handleSelect = async (provider: string, model: string) => {
    await updateProvider(currentWorkspace.id, provider, model);
    const provName = provider === "openai" ? "OpenAI" : "Anthropic";
    addToast({ title: `Switched to ${provName} (${model})` });
  };

  const handleThemeToggle = async (t: Theme) => {
    setCurrentTheme(t);
    await setTheme(t);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-lg px-6 py-8">
        <h1 className="text-xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-muted-foreground mb-6">
          AI provider for <strong className="text-foreground font-medium">{currentWorkspace.name}</strong>.
          Houston uses <strong className="text-foreground font-medium">your own</strong> subscription.
        </p>

        <ProviderPicker
          value={currentWorkspace.provider ?? null}
          model={currentWorkspace.model ?? null}
          onSelect={handleSelect}
        />

        {/* Theme */}
        <div className="mt-8 pt-6 border-t border-border">
          <h2 className="text-sm font-medium mb-3">Appearance</h2>
          <div className="flex gap-2">
            <button
              onClick={() => handleThemeToggle("light")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors ${
                theme === "light"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-accent"
              }`}
            >
              <Sun className="size-4" />
              Light
            </button>
            <button
              onClick={() => handleThemeToggle("dark")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors ${
                theme === "dark"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-accent"
              }`}
            >
              <Moon className="size-4" />
              Dark
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
