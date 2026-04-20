/**
 * Unified subscription helpers.
 *
 * When `VITE_HOUSTON_USE_ENGINE_SERVER=1`, events flow over the engine
 * WebSocket (topic-scoped). When the flag is off, we fall back to Tauri's
 * `houston-event` / `sync-message` / `sync-connection` channels.
 *
 * Callers should NOT import `listen` from `@tauri-apps/api/event` — go
 * through this module so the Phase 3 switchover stays in one place.
 */

import type { HoustonEvent } from "@houston-ai/core";
import { topics } from "@houston-ai/engine-client";
import { getEngineWs, useEngineServer } from "./engine";
import { legacyEmit, legacyListen } from "./os-bridge";

type Unsub = () => void;

/** Broad topics every frontend needs a stream of, regardless of agent. */
const BROAD_TOPICS: readonly string[] = [
  topics.auth,
  topics.toast,
  topics.events,
  topics.scheduler,
  topics.composio,
  topics.sync,
];

function toHandler<T>(handler: (ev: T) => void) {
  return (payload: unknown) => handler(payload as T);
}

function ensureBroadSubscription(): void {
  if (!useEngineServer) return;
  const ws = getEngineWs();
  ws.subscribe([...BROAD_TOPICS]);
}

/**
 * Subscribe to every `HoustonEvent` emitted by the backend.
 *
 * Over the engine path the caller still needs to request agent- and
 * session-scoped topics via [`subscribeAgentTopics`] / [`subscribeSession`] —
 * broad (non-scoped) topics are subscribed automatically on first call.
 */
export function subscribeHoustonEvents(handler: (ev: HoustonEvent) => void): Unsub {
  if (useEngineServer) {
    ensureBroadSubscription();
    const ws = getEngineWs();
    return ws.onEvent(toHandler(handler));
  }
  let off: Unsub | undefined;
  legacyListen<HoustonEvent>("houston-event", (ev) => handler(ev.payload))
    .then((fn) => {
      off = fn;
    })
    .catch(() => {});
  return () => {
    off?.();
  };
}

/**
 * Subscribe to the agent-scoped topics (`agent:<path>`, `routines:<path>`).
 *
 * No-op on the Tauri path — `listen("houston-event", ...)` already gets
 * every event globally.
 */
export function subscribeAgentTopics(agentPath: string): Unsub {
  if (!useEngineServer) return () => {};
  const ws = getEngineWs();
  const t = [topics.agent(agentPath), topics.routines(agentPath)];
  ws.subscribe(t);
  return () => ws.unsubscribe(t);
}

/** Subscribe to a single session topic (`session:<key>`). */
export function subscribeSession(sessionKey: string): Unsub {
  if (!useEngineServer) return () => {};
  const ws = getEngineWs();
  const t = [topics.session(sessionKey)];
  ws.subscribe(t);
  return () => ws.unsubscribe(t);
}

/**
 * Listen to a raw Tauri event. Use for events that have no engine counterpart:
 * - `app-activated` (OS window resume)
 * - `sync-connection` (internal desktop-local dispatch by `useSyncResponder`)
 */
export function listenOsEvent<T>(event: string, handler: (ev: T) => void): Unsub {
  let off: Unsub | undefined;
  legacyListen<T>(event, (tauriEv) => handler(tauriEv.payload))
    .then((fn) => {
      off = fn;
    })
    .catch(() => {});
  return () => {
    off?.();
  };
}

/** Re-export `legacyEmit` so callers don't need to reach into os-bridge. */
export function emitOsEvent(event: string, payload?: unknown): Promise<void> {
  return legacyEmit(event, payload);
}
