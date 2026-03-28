export interface Connection {
  toolkit: string;
  display_name: string;
  description: string;
  email: string | null;
  logo_url: string;
  connected_at: string | null;
}

export type ConnectionsResult =
  | { status: "not_configured" }
  | { status: "needs_auth" }
  | { status: "error"; message: string }
  | { status: "ok"; connections: Connection[] };
