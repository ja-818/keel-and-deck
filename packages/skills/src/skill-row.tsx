import type { Skill } from "./types"

export interface SkillRowProps {
  skill: Skill
  onClick: () => void
}

export function SkillRow({ skill, onClick }: SkillRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-black/[0.08]
                 bg-white hover:border-black/[0.15] transition-all text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#0d0d0d] truncate">
          {skill.name}
        </p>
        {skill.description && (
          <p className="text-xs text-[#9b9b9b] truncate mt-0.5">
            {skill.description}
          </p>
        )}
      </div>
    </button>
  )
}
