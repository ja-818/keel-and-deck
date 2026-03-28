import { cn } from "@deck-ui/core";
import ReactMarkdown from "react-markdown";

export function DeliverableCard({ content }: { content: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="prose prose-sm prose-stone max-w-none text-foreground">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

export function UserFeedback({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[70%] rounded-3xl bg-[#f4f4f4] px-5 py-2.5",
          "text-sm text-foreground",
        )}
      >
        {content}
      </div>
    </div>
  );
}
