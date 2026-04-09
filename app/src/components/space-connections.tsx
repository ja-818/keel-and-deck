import { useMemo } from "react";
import { ConnectionsView } from "@houston-ai/connections";
import { useConnections, useInvalidateConnections } from "../hooks/queries";
import { tauriSystem } from "../lib/tauri";
import { useComposioAuth } from "../hooks/use-composio-auth";
import { ComposioAuthDialog } from "./composio-auth-dialog";
import { BrowseAppsSection } from "./tabs/browse-apps-section";
import { LoadingState } from "./tabs/integrations-states";

const COMPOSIO_DASHBOARD_URL = "https://dashboard.composio.dev";

export function WorkspaceConnections() {
  const { data: result, isLoading: loading, refetch } = useConnections();
  const invalidate = useInvalidateConnections();

  const auth = useComposioAuth(() => {
    invalidate();
  });

  const connectedToolkits = useMemo(
    () =>
      new Set(
        result?.status === "ok"
          ? result.connections.map((c) => c.toolkit)
          : [],
      ),
    [result],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        <h1 className="text-[28px] font-normal text-foreground mb-6">
          Integrations
        </h1>
        {loading ? (
          <LoadingState />
        ) : (
          <ConnectionsView
            result={result ?? null}
            loading={false}
            onRetry={() => refetch()}
            onManage={() => tauriSystem.openUrl(COMPOSIO_DASHBOARD_URL)}
            onAuth={auth.startAuth}
          />
        )}
        {!loading && result?.status === "ok" && (
          <BrowseAppsSection connectedToolkits={connectedToolkits} />
        )}
      </div>

      <ComposioAuthDialog
        state={auth.state}
        onClose={auth.close}
        onReopen={auth.reopen}
        onTogglePaste={auth.togglePaste}
        onPasteChange={auth.setPasteValue}
        onPasteSubmit={auth.submitPaste}
      />
    </div>
  );
}
