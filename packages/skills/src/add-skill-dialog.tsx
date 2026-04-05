/**
 * AddSkillDialog — Marketplace modal for searching and installing skills
 * from skills.sh. Loads featured skills on open, with search.
 * Repo install is accessible via a secondary view (link icon).
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  cn,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@houston-ai/core"
import {
  AlertCircle, ArrowLeft, Check, Loader2,
  Plus, Search,
} from "lucide-react"
import type { CommunitySkill } from "./types"

export interface AddSkillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSearch: (query: string) => Promise<CommunitySkill[]>
  onInstallCommunity: (skill: CommunitySkill) => Promise<string>
  onInstallFromRepo?: (source: string) => Promise<string[]>
}

type View = "store" | "repo"

export function AddSkillDialog({
  open,
  onOpenChange,
  onSearch,
  onInstallCommunity,
  onInstallFromRepo,
}: AddSkillDialogProps) {
  const [view, setView] = useState<View>("store")

  // Reset view when dialog closes
  useEffect(() => {
    if (!open) setView("store")
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col gap-4">
        {view === "store" ? (
          <StoreView
            open={open}
            onSearch={onSearch}
            onInstall={onInstallCommunity}
            onSwitchToRepo={onInstallFromRepo ? () => setView("repo") : undefined}
          />
        ) : (
          <RepoView
            onBack={() => setView("store")}
            onInstall={onInstallFromRepo!}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Store view (search + results) ─────────────────────────────────

function StoreView({
  open,
  onSearch,
  onInstall,
  onSwitchToRepo,
}: {
  open: boolean
  onSearch: (query: string) => Promise<CommunitySkill[]>
  onInstall: (skill: CommunitySkill) => Promise<string>
  onSwitchToRepo?: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CommunitySkill[]>([])
  const [featured, setFeatured] = useState<CommunitySkill[]>([])
  const [loading, setLoading] = useState(true)
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set())
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const mountedRef = useRef(true)
  const loadedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Load featured on dialog open
  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      setLoading(true)
      loadedRef.current = false
      return
    }
    if (loadedRef.current) return
    loadedRef.current = true
    loadFeatured()
  }, [open])

  const loadFeatured = async () => {
    setLoading(true)
    try {
      const skills = await onSearch("ai")
      if (mountedRef.current) setFeatured(skills.slice(0, 10))
    } catch {
      // Featured load failed — not critical, user can still search
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  // Debounced search on query change
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const skills = await onSearch(q)
        if (mountedRef.current) setResults(skills)
      } catch {
        if (mountedRef.current) setResults([])
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      setLoading(false)
    }
  }, [query, onSearch])

  const handleInstall = useCallback(
    async (skill: CommunitySkill) => {
      setInstallingIds((prev) => new Set(prev).add(skill.id))
      try {
        await onInstall(skill)
        setInstalledIds((prev) => new Set(prev).add(skill.id))
      } catch (e) {
        console.error("[skills] Install failed:", e)
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

  const visibleSkills = query.trim() ? results : featured

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add skills</DialogTitle>
        <DialogDescription>
          Search and install skills from{" "}
          <span className="font-medium text-foreground">skills.sh</span>
          {onSwitchToRepo && (
            <>
              {" or "}
              <button
                onClick={onSwitchToRepo}
                className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80 transition-colors"
              >
                direct install
              </button>
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills..."
          autoFocus
          className="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm
                     placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto -mx-6 min-h-0">
        {loading && visibleSkills.length === 0 && (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        )}

        {!loading && visibleSkills.length === 0 && query.trim() && (
          <p className="text-sm text-muted-foreground px-6 py-4">
            No skills found for &ldquo;{query.trim()}&rdquo;
          </p>
        )}

        {!loading && visibleSkills.length === 0 && !query.trim() && (
          <p className="text-sm text-muted-foreground px-6 py-4 text-center">
            Type to search for skills
          </p>
        )}

        {visibleSkills.length > 0 && (
          <div className="divide-y divide-border border-y border-border">
            {visibleSkills.map((skill) => (
              <StoreRow
                key={skill.id}
                skill={skill}
                installing={installingIds.has(skill.id)}
                installed={installedIds.has(skill.id)}
                onInstall={() => handleInstall(skill)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Repo view ─────────────────────────────────────────────────────

function RepoView({
  onBack,
  onInstall,
}: {
  onBack: () => void
  onInstall: (source: string) => Promise<string[]>
}) {
  const [source, setSource] = useState("")
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<string[]>([])

  const handleInstall = useCallback(async () => {
    const trimmed = source.trim()
    if (!trimmed) return
    setInstalling(true)
    setError("")
    setSuccess([])
    try {
      const names = await onInstall(trimmed)
      setSuccess(names)
      setSource("")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }, [source, onInstall])

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="size-8 flex items-center justify-center rounded-lg text-muted-foreground
                       hover:text-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="size-4" />
          </button>
          <DialogTitle>Install from repo</DialogTitle>
        </div>
        <DialogDescription>
          Enter a GitHub repo address to install all its skills at once
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && source.trim() && !installing) handleInstall()
            }}
            placeholder="owner/repo"
            disabled={installing}
            autoFocus
            className="flex-1"
          />
          <Button
            onClick={handleInstall}
            disabled={!source.trim() || installing}
            className="rounded-full shrink-0"
          >
            {installing ? <Spinner className="size-4" /> : "Install"}
          </Button>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </p>
        )}

        {success.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Check className="size-4 text-emerald-600 shrink-0" />
            <span>
              Installed {success.length} skill{success.length !== 1 && "s"}:{" "}
              {success.join(", ")}
            </span>
          </div>
        )}
      </div>
    </>
  )
}

// ── Store row ─────────────────────────────────────────────────────

function kebabToTitle(s: string): string {
  return s
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function StoreRow({
  skill,
  installing,
  installed,
  onInstall,
}: {
  skill: CommunitySkill
  installing: boolean
  installed: boolean
  onInstall: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {kebabToTitle(skill.name)}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {skill.source}
          {skill.installs > 0 && ` · ${formatInstalls(skill.installs)} installs`}
        </p>
      </div>
      <button
        onClick={onInstall}
        disabled={installing || installed}
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
