import { useTranslation } from "react-i18next";
import { EXPERIENCE_LEVEL_PREF_KEY } from "../../../lib/experience-level";
import { tauriPreferences } from "../../../lib/tauri";
import { useUIStore, type ExperienceLevel } from "../../../stores/ui";

export function ExperienceSection() {
  const { t } = useTranslation("settings");
  const experienceLevel = useUIStore((s) => s.experienceLevel);
  const setExperienceLevel = useUIStore((s) => s.setExperienceLevel);

  const cards: Array<{ id: ExperienceLevel }> = [
    { id: "beginner" },
    { id: "professional" },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">{t("experience.title")}</h2>
      <div className="flex gap-2" role="radiogroup" aria-label={t("experience.title")}>
        {cards.map((card) => {
          const active = experienceLevel === card.id;
          return (
            <button
              key={card.id}
              role="radio"
              aria-checked={active}
              onClick={() => {
                setExperienceLevel(card.id);
                tauriPreferences
                  .set(EXPERIENCE_LEVEL_PREF_KEY, card.id)
                  .catch((e) => console.error("[experience] persist failed:", e));
              }}
              className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-sm transition-colors text-left ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-accent border border-black/5"
              }`}
            >
              <span className="font-medium">
                {t(`experience.${card.id}`)}
              </span>
              <span className={`text-xs ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {t(`experience.${card.id}Desc`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
