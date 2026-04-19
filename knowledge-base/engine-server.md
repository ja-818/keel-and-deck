# Houston Engine Server — Operator Guide

`houston-engine` is the binary that speaks `knowledge-base/engine-protocol.md`.
Everything Houston can do on a laptop it can do on a VPS — the desktop app
spawns this binary as a subprocess and talks to it the same way a remote
client would.

## Binary

- Crate: `engine/houston-engine-server`
- Bin target: `houston-engine`
- Build: `cargo build --release -p houston-engine-server --bin houston-engine`

## Runtime config

All via environment variables.

| Var | Default | Purpose |
|---|---|---|
| `HOUSTON_BIND` | `127.0.0.1:0` | `ip:port`. Random local port by default. |
| `HOUSTON_BIND_ALL` | unset | Must be `1` to bind `0.0.0.0`. Safety net against accidental public exposure. |
| `HOUSTON_ENGINE_TOKEN` | auto | Bearer token clients must send. 48-char alphanumeric if unset. |
| `HOUSTON_HOME` | `~/.houston` | DB, logs, `engine.json`. |
| `HOUSTON_DOCS` | `~/Documents/Houston` | Workspace filesystem root. |
| `RUST_LOG` | `info,houston=debug` | `tracing` filter. |

## Startup handshake

On bind the binary:

1. Writes `$HOUSTON_HOME/engine.json` (chmod 0600) with:
   ```json
   {
     "version": "0.4.0",
     "protocol": 1,
     "port": 53871,
     "pid": 84721,
     "token_hash": "<sha256 of token>"
   }
   ```
2. Emits one line to **stdout**:
   ```
   HOUSTON_ENGINE_LISTENING port=53871 token=<full-token>
   ```

The desktop supervisor (`app/src-tauri/src/engine_supervisor.rs`) parses
that line to bootstrap the webview. Do **not** log the token anywhere
else.

## Process model

- Single process, tokio multi-threaded runtime.
- `axum` 0.7 with `ws` feature.
- `BroadcastEventSink` fanout capacity: 1024.
- WS heartbeat: 20s ping, 45s dead-conn timeout (configurable, Phase 2).
- Graceful shutdown: `SIGTERM`/`SIGINT` → drain in-flight requests → exit.

## Supervision (desktop)

`engine_supervisor.rs` spawns the binary with:

- **macOS/Linux:** `setpgid(0,0)` so the child gets its own process group.
  Parent drop kills `-pgrp`.
- **Linux:** `prctl(PR_SET_PDEATHSIG, SIGKILL)` (Phase 4 task).
- **Windows:** Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`
  (Phase 4 task).

Restart policy: exponential backoff 500ms → 30s cap on child crash.

## Deployment modes

| Mode | Bind | Auth source | Supervisor |
|---|---|---|---|
| Local (desktop) | `127.0.0.1:0` | stdout banner | Tauri `setup()` |
| Always On (VPS) | `0.0.0.0:7777` behind TLS proxy | `.env` file | systemd / docker |
| Teams (multi-tenant) | fronted by proxy | per-tenant secret | k8s / nomad (future) |

See `always-on/README.md` for the VPS path.

## Health monitoring

- `GET /v1/health` → 200 with JSON body.
- `GET /v1/version` → build + semver.
- `tracing` spans every request with method, path, status, duration.
- Prometheus exporter: planned for Phase 6.

## Rolling upgrades

1. Pull new binary.
2. `systemctl restart houston-engine` (or `docker compose up -d`).
3. Clients with open WS reconnect automatically (exponential backoff in
   `@houston-ai/engine-client`).
4. Major protocol bump → clients get 426 Upgrade Required (Phase 2 task).

## Troubleshooting

- **Bind refused** → another instance or port in use. Check `engine.json`.
- **401 everywhere** → stale token. Delete `engine.json` and restart.
- **WS disconnects every 20s** → proxy killing idle conns; extend
  upstream timeout past 30s.
- **Desktop never launches** → supervisor did not see banner in 5s. Check
  child stderr; binary missing from sidecar bundle?
