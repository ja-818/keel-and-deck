/**
 * CommunitySkillsSection — Search and install skills from a community marketplace.
 * Fully props-driven: host app provides search + install callbacks.
 */
import { useCallback, useEffect, useState } from "react"
import type { CommunitySkill } from "./types"
import { CommunitySkillRow } from "./community-skill-row"
import { Search } from "lucide-react"

const PAGE_SIZE = 20

export interface CommunitySkillsSectionProps {
  /** Called when the user types a search query (debounced internally at 350ms). */
  onSearch: (query: string) => Promise<CommunitySkill[]>
  /** Called when the user clicks install on a community skill. Should return the installed skill name. */
  onInstall: (skill: CommunitySkill) => Promise<string>
}

export function CommunitySkillsSection({
  onSearch,
  onInstall,
}: CommunitySkillsSectionProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CommunitySkill[]>([])
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set())
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      doSearch(q)
      setShowAll(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const doSearch = async (q: string) => {
    setLoading(true)
    try {
      const skills = await onSearch(q)
      setResults(skills)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = useCallback(
    async (skill: CommunitySkill) => {
      setInstallingIds((prev) => new Set(prev).add(skill.id))
      try {
        await onInstall(skill)
        setInstalledIds((prev) => new Set(prev).add(skill.id))
      } finally {
        setInstallingIds((prev) => {
          const next = new Set(prev)
          next.delete(skill.id)
          return next
        })
      }
    },
    [onInstall],
  )

  const visible = showAll ? results : results.slice(0, PAGE_SIZE)
  const hasMore = results.length > PAGE_SIZE && !showAll

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-[#0d0d0d]">
          Discover skills from the community
        </h2>
        <p className="text-xs text-[#9b9b9b] mt-0.5">
          Browse thousands of ready-made procedures on skills.sh
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9b9b9b]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={'Search by what you want to achieve, like "sdr" or "writing"'}
          className="w-full h-9 pl-9 pr-3 rounded-full border border-black/[0.10] bg-white text-sm
                     placeholder:text-black/40 focus:outline-none focus:border-black/[0.25] transition-colors"
        />
      </div>

      {/* Results grid */}
      {loading && results.length === 0 && (
        <p className="text-sm text-[#9b9b9b] animate-pulse">Loading...</p>
      )}

      {!loading && results.length === 0 && query.trim() && (
        <p className="text-sm text-[#9b9b9b]">
          No skills found for "{query.trim()}"
        </p>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {visible.map((skill) => (
            <CommunitySkillRow
              key={skill.id}
              skill={skill}
              installing={installingIds.has(skill.id)}
              installed={installedIds.has(skill.id)}
              onInstall={() => handleInstall(skill)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="text-sm text-[#5d5d5d] hover:text-[#0d0d0d] transition-colors"
        >
          Show {results.length - PAGE_SIZE} more
        </button>
      )}
    </section>
  )
}
