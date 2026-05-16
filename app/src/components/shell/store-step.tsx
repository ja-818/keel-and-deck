import { useMemo } from "react";
import { Input } from "@houston-ai/core";
import { Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentDefinition, StoreListing } from "../../lib/types";
import { AgentCard, StoreAgentCard } from "./experience-card";

interface StoreStepProps {
  search: string;
  onSearchChange: (value: string) => void;
  agents: AgentDefinition[];
  storeCatalog: StoreListing[];
  onSelect: (id: string) => void;
  onInstall: (listing: StoreListing) => Promise<void>;
  onCreateWithAi: () => void;
}

export function StoreStep({
  search,
  onSearchChange,
  agents,
  storeCatalog,
  onSelect,
  onInstall,
  onCreateWithAi,
}: StoreStepProps) {
  const { t } = useTranslation("shell");

  const storeIds = useMemo(
    () => new Set(storeCatalog.map((listing) => listing.id)),
    [storeCatalog],
  );
  const query = search.trim().toLowerCase();

  const filteredAgents = useMemo(
    () =>
      agents.filter((d) => {
        if (d.source === "installed" && d.config.author === "Houston") {
          return false;
        }
        if (storeIds.has(d.config.id)) return false;
        if (!query) return true;
        return matchesAgent(d, query);
      }),
    [agents, query, storeIds],
  );

  const filteredStore = useMemo(
    () =>
      storeCatalog.filter((listing) => {
        if (!query) return true;
        return matchesListing(listing, query);
      }),
    [query, storeCatalog],
  );

  const totalResults = filteredAgents.length + filteredStore.length;

  return (
    <>
      <div className="shrink-0 px-6 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("store.searchPlaceholder")}
            className="pl-9 rounded-full bg-secondary border-border focus:bg-background"
          />
        </div>
      </div>

      <div
        data-tour-target="agentStore"
        className="flex-1 min-h-0 overflow-y-auto px-6 pb-6"
      >
        {/* Create with AI — always visible above the catalog */}
        {!query && (
          <button
            type="button"
            onClick={onCreateWithAi}
            className="w-full mb-4 flex items-center gap-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 px-5 py-4 text-left transition-colors duration-200 group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0 transition-colors group-hover:bg-primary/20">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {t("aiAssist.cardTitle")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {t("aiAssist.cardDescription")}
              </p>
            </div>
          </button>
        )}

        {totalResults > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAgents.map((def) => (
              <AgentCard
                key={def.config.id}
                config={def.config}
                onSelect={onSelect}
              />
            ))}
            {filteredStore.map((listing) => (
              <StoreAgentCard
                key={listing.id}
                listing={listing}
                onInstall={onInstall}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              {t("store.noResults")}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function matchesAgent(def: AgentDefinition, query: string): boolean {
  const config = def.config;
  return (
    config.name.toLowerCase().includes(query) ||
    config.description.toLowerCase().includes(query) ||
    config.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
    config.integrations?.some((toolkit) =>
      toolkit.toLowerCase().includes(query),
    ) ||
    false
  );
}

function matchesListing(listing: StoreListing, query: string): boolean {
  return (
    listing.name.toLowerCase().includes(query) ||
    listing.description.toLowerCase().includes(query) ||
    listing.tags.some((tag) => tag.toLowerCase().includes(query)) ||
    listing.integrations?.some((toolkit) =>
      toolkit.toLowerCase().includes(query),
    ) ||
    false
  );
}
