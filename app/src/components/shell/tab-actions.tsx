import { Plus } from "lucide-react";
import { Button } from "@houston-ai/core";
import { useUIStore } from "../../stores/ui";

interface TabActionsProps {
  viewMode: string;
}

export function TabActions({ viewMode }: TabActionsProps) {
  const setNewConversationDialogOpen = useUIStore(
    (s) => s.setNewConversationDialogOpen,
  );

  if (viewMode === "tasks") {
    return (
      <Button
        size="sm"
        className="rounded-full gap-1.5 h-8"
        onClick={() => setNewConversationDialogOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        New conversation
      </Button>
    );
  }

  return null;
}
