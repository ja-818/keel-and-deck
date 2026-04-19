/**
 * Managed WebSocket with auto-reconnect and typed event handlers.
 *
 * Usage:
 * ```ts
 * const ws = new EngineWebSocket(client);
 * const unsubscribe = ws.on("event", (env) => { ... });
 * ws.connect();
 * ```
 */

import type { EngineEnvelope } from "./types";
import type { HoustonClient } from "./client";

type Handler = (env: EngineEnvelope) => void;

export class EngineWebSocket {
  private socket: WebSocket | null = null;
  private handlers: Set<Handler> = new Set();
  private reconnectAttempts = 0;
  private shouldRun = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private client: HoustonClient) {}

  connect(): void {
    this.shouldRun = true;
    this.open();
  }

  disconnect(): void {
    this.shouldRun = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  /** Register a handler. Returns an unsubscribe function. */
  on(_: "event", handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(envelope: EngineEnvelope): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(envelope));
    }
  }

  subscribe(topics: string[]): void {
    this.send({
      v: 1,
      id: crypto.randomUUID(),
      kind: "req",
      ts: Date.now(),
      payload: { op: "sub", topics },
    });
  }

  private open(): void {
    const ws = new WebSocket(this.client.wsUrl());
    this.socket = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    ws.onmessage = (ev) => {
      try {
        const env = JSON.parse(ev.data) as EngineEnvelope;
        for (const h of this.handlers) h(env);
      } catch {
        // Ignore malformed frames.
      }
    };

    ws.onclose = () => {
      if (!this.shouldRun) return;
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempts);
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }
}
