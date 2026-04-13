import { tauriPreferences } from "./tauri";

export type Theme = "light" | "dark";

const THEME_KEY = "theme";

export function applyTheme(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export async function loadTheme(): Promise<Theme> {
  const saved = await tauriPreferences.get(THEME_KEY).catch(() => null);
  const theme: Theme = saved === "dark" ? "dark" : "light";
  applyTheme(theme);
  return theme;
}

export async function setTheme(theme: Theme) {
  applyTheme(theme);
  await tauriPreferences.set(THEME_KEY, theme);
}
