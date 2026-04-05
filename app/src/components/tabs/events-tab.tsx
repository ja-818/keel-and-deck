import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import type { TabProps } from "../../lib/types";

export default function EventsTab(_props: TabProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Events coming soon</EmptyTitle>
          <EmptyDescription>
            Incoming events from channels and integrations will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
