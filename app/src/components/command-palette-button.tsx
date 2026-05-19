import { useTranslation } from "react-i18next";
import { Button } from "@houston-ai/core";
import { Command } from "lucide-react";
import { useUIStore } from "../stores/ui";
import { shortcutLabel } from "../lib/shortcuts";

export function CommandPaletteButton() {
  const { t } = useTranslation("dashboard");
  return (
    <Button
      variant="outline"
      className="rounded-full gap-2 pr-2"
      aria-label={t("search.openCommands")}
      onClick={() => useUIStore.getState().setPaletteOpen(true)}
    >
      <Command className="size-4 text-muted-foreground" />
      <span>{t("search.openCommands")}</span>
      <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
        {shortcutLabel("palette")}
      </kbd>
    </Button>
  );
}
