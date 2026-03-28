/**
 * SkillDetailPage — View and edit a skill's instructions + learnings.
 * Fully props-driven: host app provides the skill data and save callback.
 */
import { useCallback, useEffect, useState } from "react"
import type { Skill } from "./types"
import { ArrowLeft, FileText } from "lucide-react"

export interface SkillDetailPageProps {
  skill: Skill | undefined
  onBack: () => void
  onSave: (skillName: string, instructions: string) => Promise<void>
}

export function SkillDetailPage({
  skill,
  onBack,
  onSave,
}: SkillDetailPageProps) {
  const [instructions, setInstructions] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (skill) setInstructions(skill.instructions)
  }, [skill?.id])

  const handleSave = useCallback(async () => {
    if (!skill) return
    setSaving(true)
    try {
      await onSave(skill.name, instructions)
    } finally {
      setSaving(false)
    }
  }, [skill, instructions, onSave])

  if (!skill) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[#9b9b9b]">Skill not found</p>
      </div>
    )
  }

  const isDirty = instructions !== skill.instructions

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-black/[0.06]">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="size-8 flex items-center justify-center rounded-lg text-[#9b9b9b] hover:text-[#0d0d0d] hover:bg-black/[0.05] transition-colors"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium text-[#0d0d0d] truncate">
              {skill.name}
            </h1>
            <p className="text-xs text-[#9b9b9b] flex items-center gap-1 truncate">
              <FileText className="size-3" />
              {skill.file_path}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Instructions */}
          <section>
            <label className="block text-xs font-medium text-[#9b9b9b] tracking-wider mb-2">
              Instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={12}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-[#0d0d0d] placeholder:text-[#9b9b9b] focus:outline-none focus:border-black/[0.2] resize-y font-mono"
              placeholder="Instructions for this skill..."
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                className="px-4 py-2 rounded-full text-sm font-medium bg-[#0d0d0d] text-white hover:bg-[#2d2d2d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              {isDirty && (
                <span className="text-xs text-[#9b9b9b]">Unsaved changes</span>
              )}
            </div>
          </section>

          {/* Learnings */}
          {skill.learnings.trim() && (
            <section>
              <label className="block text-xs font-medium text-[#9b9b9b] tracking-wider mb-2">
                Learnings
              </label>
              <div className="rounded-xl border border-black/[0.08] bg-[#fafafa] px-4 py-3 text-sm text-[#5d5d5d] whitespace-pre-wrap font-mono">
                {skill.learnings}
              </div>
              <p className="text-xs text-[#9b9b9b] mt-2">
                Learnings are added automatically when you give feedback on completed tasks.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
