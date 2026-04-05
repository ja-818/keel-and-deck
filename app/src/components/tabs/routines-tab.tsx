import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import type { TabProps } from "../../lib/types";

export default function RoutinesTab(_props: TabProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Routines coming soon</EmptyTitle>
          <EmptyDescription>
            Automated routines and scheduled tasks will be available here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
