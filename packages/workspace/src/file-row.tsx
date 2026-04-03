/**
 * File row, folder section, and file icon sub-components.
 * Supports recursive folder hierarchies at any depth.
 * Extracted from FilesBrowser to keep files under 200 lines.
 */
import { useEffect, useState } from "react"
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deck-ui/core"
import {
  ChevronRight,
  ExternalLink,
  FileText,
  FolderSearch,
  Image as ImageIcon,
  MoreVertical,
  Trash2,
} from "lucide-react"
import type { FileEntry } from "./types"
import type { FolderNode } from "./tree"
import { countFiles } from "./tree"
import { useFolderDropTarget } from "./drop-zone"

// ---------------------------------------------------------------------------
// FolderSection — renders one folder node recursively
// ---------------------------------------------------------------------------

export function FolderSection({
  node,
  depth,
  onOpen,
  onReveal,
  onDelete,
  onFilesDropped,
  onDragActive,
}: {
  node: FolderNode
  /** Nesting depth (0 = top-level folder, 1 = subfolder, etc.) */
  depth: number
  onOpen?: (file: FileEntry) => void
  onReveal?: (file: FileEntry) => void
  onDelete?: (file: FileEntry) => void
  onFilesDropped?: (files: File[], targetFolder?: string) => void
  onDragActive?: (folder: string | null) => void
}) {
  const [open, setOpen] = useState(true)
  const { isOver, folderHandlers } = useFolderDropTarget(node.path, onFilesDropped)

  useEffect(() => {
    onDragActive?.(isOver ? node.path : null)
  }, [isOver, node.path, onDragActive])

  // Base px-6 = 24px. Each additional depth level indents by 16px.
  const headerPaddingLeft = 24 + depth * 16

  return (
    <div {...(onFilesDropped ? folderHandlers : {})}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center h-8 transition-colors duration-150 select-none hover:bg-secondary"
        style={{
          paddingLeft: headerPaddingLeft,
          paddingRight: 24,
          ...(isOver ? { backgroundColor: "rgba(0,0,0,0.06)" } : {}),
        }}
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground/40 transition-transform duration-200 mr-2 shrink-0",
            open && "rotate-90",
          )}
        />
        <span
          className="text-xs font-medium flex-1 text-left text-muted-foreground/60 truncate"
          style={isOver ? { color: "var(--color-foreground)" } : undefined}
        >
          {node.name}
        </span>
        <span className="text-[10px] text-muted-foreground/30 ml-2 shrink-0">
          {countFiles(node)}
        </span>
      </button>
      {open && (
        <div style={isOver ? { backgroundColor: "rgba(0,0,0,0.03)" } : undefined}>
          {node.children.map((child) =>
            child.kind === "folder" ? (
              <FolderSection
                key={child.path}
                node={child}
                depth={depth + 1}
                onOpen={onOpen}
                onReveal={onReveal}
                onDelete={onDelete}
                onFilesDropped={onFilesDropped}
                onDragActive={onDragActive}
              />
            ) : (
              <FileRow
                key={child.entry.path}
                file={child.entry}
                depth={depth + 1}
                onOpen={onOpen}
                onReveal={onReveal}
                onDelete={onDelete}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FileRow
// ---------------------------------------------------------------------------

export function FileRow({
  file,
  depth,
  onOpen,
  onReveal,
  onDelete,
}: {
  file: FileEntry
  /** Nesting depth (0 or undefined = root level, 1 = inside a top-level folder, etc.) */
  depth?: number
  onOpen?: (file: FileEntry) => void
  onReveal?: (file: FileEntry) => void
  onDelete?: (file: FileEntry) => void
}) {
  const ext = file.extension
  const hasActions = onOpen || onReveal || onDelete
  // Base px-6 = 24px. Indented files get +16px per depth + 4px icon offset.
  const paddingLeft = depth != null && depth > 0 ? 24 + depth * 16 + 4 : 24

  return (
    <button
      onClick={() => onOpen?.(file)}
      className={cn(
        "w-full flex items-center h-9 pr-6 hover:bg-secondary",
        "active:bg-accent transition-colors duration-100 text-left group",
      )}
      style={{ paddingLeft }}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <FileIcon extension={ext} />
        <span className="text-[13px] text-foreground truncate">
          {file.name}
        </span>
      </div>
      <span className="w-20 text-right text-[11px] text-muted-foreground/30">
        {formatSize(file.size)}
      </span>
      {hasActions && (
        <div className="w-10 flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground/20 hover:text-foreground hover:bg-black/[0.05] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-150"
              >
                <MoreVertical className="size-3.5" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onOpen && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpen(file)
                  }}
                >
                  <ExternalLink className="size-4 mr-2" />
                  Open
                </DropdownMenuItem>
              )}
              {onReveal && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onReveal(file)
                  }}
                >
                  <FolderSearch className="size-4 mr-2" />
                  Show in Finder
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(file)
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// FileIcon
// ---------------------------------------------------------------------------

function FileIcon({ extension }: { extension: string }) {
  if (["png", "jpg", "jpeg", "svg", "gif", "webp"].includes(extension)) {
    return <ImageIcon className="size-4 shrink-0 text-muted-foreground/50" />
  }
  if (extension === "pdf") {
    return (
      <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none">
        <rect width="16" height="16" rx="3" fill="#E5252A" />
        <text
          x="8"
          y="11"
          textAnchor="middle"
          fill="white"
          fontSize="7"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          PDF
        </text>
      </svg>
    )
  }
  return <FileText className="size-4 shrink-0 text-muted-foreground/50" />
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
