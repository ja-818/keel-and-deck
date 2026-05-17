import type { ExperienceLevel } from "../stores/ui";

export const EXPERIENCE_LEVEL_PREF_KEY = "experience_level";

export function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return value === "beginner" || value === "professional";
}
