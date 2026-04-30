const TITLE_MAX = 40;

export function fallbackMissionTitle(text: string): string {
  const normalized = normalizeSpaces(text);
  if (normalized.length === 0) return "New mission";
  if ([...normalized].length <= TITLE_MAX) return normalized;

  const slice = takeChars(normalized, TITLE_MAX);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${base.trimEnd()}...`;
}

export function cleanGeneratedTitle(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeSpaces(value)
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim();
  if (!normalized) return null;

  const words = normalized.split(" ").slice(0, 6);
  return takeChars(words.join(" "), 64);
}

function normalizeSpaces(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(" ");
}

function takeChars(value: string, count: number): string {
  return [...value].slice(0, count).join("");
}
