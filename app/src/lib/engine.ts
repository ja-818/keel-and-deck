/**
 * Engine client bootstrap for the Houston desktop app.
 *
 * The Tauri supervisor spawns the `houston-engine` subprocess, parses its
 * stdout for `HOUSTON_ENGINE_LISTENING port=<p> token=<t>`, and injects
 * `window.__HOUSTON_ENGINE__ = { baseUrl, token }` via
 * `initializationScript` (see `app/src-tauri/tauri.conf.json`).
 *
 * Frontend code should prefer this `engine` singleton over raw Tauri IPC.
 * OS-native calls (file pickers, reveal-in-finder) still live on
 * `@tauri-apps/api` — everything else flows through the engine wire.
 */

import { HoustonClient, EngineWebSocket } from "@houston-ai/engine-client";

declare global {
  interface Window {
    __HOUSTON_ENGINE__?: {
      baseUrl: string;
      token: string;
    };
  }
}

function resolveConfig(): { baseUrl: string; token: string } | null {
  if (typeof window !== "undefined" && window.__HOUSTON_ENGINE__) {
    return window.__HOUSTON_ENGINE__;
  }
  // Dev fallback — if HOUSTON_ENGINE_BASE / TOKEN present on Vite env, use them.
  const baseUrl =
    (import.meta as any).env?.VITE_HOUSTON_ENGINE_BASE ?? null;
  const token = (import.meta as any).env?.VITE_HOUSTON_ENGINE_TOKEN ?? null;
  if (baseUrl && token) return { baseUrl, token };
  return null;
}

const config = resolveConfig();

/**
 * Shared engine client. `null` until the Tauri supervisor injects the
 * bootstrap config; modules that need it should read via `getEngine()`.
 */
export const engine: HoustonClient | null = config
  ? new HoustonClient(config)
  : null;

export function getEngine(): HoustonClient {
  if (!engine) {
    throw new Error(
      "[engine] not bootstrapped. window.__HOUSTON_ENGINE__ missing."
    );
  }
  return engine;
}

/** Lazily-created shared WS instance. */
let _ws: EngineWebSocket | null = null;
export function getEngineWs(): EngineWebSocket {
  if (!_ws) {
    _ws = new EngineWebSocket(getEngine());
    _ws.connect();
  }
  return _ws;
}

/** Flag for staged migration — set `VITE_HOUSTON_USE_ENGINE_SERVER=1` in dev. */
export const useEngineServer: boolean =
  (import.meta as any).env?.VITE_HOUSTON_USE_ENGINE_SERVER === "1";
