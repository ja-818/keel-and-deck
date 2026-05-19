import type { StackEntry } from "@houston-ai/engine-client";
import { tauriAgent } from "./tauri";

/**
 * Per-agent persistence for the "integrations the user still has to
 * connect" list shown right after the custom-agent flow creates a new
 * agent. Lives in the agent's `.houston/` folder so it survives reloads
 * and travels with the agent (delete the agent → file gone, no orphans).
 *
 * Shape on disk:
 *   { entries: StackEntry[] }
 *
 * When `entries` is empty the file is still written (with an empty
 * array). The panel hides itself when there's nothing left to connect,
 * so a stale empty file doesn't matter — it'll get rewritten the next
 * time a custom agent is created on this folder (which shouldn't happen,
 * agent folders are 1:1 with agents).
 *
 * Missing-file handling: `readFile` rejects when the file is absent.
 * Callers should treat any read failure as "no pending integrations"
 * rather than surfacing the error — agents created before this feature
 * existed will reliably 404 here.
 */

const REL_PATH = ".houston/pending-stack-integrations.json";

interface PendingFile {
  entries: StackEntry[];
}

export async function readPendingStackIntegrations(
  agentPath: string,
): Promise<StackEntry[]> {
  let raw: string;
  try {
    raw = await tauriAgent.readFile(agentPath, REL_PATH);
  } catch (e) {
    // Read endpoint should return "" for missing files (per
    // engine/houston-engine-core/src/agents/files.rs:31), so a thrown
    // error is unusual — log and continue.
    console.warn("[pendingStackIntegrations] read failed", agentPath, e);
    return [];
  }
  if (!raw || raw.trim() === "") {
    // File doesn't exist (engine returns empty string in that case).
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as PendingFile;
    if (!parsed || !Array.isArray(parsed.entries)) return [];
    return parsed.entries;
  } catch (e) {
    console.warn(
      "[pendingStackIntegrations] parse failed",
      agentPath,
      e,
      "raw:",
      raw.slice(0, 200),
    );
    return [];
  }
}

export async function writePendingStackIntegrations(
  agentPath: string,
  entries: StackEntry[],
): Promise<void> {
  const body: PendingFile = { entries };
  await tauriAgent.writeFile(agentPath, REL_PATH, JSON.stringify(body, null, 2));
}
