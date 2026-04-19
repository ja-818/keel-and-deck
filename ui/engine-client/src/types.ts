/**
 * Wire types mirroring `engine/houston-engine-protocol/src/lib.rs`.
 *
 * Until we wire up a Rust→TS code generator (`ts-rs` or `specta`) these
 * are maintained by hand. Keep them in sync — the Rust side is the
 * source of truth.
 */

export const PROTOCOL_VERSION = 1 as const;

export type EnvelopeKind = "event" | "req" | "res" | "ping" | "pong";

export interface EngineEnvelope<P = unknown> {
  v: number;
  id: string;
  kind: EnvelopeKind;
  ts: number;
  payload: P;
}

export type ClientRequest =
  | { op: "sub"; topics: string[] }
  | { op: "unsub"; topics: string[] };

export interface LagMarker {
  type: "Lag";
  dropped: number;
}

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "VERSION_MISMATCH";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
  protocol: number;
}

export interface VersionResponse {
  engine: string;
  protocol: number;
  build: string | null;
}

// ---------- Domain types (mirrors engine-core) ----------

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  provider?: string;
  model?: string;
}

export interface CreateWorkspace {
  name: string;
  provider?: string;
  model?: string;
}

export interface RenameWorkspace {
  newName: string;
}

export interface UpdateProvider {
  provider: string;
  model?: string;
}
