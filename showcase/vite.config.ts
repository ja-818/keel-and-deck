import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5555,
  },
  optimizeDeps: {
    exclude: [
      "@houston-ai/core",
      "@houston-ai/board",
      "@houston-ai/chat",
      "@houston-ai/layout",
      "@houston-ai/events",
      "@houston-ai/memory",
      "@houston-ai/routines",
      "@houston-ai/connections",
      "@houston-ai/skills",
      "@houston-ai/review",
      "@houston-ai/workspace",
    ],
  },
});
