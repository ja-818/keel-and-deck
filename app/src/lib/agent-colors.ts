/** Agent color definitions — each has a light and dark variant. */
export interface AgentColor {
  id: string;
  light: string;  // used on light backgrounds
  dark: string;   // used on dark backgrounds
}

export const AGENT_COLORS: AgentColor[] = [
  { id: "charcoal",  light: "#1a1a1a", dark: "#d4d4d4" },
  { id: "forest",    light: "#1b6b3a", dark: "#4ade80" },
  { id: "navy",      light: "#1e4d8c", dark: "#60a5fa" },
  { id: "purple",    light: "#5b21b6", dark: "#a78bfa" },
  { id: "crimson",   light: "#a3261a", dark: "#f87171" },
  { id: "orange",    light: "#b45309", dark: "#fb923c" },
  { id: "golden",    light: "#a16207", dark: "#fbbf24" },
];

/** Resolve a stored color value to the correct hex for the current theme.
 *  Handles both old-style raw hex values and new semantic IDs. */
export function resolveAgentColor(stored: string | undefined): string {
  if (!stored) return currentDefault();
  const entry = AGENT_COLORS.find((c) => c.id === stored || c.light === stored || c.dark === stored);
  if (entry) return isDark() ? entry.dark : entry.light;
  // Fallback: raw hex from before the semantic system
  return stored;
}

/** Get the display hex for a color entry based on current theme. */
export function colorHex(color: AgentColor): string {
  return isDark() ? color.dark : color.light;
}

function isDark(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function currentDefault(): string {
  return isDark() ? AGENT_COLORS[0].dark : AGENT_COLORS[0].light;
}
