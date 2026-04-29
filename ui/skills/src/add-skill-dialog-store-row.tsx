import { cn } from "@houston-ai/core"
import { Check, Loader2, Plus } from "lucide-react"
import type { CommunitySkill } from "./types"

export interface StoreRowLabels {
  installCount?: (count: number, formatted: string) => string
  installSkill?: (name: string) => string
  installedSkill?: (name: string) => string
}

const DEFAULT_LABELS: Required<StoreRowLabels> = {
  installCount: (_count, formatted) => `${formatted} installs`,
  installSkill: (name) => `Install ${name}`,
  installedSkill: (name) => `${name} installed`,
}

export function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function StoreRow({
  skill,
  installing,
  installed,
  onInstall,
  labels,
}: {
  skill: CommunitySkill
  installing: boolean
  installed: boolean
  onInstall: () => void
  labels?: StoreRowLabels
}) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const installs = l.installCount(skill.installs, formatInstalls(skill.installs))

  return (
    <div className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{skill.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {skill.source}
          {skill.installs > 0 && ` · ${installs}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onInstall}
        disabled={installing || installed}
        aria-label={installed ? l.installedSkill(skill.name) : l.installSkill(skill.name)}
        className={cn(
          "shrink-0 size-8 flex items-center justify-center rounded-full transition-colors",
          installed
            ? "text-muted-foreground cursor-default"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          installing && "opacity-50 cursor-wait",
        )}
      >
        {installing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : installed ? (
          <Check className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
      </button>
    </div>
  )
}
