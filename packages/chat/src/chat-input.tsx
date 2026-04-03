/**
 * ChatInput — prompt input with file attachments.
 *
 * Attachments render as cards ABOVE the composer (outside overflow-clip).
 * The + button triggers a native file input via a <label> (most reliable).
 */

import { useCallback, useId, useState } from "react";
import type { PromptInputMessage } from "./ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputSubmit,
} from "./ai-elements/prompt-input";
import {
  AudioLinesIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  MicIcon,
  PlusIcon,
  XIcon,
  FileIcon as LucideFileIcon,
} from "lucide-react";

type InputStatus = "ready" | "streaming" | "submitted";

export interface ChatInputProps {
  onSend: (text: string, files: File[]) => void;
  onStop?: () => void;
  status?: InputStatus;
  placeholder?: string;
}

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function getTypeLabel(ext: string): string {
  const map: Record<string, string> = {
    pdf: "PDF", doc: "Word", docx: "Word", txt: "Text", rtf: "Rich Text",
    csv: "Spreadsheet", xls: "Excel", xlsx: "Excel",
    png: "Image", jpg: "Image", jpeg: "Image", gif: "Image", svg: "Image",
    zip: "Zip Archive", rar: "Archive", "7z": "Archive",
  };
  return map[ext] ?? (ext ? ext.toUpperCase() : "File");
}

/** File type icon matching @deck-ui/workspace's FileRow icons */
function AttachmentIcon({ ext }: { ext: string }) {
  if (ext === "pdf") {
    return (
      <div className="size-8 rounded-md bg-[#E5252A] flex items-center justify-center shrink-0">
        <svg className="size-4" viewBox="0 0 16 16" fill="none">
          <text
            x="8" y="11.5" textAnchor="middle" fill="white"
            fontSize="8" fontWeight="700" fontFamily="system-ui, sans-serif"
          >
            PDF
          </text>
        </svg>
      </div>
    );
  }
  if (["xlsx", "xls", "csv"].includes(ext)) {
    return (
      <div className="size-8 rounded-md bg-[#34A853] flex items-center justify-center shrink-0">
        <FileSpreadsheetIcon className="size-4 text-white" strokeWidth={2} />
      </div>
    );
  }
  if (["doc", "docx", "txt", "rtf"].includes(ext)) {
    return (
      <div className="size-8 rounded-md bg-[#4285F4] flex items-center justify-center shrink-0">
        <FileTextIcon className="size-4 text-white" strokeWidth={2} />
      </div>
    );
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "tif", "tiff"].includes(ext)) {
    return (
      <div className="size-8 rounded-md bg-[#9333EA] flex items-center justify-center shrink-0">
        <ImageIcon className="size-4 text-white" strokeWidth={2} />
      </div>
    );
  }
  return (
    <div className="size-8 rounded-md bg-stone-400 flex items-center justify-center shrink-0">
      <LucideFileIcon className="size-4 text-white" strokeWidth={2} />
    </div>
  );
}

export function ChatInput({
  onSend,
  onStop,
  status = "ready",
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputId = useId();

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value),
    [],
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const trimmed = message.text?.trim();
      if (!trimmed && files.length === 0) return;
      onSend(trimmed ?? "", files);
      setText("");
      setFiles([]);
    },
    [onSend, files],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      e.target.value = "";
    },
    [],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const hasContent = text.trim().length > 0 || files.length > 0;

  return (
    <div className="shrink-0 px-4 pb-6 pt-2">
      <div className="max-w-3xl mx-auto">
        {/* Native file input — hidden, triggered by label */}
        <input
          id={fileInputId}
          type="file"
          multiple
          className="sr-only"
          onChange={handleFileChange}
          tabIndex={-1}
        />

        {/* Attachment cards — ABOVE the composer, always-visible scrollbar */}
        {files.length > 0 && (
          <div
            className="flex gap-2 pb-1 mb-2 overflow-x-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            {files.map((file, idx) => {
              const ext = getExt(file.name);
              return (
                <div
                  key={`${file.name}-${idx}`}
                  className="relative flex items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white pl-2.5 pr-8 py-2 min-w-0 shrink-0 max-w-[240px] shadow-sm"
                >
                  <AttachmentIcon ext={ext} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate leading-tight">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {getTypeLabel(ext)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1.5 right-1.5 size-4 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <XIcon className="size-2.5" strokeWidth={3} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <PromptInput onSubmit={handleSubmit}>
          {/* + button — label triggers file input natively */}
          <div className="flex items-center [grid-area:leading]">
            <label
              htmlFor={fileInputId}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
              aria-label="Attach files"
            >
              <PlusIcon className="size-5" />
            </label>
          </div>

          <PromptInputBody>
            <PromptInputTextarea
              onChange={handleTextChange}
              value={text}
              placeholder={placeholder}
            />
          </PromptInputBody>

          <div className="flex items-center gap-1.5 [grid-area:trailing]">
            {status === "ready" && (
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors"
                aria-label="Dictate"
              >
                <MicIcon className="size-5" />
              </button>
            )}
            {!hasContent && status === "ready" ? (
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors"
                aria-label="Voice mode"
              >
                <AudioLinesIcon className="size-5" />
              </button>
            ) : (
              <PromptInputSubmit status={status} onStop={onStop} />
            )}
          </div>
        </PromptInput>
      </div>
    </div>
  );
}
