import { useState } from "react"
import { FilesBrowser } from "@deck-ui/workspace"
import type { FileEntry } from "@deck-ui/workspace"
import { CodeBlock } from "../../components/code-block"

const INITIAL_FILES: FileEntry[] = [
  { path: "report.pdf", name: "report.pdf", extension: "pdf", size: 245000 },
  { path: "notes.md", name: "notes.md", extension: "md", size: 1200 },
  { path: "docs/design.md", name: "design.md", extension: "md", size: 3400 },
  { path: "docs/api.md", name: "api.md", extension: "md", size: 8200 },
  { path: "output/chart.png", name: "chart.png", extension: "png", size: 52000 },
  { path: "output/data.xlsx", name: "data.xlsx", extension: "xlsx", size: 18700 },
]

const USAGE_CODE = `import { FilesBrowser } from "@deck-ui/workspace"
import type { FileEntry } from "@deck-ui/workspace"

function MyFiles({ files }: { files: FileEntry[] }) {
  return (
    <FilesBrowser
      files={files}
      onOpen={(f) => openFile(f.path)}
      onReveal={(f) => showInFinder(f.path)}
      onDelete={(f) => deleteFile(f.path)}
      onFilesDropped={(dropped, folder) => importFiles(dropped, folder)}
      emptyTitle="Your work shows up here"
      emptyDescription="Drop files here or wait for agents to create them."
    />
  )
}`

export function FilesScreen() {
  const [files, setFiles] = useState<FileEntry[]>(INITIAL_FILES)

  function handleDrop(dropped: File[], targetFolder?: string) {
    const newEntries: FileEntry[] = dropped.map((f) => {
      const ext = f.name.includes(".") ? f.name.split(".").pop()! : ""
      const path = targetFolder ? `${targetFolder}/${f.name}` : f.name
      return { path, name: f.name, extension: ext, size: f.size }
    })
    setFiles((prev) => [...prev, ...newEntries])
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold mb-1">Files</h1>
        <p className="inline-block text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded mb-3">
          @deck-ui/workspace
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          File browser for an agent workspace. Groups files by folder, shows
          icons by type, file sizes, and open/reveal/delete actions via dropdown
          menu. Supports drag-and-drop from the OS.
        </p>
        <div className="h-[340px] rounded-xl border border-border overflow-hidden">
          <FilesBrowser
            files={files}
            onOpen={(f) => console.log("Open:", f.path)}
            onReveal={(f) => console.log("Reveal:", f.path)}
            onDelete={(f) => setFiles((prev) => prev.filter((p) => p.path !== f.path))}
            onFilesDropped={handleDrop}
          />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3">Usage</h2>
        <CodeBlock code={USAGE_CODE} />
      </div>
    </div>
  )
}
