/**
 * FilesBrowser — file browser for an agent workspace.
 * Shows files grouped by folder with icons, sizes, and actions.
 * Supports drag-and-drop file import (with folder targeting) and folder creation.
 */
import { useCallback, useRef, useState } from "react"
import { cn } from "@deck-ui/core"
import { FolderPlus } from "lucide-react"
import type { FileEntry } from "./types"
import { useDropZone } from "./drop-zone"
import { FileRow, FolderSection } from "./file-row"

export interface FilesBrowserProps {
  /** Files to display */
  files: FileEntry[]
  /** Show loading state */
  loading?: boolean
  /** Called when a file row is clicked */
  onOpen?: (file: FileEntry) => void
  /** Called when "Show in Finder" is selected */
  onReveal?: (file: FileEntry) => void
  /** Called when delete is selected */
  onDelete?: (file: FileEntry) => void
  /** Called when files are dropped. targetFolder is set when dropped on a folder. */
  onFilesDropped?: (files: File[], targetFolder?: string) => void
  /** Called when the user creates a new folder via the inline input */
  onCreateFolder?: (name: string) => void
  /** Title for empty state */
  emptyTitle?: string
  /** Description for empty state */
  emptyDescription?: string
}

export function FilesBrowser({
  files,
  loading,
  onOpen,
  onReveal,
  onDelete,
  onFilesDropped,
  onCreateFolder,
  emptyTitle = "Your work shows up here",
  emptyDescription = "When agents create files, they'll appear here for you to open and review.",
}: FilesBrowserProps) {
  const { isDragging, dragHandlers } = useDropZone(onFilesDropped)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null)
  const isEmpty = !loading && files.length === 0
  const grouped = isEmpty ? {} : groupByFolder(files)
  const folders = isEmpty ? [] : Object.keys(grouped).sort()

  const isRootTarget = isDragging && folderDropTarget === null

  const onDragActive = useCallback((folder: string | null) => {
    setFolderDropTarget(folder)
  }, [])

  return (
    <div
      className="relative flex-1 flex flex-col h-full min-h-0 overflow-hidden"
      {...(onFilesDropped ? dragHandlers : {})}
    >
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center pt-[20vh] gap-4 px-8">
          <div className="space-y-2 text-center max-w-md">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              {emptyTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {emptyDescription}
            </p>
          </div>
          {onCreateFolder && (
            <button
              onClick={() => setCreatingFolder(true)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderPlus className="size-4" />
              New folder
            </button>
          )}
          {creatingFolder && (
            <NewFolderInput
              onConfirm={(name) => {
                onCreateFolder?.(name)
                setCreatingFolder(false)
              }}
              onCancel={() => setCreatingFolder(false)}
            />
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center h-8 px-6 text-[11px] font-medium text-muted-foreground/40 border-b border-black/[0.06] shrink-0 select-none">
            <span className="flex-1 pl-8">Name</span>
            <span className="w-20 text-right">Size</span>
            <div className="w-10 flex justify-end">
              {onCreateFolder && (
                <button
                  onClick={() => setCreatingFolder(true)}
                  className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground/30 hover:text-foreground hover:bg-black/[0.05] transition-all duration-150"
                >
                  <FolderPlus className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto"
            style={{
              backgroundColor: isRootTarget ? "rgba(0,0,0,0.04)" : undefined,
              transition: "background-color 150ms",
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-sm text-muted-foreground/50">Loading...</p>
              </div>
            ) : (
              <div>
                {creatingFolder && (
                  <NewFolderInput
                    onConfirm={(name) => {
                      onCreateFolder?.(name)
                      setCreatingFolder(false)
                    }}
                    onCancel={() => setCreatingFolder(false)}
                  />
                )}
                {folders.map((folder) =>
                  folder ? (
                    <FolderSection
                      key={folder}
                      name={folder}
                      files={grouped[folder]}
                      onOpen={onOpen}
                      onReveal={onReveal}
                      onDelete={onDelete}
                      onFilesDropped={onFilesDropped}
                      onDragActive={onDragActive}
                    />
                  ) : (
                    grouped[folder].map((f) => (
                      <FileRow
                        key={f.path}
                        file={f}
                        onOpen={onOpen}
                        onReveal={onReveal}
                        onDelete={onDelete}
                      />
                    ))
                  ),
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NewFolderInput({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={cn("flex items-center h-9 px-6 bg-secondary/50")}>
      <FolderPlus className="size-4 shrink-0 text-muted-foreground/50 mr-2.5" />
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onConfirm(value.trim())
          if (e.key === "Escape") onCancel()
        }}
        onBlur={() => {
          if (value.trim()) onConfirm(value.trim())
          else onCancel()
        }}
        placeholder="Folder name"
        className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  )
}

function groupByFolder(files: FileEntry[]): Record<string, FileEntry[]> {
  const grouped: Record<string, FileEntry[]> = {}
  for (const f of files) {
    const parts = f.path.split("/")
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : ""
    ;(grouped[folder] ??= []).push(f)
  }
  return grouped
}
