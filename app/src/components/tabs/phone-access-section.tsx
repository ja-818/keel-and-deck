import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, ConfirmDialog } from "@houston-ai/core";
import { Smartphone } from "lucide-react";
import { tauriTunnel } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";

export function PhoneAccessSection() {
  const { t } = useTranslation(["settings", "common"]);
  const addToast = useUIStore((s) => s.addToast);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await tauriTunnel.resetAccess();
      setConfirmOpen(false);
      addToast({ title: t("settings:phoneAccess.resetToast") });
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="pt-2 border-t border-border">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Smartphone className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium mb-1">
            {t("settings:phoneAccess.title")}
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            {t("settings:phoneAccess.description")}
          </p>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={resetting}
            onClick={() => setConfirmOpen(true)}
          >
            {t("settings:phoneAccess.resetButton")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("settings:phoneAccess.confirmTitle")}
        description={t("settings:phoneAccess.confirmDescription")}
        confirmLabel={t("settings:phoneAccess.confirmLabel")}
        cancelLabel={t("common:actions.cancel")}
        variant="destructive"
        onConfirm={handleReset}
      />
    </section>
  );
}
