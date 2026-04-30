import { getEngine } from "./engine";
import { logger } from "./logger";
import {
  cleanGeneratedTitle,
  fallbackMissionTitle,
} from "./mission-title-text";

export { fallbackMissionTitle } from "./mission-title-text";

export interface RefreshMissionTitleOptions {
  agentPath: string;
  activityId: string;
  text: string;
  provider?: string;
  model?: string;
}

export async function refreshMissionTitle({
  agentPath,
  activityId,
  text,
  provider,
  model,
}: RefreshMissionTitleOptions): Promise<void> {
  const fallback = fallbackMissionTitle(text);
  try {
    const summary = await getEngine().summarizeActivity(text, {
      agentPath,
      provider,
      model,
    });
    const title = cleanGeneratedTitle(summary.title) ?? fallback;
    if (title === fallback) return;
    await getEngine().updateActivity(agentPath, activityId, { title });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[mission-title] keeping fallback title for ${activityId}`,
      message,
    );
  }
}
