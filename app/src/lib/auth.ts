import { listen } from "@tauri-apps/api/event";
import { supabase, isAuthConfigured } from "./supabase";
import { tauriSystem } from "./tauri";
import { analytics } from "./analytics";
import { logger } from "./logger";

const REDIRECT_URI = "houston://auth-callback";

/**
 * Kick off the Google OAuth flow. Supabase generates a PKCE verifier
 * (stored in Keychain via our storage adapter), returns an auth URL, and
 * we open it in the user's system browser. After consent the browser
 * redirects to `houston://auth-callback?code=...`, which the deep-link
 * handler in Rust forwards to `installDeepLinkListener` below.
 */
export async function signInWithGoogle(): Promise<void> {
  if (!isAuthConfigured()) {
    throw new Error("Auth not configured");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: REDIRECT_URI,
      // Don't let Supabase touch window.location — we're in a webview and
      // need the consent page to open in the user's real browser.
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error("Supabase returned no auth URL");

  await tauriSystem.openUrl(data.url);
}

/**
 * Sign out: clear the Supabase session (our Keychain storage adapter
 * removes the tokens) and reset PostHog's distinct_id so subsequent
 * anonymous events don't accrue to the prior user.
 */
export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    logger.warn(`[auth] signOut failed: ${e}`);
  }
  analytics.reset();
}

let deepLinkInstalled = false;

/**
 * Listen for `auth://deep-link` events emitted by the Rust deep-link
 * handler (see `app/src-tauri/src/auth.rs`). Extracts the `code` param
 * from the callback URL and completes the PKCE exchange to populate the
 * Supabase session in Keychain.
 *
 * Idempotent — safe to call more than once per app lifetime.
 */
export function installDeepLinkListener(): () => void {
  if (deepLinkInstalled) return () => {};
  deepLinkInstalled = true;

  const unlistenPromise = listen<string>("auth://deep-link", async (event) => {
    const rawUrl = event.payload;
    logger.info(`[auth] deep-link received: ${rawUrl}`);

    try {
      const url = new URL(rawUrl);
      const code = url.searchParams.get("code");
      const errorParam = url.searchParams.get("error_description");

      if (errorParam) {
        logger.error(`[auth] OAuth error: ${errorParam}`);
        return;
      }

      if (!code) {
        logger.warn("[auth] deep-link had no `code` param — ignoring");
        return;
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        logger.error(`[auth] exchangeCodeForSession failed: ${error.message}`);
        return;
      }

      logger.info(`[auth] session established for ${data.user?.email}`);
    } catch (e) {
      logger.error(`[auth] failed to handle deep-link: ${e}`);
    }
  });

  return () => {
    unlistenPromise.then((fn) => fn()).catch(() => {});
    deepLinkInstalled = false;
  };
}
