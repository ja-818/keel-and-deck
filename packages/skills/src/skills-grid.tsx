/**
 * SkillsGrid — Installed skills list + optional community skills section.
 * Fully props-driven: host app provides data and callbacks.
 */
import { useMemo } from "react"
import type { Skill, CommunitySkill } from "./types"
import { SkillRow } from "./skill-row"
import { CommunitySkillsSection } from "./community-skills-browser"

export interface SkillsGridProps {
  skills: Skill[]
  loading: boolean
  onSkillClick: (skill: Skill) => void
  /** Community marketplace callbacks. Omit to hide the community section. */
  community?: {
    onSearch: (query: string) => Promise<CommunitySkill[]>
    onInstall: (skill: CommunitySkill) => Promise<string>
  }
}

export function SkillsGrid({
  skills,
  loading,
  onSkillClick,
  community,
}: SkillsGridProps) {
  const sorted = useMemo(() => {
    return [...skills].sort((a, b) => a.name.localeCompare(b.name))
  }, [skills])

  if (loading && skills.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[#9b9b9b] animate-pulse">
          Loading skills...
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        {/* Installed section */}
        {sorted.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-[#0d0d0d] normal-case">Installed</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {sorted.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  onClick={() => onSkillClick(skill)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Community marketplace */}
        {community && (
          <CommunitySkillsSection
            onSearch={community.onSearch}
            onInstall={community.onInstall}
          />
        )}
      </div>
    </div>
  )
}
