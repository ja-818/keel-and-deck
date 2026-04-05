import { useState } from "react"
import { Button } from "@houston-ai/core"
import { Plus, Trash2 } from "lucide-react"

export interface LearningEntry {
  index: number
  text: string
}

export interface LearningsPanelProps {
  entries: LearningEntry[]
  onAdd: (text: string) => void
  onRemove: (index: number) => void
}

export function LearningsPanel({
  entries,
  onAdd,
  onRemove,
}: LearningsPanelProps) {
  const [newText, setNewText] = useState("")

  const handleAdd = () => {
    if (!newText.trim()) return
    onAdd(newText.trim())
    setNewText("")
  }

  return (
    <div className="max-w-3xl mx-auto p-6 flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd()
          }}
          placeholder="Add a learning..."
          className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="icon"
          className="rounded-full shrink-0"
          onClick={handleAdd}
          disabled={!newText.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No learnings yet. The agent will save learnings here as it works.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.index} className="flex items-start gap-2 text-sm">
              <span className="flex-1 bg-secondary rounded-lg px-3 py-2">
                {entry.text}
              </span>
              <button
                onClick={() => onRemove(entry.index)}
                className="shrink-0 mt-1.5 size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Remove learning"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
