import { useCallback } from "react";
import { ConnectionsView } from "@houston-ai/connections";
import { useConnections, useInvalidateConnections } from "../../hooks/queries";
import { tauriSystem } from "../../lib/tauri";
import { useComposioAuth } from "../../hooks/use-composio-auth";
import { ComposioAuthDialog } from "../composio-auth-dialog";
import type { TabProps } from "../../lib/types";

const COMPOSIO_DASHBOARD_URL = "https://dashboard.composio.dev";

export default function ConnectionsTab(_props: TabProps) {
  const { data: result, isLoading: loading, refetch } = useConnections();
  const invalidate = useInvalidateConnections();

  const handleManage = useCallback(() => {
    tauriSystem.openUrl(COMPOSIO_DASHBOARD_URL);
  }, []);

  const auth = useComposioAuth(() => {
    invalidate();
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-6">
        <ConnectionsView
          result={result ?? null}
          loading={loading}
          onRetry={() => refetch()}
          onManage={handleManage}
          onAuth={auth.startAuth}
        />
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
