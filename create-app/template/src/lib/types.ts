/** Project from keel-db */
export interface Project {
  id: string;
  name: string;
  folder_path: string;
  created_at: string;
  updated_at: string;
}

/** Events emitted from the Rust backend via keel-tauri */
export type KeelEvent =
  | {
      type: "FeedItem";
      data: { session_key: string; item: import("@deck-ui/chat").FeedItem };
    }
  | {
      type: "SessionStatus";
      data: { session_key: string; status: string; error: string | null };
    }
  | {
      type: "Toast";
      data: { message: string; variant: string };
    };
