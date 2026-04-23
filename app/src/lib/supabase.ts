import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";

// __SUPABASE_URL__ / __SUPABASE_ANON_KEY__ baked at build time by Vite.
// Empty values → Supabase client still constructs but all auth calls are
// no-ops (isAuthConfigured() returns false so the UI won't attempt sign-in).
const URL_ = typeof __SUPABASE_URL__ !== "undefined" ? __SUPABASE_URL__ : "";
const KEY = typeof __SUPABASE_ANON_KEY__ !== "undefined" ? __SUPABASE_ANON_KEY__ : "";

/**
 * Custom storage adapter that round-trips to Rust via the `auth_*` Tauri
 * commands, so Supabase session tokens live in macOS Keychain / Windows
 * Credential Manager — never localStorage, never disk. Supabase stores
 * the PKCE code verifier here too during OAuth, so the whole auth flow
 * is Keychain-backed end-to-end.
 */
const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await invoke<string | null>("auth_get_item", { key });
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await invoke("auth_set_item", { key, value });
    } catch {
      // Keychain unavailable — session won't persist across launches, but the
      // in-memory session on this run still works.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await invoke("auth_remove_item", { key });
    } catch {
      // best-effort
    }
  },
};

export const supabase: SupabaseClient = createClient(
  URL_ || "https://placeholder.supabase.co",
  KEY || "placeholder-anon-key",
  {
    auth: {
      storage: keychainStorage,
      storageKey: "houston-auth",
      autoRefreshToken: true,
      persistSession: true,
      // We listen for the deep-link URL in the app and call
      // `exchangeCodeForSession` ourselves — disable the built-in URL sniffer
      // so Supabase doesn't also try to consume window.location.
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);

export const isAuthConfigured = (): boolean => Boolean(URL_ && KEY);
