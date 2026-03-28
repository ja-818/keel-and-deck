import type { CommunitySkill } from "./types"
import { cn } from "@deck-ui/core"
import { Plus, Loader2, Check } from "lucide-react"

export interface CommunitySkillRowProps {
  skill: CommunitySkill
  installing: boolean
  installed: boolean
  onInstall: () => void
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Convert "vercel-react-best-practices" to "Vercel React Best Practices" */
function kebabToTitle(s: string): string {
  return s
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function CommunitySkillRow({
  skill,
  installing,
  installed,
  onInstall,
}: CommunitySkillRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-black/[0.08]
                 bg-white hover:border-black/[0.15] transition-all"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#0d0d0d] truncate">
          {kebabToTitle(skill.name)}
        </p>
        <p className="text-xs text-[#9b9b9b] truncate mt-0.5">
          {skill.source} · {formatInstalls(skill.installs)} installs
        </p>
      </div>
      <button
        onClick={onInstall}
        disabled={installing || installed}
        className={cn(
          "shrink-0 size-7 flex items-center justify-center rounded-lg transition-colors",
          installed
            ? "text-[#9b9b9b] cursor-default"
            : "text-[#9b9b9b] hover:bg-black/[0.06] hover:text-[#0d0d0d]",
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
