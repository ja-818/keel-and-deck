import { useQuery } from "@tanstack/react-query";
import type { TabProps } from "../../lib/types";
import { tauriConfig } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";
import { SettingsForm } from "./configure-sections";

export default function ConfigTab({ agent }: TabProps) {
  const path = agent.folderPath;
  const { data: config } = useQuery({
    queryKey: queryKeys.config(path),
    queryFn: () => tauriConfig.read(path).catch(() => ({})),
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h2 className="text-sm font-medium text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground/60 mt-0.5 mb-3">
          Agent configuration and runtime settings.
        </p>
        <SettingsForm agentPath={path} config={config ?? {}} />
      </div>
    </div>
  );
}
