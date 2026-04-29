/** Agent color definitions, each with light and dark variants. */
export interface AgentColor {
  id: string;
  light: string;
  dark: string;
}

export const AGENT_COLORS: AgentColor[] = [
  { id: "charcoal", light: "#1a1a1a", dark: "#d4d4d4" },
  { id: "forest", light: "#1b6b3a", dark: "#4ade80" },
  { id: "navy", light: "#1e4d8c", dark: "#60a5fa" },
  { id: "purple", light: "#5b21b6", dark: "#a78bfa" },
  { id: "crimson", light: "#a3261a", dark: "#f87171" },
  { id: "orange", light: "#b45309", dark: "#fb923c" },
  { id: "golden", light: "#a16207", dark: "#fbbf24" },
];

export function resolveAgentColor(stored: string | undefined): string {
  if (!stored) return currentDefault();
  const entry = AGENT_COLORS.find(
    (c) => c.id === stored || c.light === stored || c.dark === stored,
  );
  if (entry) return colorHex(entry);
  return stored;
}

export function colorHex(color: AgentColor): string {
  return isDark() ? color.dark : color.light;
}

function isDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function currentDefault(): string {
  return colorHex(AGENT_COLORS[0]);
}
