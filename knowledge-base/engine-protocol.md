# Houston Engine — Wire Protocol

Source of truth for the HTTP + WebSocket contract spoken by `houston-engine`
and every client (desktop, mobile, CLI, third-party). Rust types live in
`engine/houston-engine-protocol`; TS types live in
`ui/engine-client/src/types.ts`. The Rust side wins conflicts.

## Versioning

| Field | Value |
|---|---|
| Protocol major | `1` (constant `PROTOCOL_VERSION`) |
| Engine version | crate `houston-engine-server` version |
| Version header | `X-Houston-Engine-Version: <semver>` on every response |
| Breaking changes | require protocol major bump + client version guard |

Clients refuse to talk to an engine whose major `v` exceeds what they know.

## Transport

- **HTTP** under `/v1/*` — resource-oriented REST. `Content-Type: application/json`.
- **WebSocket** at `/v1/ws` — server-push events + lightweight client requests.

Loopback deploys bind `127.0.0.1:<random>`; remote deploys must opt in via
`HOUSTON_BIND_ALL=1`.

## Auth

Bearer token. Three accepted locations (server checks all):

- `Authorization: Bearer <token>` — required for REST, preferred for WS in native clients.
- `?token=<token>` — convenience for CLIs and browsers that cannot set WS headers.
- `Sec-WebSocket-Protocol: houston-bearer.<token>` — fallback for browser WS.

Token generation: the binary auto-generates a 48-char alphanumeric token on
first run unless `HOUSTON_ENGINE_TOKEN` is set. It is written (mode 0600) to
`~/.houston/engine.json`. The desktop supervisor reads that file before
injecting `window.__HOUSTON_ENGINE__`.

## REST conventions

- Plural nouns: `/v1/workspaces`, `/v1/agents/{path}/sessions`.
- Non-CRUD actions as sub-resource POSTs: `POST /v1/agents/{p}/sessions/{k}:cancel`.
- Path IDs always URL-encoded.

### Error body

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "workspace 7f3e... not found",
    "details": null
  }
}
```

`code` is a fixed enum: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`BAD_REQUEST`, `CONFLICT`, `INTERNAL`, `UNAVAILABLE`, `VERSION_MISMATCH`.
HTTP status maps 1:1 (see `engine-server/src/routes/error.rs`).

### Current routes (Phase 2 in progress)

| Method | Path | Description |
|---|---|---|
| GET | `/v1/health` | `{status, version, protocol}` |
| GET | `/v1/version` | `{engine, protocol, build}` |
| GET | `/v1/ws` | WebSocket upgrade |
| GET | `/v1/workspaces` | List workspaces |
| POST | `/v1/workspaces` | Create workspace |
| DELETE | `/v1/workspaces/:id` | Delete workspace |
| POST | `/v1/workspaces/:id/rename` | Rename workspace |
| PATCH | `/v1/workspaces/:id/provider` | Set AI provider/model |

Remaining slices (agents, conversations, agent files, sessions, skills,
provider/prefs, store, routines, composio, sync) migrate in-order; each PR
adds routes + integration test + TS client method together.

## WebSocket envelope

Every WS frame is an `EngineEnvelope`:

```json
{
  "v": 1,
  "id": "b6e1c7d3-...",
  "kind": "event | req | res | ping | pong",
  "ts": 1712345678901,
  "payload": { ... }
}
```

- `kind: "event"` → `payload` is a `HoustonEvent` (same enum the frontend already consumes) or a `LagMarker` (`{type:"Lag", dropped: N}`).
- `kind: "req"` → client request. Currently `{op:"sub"|"unsub", topics:[...]}`. Phase 2 adds per-topic filtering; Phase 1 accepts the op but ignores filtering.
- `kind: "res"` → server response to a prior `req` (future use).
- `kind: "ping" | "pong"` → keep-alive. Server emits a `ping` every 20s.

### Backpressure

Per-connection bounded `mpsc` with capacity 1024. On lag the server:

1. Coalesces consecutive `SessionStatus` and low-severity `FeedItem` updates.
2. Sends a `LagMarker` so the client knows to refetch.
3. Continues streaming once drained.

### Topics (Phase 2+)

Reserved topic names. Subscribing with no topics = receive all (current
Phase 1 behavior).

| Topic | Payload variants |
|---|---|
| `session:{key}` | `FeedItem`, `SessionStatus`, `AuthRequired` |
| `routines:{agent}` | `RoutinesChanged`, `RoutineRunsChanged` |
| `composio` | `ComposioCliReady`, `ComposioCliFailed` |
| `scheduler` | future |
| `toast` | `FeedItem` where severity >= warning |

## Auditing conformance

- `engine/houston-engine-server/tests/` — in-process HTTP + WS assertions.
- `ui/engine-client/src/types.ts` — mirrors the Rust DTOs by hand until a
  codegen tool (`ts-rs` or `specta`) is adopted. CI should fail if shapes
  drift.
