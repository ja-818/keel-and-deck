import { useCallback, useMemo } from "react";
import { useConnections, useAgentIntegrations, useResetConnections } from "../../hooks/queries";
import { tauriSystem } from "../../lib/tauri";
import { useComposioAuth } from "../../hooks/use-composio-auth";
import { ComposioAuthDialog } from "../composio-auth-dialog";
import { BrowseAppsSection } from "./browse-apps-section";
import {
  LoadingState, NotConfiguredState, NeedsAuthState, ErrorState,
  UsedSection, AvailableSection,
} from "./integrations-states";
import type { TabProps } from "../../lib/types";
import type { Connection } from "@houston-ai/connections";

const COMPOSIO_DASHBOARD_URL = "https://dashboard.composio.dev";

export default function IntegrationsTab({ agent }: TabProps) {
  const { data: result, isLoading: connectionsLoading, refetch } = useConnections();
  const { data: tracked, isLoading: trackedLoading } = useAgentIntegrations(agent.folderPath);
  const reset = useResetConnections();
  const auth = useComposioAuth(() => reset());

  const handleManage = useCallback(() => {
    tauriSystem.openUrl(COMPOSIO_DASHBOARD_URL);
  }, []);

  const loading = connectionsLoading || trackedLoading;
  const allConnections: Connection[] =
    result?.status === "ok" ? result.connections : [];
  const trackedToolkits = new Set((tracked ?? []).map((t) => t.toolkit));

  const usedConnections = allConnections.filter((c) =>
    trackedToolkits.has(c.toolkit),
  );
  const availableConnections = allConnections.filter(
    (c) => !trackedToolkits.has(c.toolkit),
  );
  const connectedToolkits = useMemo(
    () => new Set(allConnections.map((c) => c.toolkit)),
    [allConnections],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        {loading && <LoadingState />}

        {!loading && result?.status === "not_configured" && (
          <NotConfiguredState onAuth={auth.startAuth} />
        )}

        {!loading && result?.status === "needs_auth" && (
          <NeedsAuthState onAuth={auth.startAuth} />
        )}

        {!loading && result?.status === "error" && (
          <ErrorState
            message={result.message}
            onRetry={() => refetch()}
            onReconnect={handleManage}
          />
        )}

        {!loading && result?.status === "ok" && (
          <>
            <UsedSection connections={usedConnections} tracked={tracked ?? []} />
            <AvailableSection
              connections={availableConnections}
              hasUsed={usedConnections.length > 0}
              onManage={handleManage}
            />
            <BrowseAppsSection connectedToolkits={connectedToolkits} />
          </>
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
