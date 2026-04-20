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
import { listen } from "@tauri-apps/api/event";

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

let _client: HoustonClient | null = null;
const initial = resolveConfig();
if (initial) {
  _client = new HoustonClient(initial);
}

export function getEngine(): HoustonClient {
  if (!_client) {
    throw new Error(
      "[engine] not bootstrapped. window.__HOUSTON_ENGINE__ missing.",
    );
  }
  return _client;
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

// --- Auto-reconnect on engine restart --------------------------------
//
// The Tauri supervisor restarts `houston-engine` with a fresh port + token
// on crash and emits `houston-engine-restarted` with the new handshake.
// Rebuild the client + WS so in-flight hooks pick up the new transport.
listen<{ baseUrl: string; token: string }>(
  "houston-engine-restarted",
  (ev) => {
    window.__HOUSTON_ENGINE__ = ev.payload;
    _client = new HoustonClient(ev.payload);
    if (_ws) {
      try {
        _ws.disconnect();
      } catch {
        /* ignore */
      }
      _ws = null;
    }
  },
).catch(() => {
  // Non-Tauri environment (tests, mobile web) — no-op.
});
