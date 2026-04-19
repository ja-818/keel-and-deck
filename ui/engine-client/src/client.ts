/**
 * `HoustonClient` — thin fetch wrapper keyed by `{baseUrl, token}`.
 *
 * Usage:
 * ```ts
 * const engine = new HoustonClient({ baseUrl: "http://127.0.0.1:7777", token });
 * const workspaces = await engine.listWorkspaces();
 * ```
 */

import type {
  CreateWorkspace,
  ErrorBody,
  HealthResponse,
  RenameWorkspace,
  UpdateProvider,
  VersionResponse,
  Workspace,
} from "./types";

export interface HoustonClientOptions {
  /** Engine base URL — e.g. `http://127.0.0.1:7777`. */
  baseUrl: string;
  /** Bearer token written to `~/.houston/engine.json` at startup. */
  token: string;
}

export class HoustonClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(opts: HoustonClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ErrorBody | null;
      throw new HoustonEngineError(res.status, err);
    }
    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  // ---------- Health / version ----------

  health(): Promise<HealthResponse> {
    return this.request("GET", "/health");
  }

  version(): Promise<VersionResponse> {
    return this.request("GET", "/version");
  }

  // ---------- Workspaces ----------

  listWorkspaces(): Promise<Workspace[]> {
    return this.request("GET", "/workspaces");
  }

  createWorkspace(req: CreateWorkspace): Promise<Workspace> {
    return this.request("POST", "/workspaces", req);
  }

  renameWorkspace(id: string, req: RenameWorkspace): Promise<Workspace> {
    return this.request("POST", `/workspaces/${encodeURIComponent(id)}/rename`, req);
  }

  deleteWorkspace(id: string): Promise<void> {
    return this.request("DELETE", `/workspaces/${encodeURIComponent(id)}`);
  }

  setWorkspaceProvider(id: string, req: UpdateProvider): Promise<Workspace> {
    return this.request(
      "PATCH",
      `/workspaces/${encodeURIComponent(id)}/provider`,
      req
    );
  }

  // ---------- WebSocket access (see ws.ts) ----------

  wsUrl(): string {
    const ws = this.baseUrl.replace(/^http/, "ws");
    return `${ws}/v1/ws?token=${encodeURIComponent(this.token)}`;
  }
}

export class HoustonEngineError extends Error {
  constructor(public status: number, public body: ErrorBody | null) {
    super(body?.error.message ?? `Engine error ${status}`);
    this.name = "HoustonEngineError";
  }

  get code(): string | undefined {
    return this.body?.error.code;
  }
}
