import { trackEvent } from "@aptabase/tauri";

/**
 * Wrapper around Aptabase tracking. Fire-and-forget -- never throws.
 * If Aptabase plugin is not configured (no app key), trackEvent silently no-ops.
 */
export const analytics = {
  track: (event: string, props?: Record<string, string | number>) => {
    try {
      trackEvent(event, props).catch(() => {});
    } catch {
      // Plugin not available (e.g., in dev without Tauri)
    }
  },
};
