import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { version } from "./package.json";

const host = process.env.TAURI_DEV_HOST;

// Pick from either the shell or a local `.env.local` (gitignored). CI sets
// the vars in the shell via GitHub Secrets; locally you drop them in
// `app/.env.local` so `pnpm tauri dev` picks them up without exports.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __POSTHOG_KEY__: JSON.stringify(env.POSTHOG_KEY ?? ""),
    __POSTHOG_HOST__: JSON.stringify(
      env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    ),
    __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL ?? ""),
    __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY ?? ""),
    __SLACK_BUG_WEBHOOK__: JSON.stringify(env.SLACK_BUG_WEBHOOK_URL ?? ""),
  },
  clearScreen: false,
  // Exclude workspace packages from Vite's dep pre-bundling so live edits
  // are picked up immediately without stale cache issues.
  optimizeDeps: {
    exclude: [
      "@houston-ai/chat",
      "@houston-ai/core",
      "@houston-ai/board",
      "@houston-ai/layout",
      "@houston-ai/events",
      "@houston-ai/routines",
      "@houston-ai/skills",
      "@houston-ai/review",
      "@houston-ai/agent",
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  };
});
