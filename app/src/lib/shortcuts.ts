const isMac =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent || "");

export type ShortcutAction =
  | "newMission"
  | "palette"
  | "missionControl"
  | "prevAgent"
  | "nextAgent"
  | "boardUp"
  | "boardDown"
  | "boardLeft"
  | "boardRight"
  | "boardOpen"
  | "cheatsheet";

interface ShortcutDef {
  /** Glyph string shown to the user. */
  label: string;
  /** Whether the binding fires when typing in inputs. Default: never. */
  match: (e: KeyboardEvent) => boolean;
}

const cmd = (e: KeyboardEvent) =>
  isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;

const shortcuts: Record<ShortcutAction, ShortcutDef> = {
  newMission: {
    label: isMac ? "⌘N" : "Ctrl+N",
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && (e.key === "n" || e.key === "N"),
  },
  palette: {
    label: isMac ? "⌘K" : "Ctrl+K",
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K"),
  },
  missionControl: {
    label: isMac ? "⌘M" : "Ctrl+M",
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && (e.key === "m" || e.key === "M"),
  },
  prevAgent: {
    label: isMac ? "⌘[" : "Ctrl+[",
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && e.key === "[",
  },
  nextAgent: {
    label: isMac ? "⌘]" : "Ctrl+]",
    match: (e) => cmd(e) && !e.shiftKey && !e.altKey && e.key === "]",
  },
  boardUp: {
    label: "↑",
    match: (e) =>
      e.key === "ArrowUp" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardDown: {
    label: "↓",
    match: (e) =>
      e.key === "ArrowDown" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardLeft: {
    label: "←",
    match: (e) =>
      e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardRight: {
    label: "→",
    match: (e) =>
      e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  boardOpen: {
    label: "↵",
    match: (e) =>
      e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey,
  },
  cheatsheet: {
    label: "?",
    match: (e) => !cmd(e) && !e.altKey && e.shiftKey && e.key === "?",
  },
};

export function shortcutLabel(action: ShortcutAction): string {
  return shortcuts[action].label;
}

export function matchShortcut(action: ShortcutAction, e: KeyboardEvent): boolean {
  return shortcuts[action].match(e);
}

/**
 * True if the keystroke originated from somewhere the user is typing
 * (input, textarea, contentEditable). Most shortcuts skip in that case so
 * we don't steal characters from the composer.
 */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * True when the typing target exists but holds no text yet. Used by
 * arrow-key shortcuts so an auto-focused, still-empty composer doesn't
 * swallow board navigation — there's no cursor motion to perform until
 * the user types something.
 */
export function isEmptyEditable(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return (t.textContent ?? "").length === 0;
  const v = (t as HTMLInputElement | HTMLTextAreaElement).value;
  return typeof v === "string" && v.length === 0;
}
