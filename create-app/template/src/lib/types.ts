/** Project from keel-db */
export interface Project {
  id: string;
  name: string;
  folder_path: string;
  created_at: string;
  updated_at: string;
}

/** Issue (kanban card) from keel-db */
export interface Issue {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  tags: string | null;
  position: number;
  session_id: string | null;
  claude_session_id: string | null;
  output_files: string | null;
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
      type: "IssueStatusChanged";
      data: { issue_id: string; status: string };
    }
  | {
      type: "IssuesChanged";
      data: { project_id: string };
    }
  | {
      type: "Toast";
      data: { message: string; variant: string };
    }
  | {
      type: "AuthRequired";
      data: { message: string };
    }
  | {
      type: "CompletionToast";
      data: { title: string; issue_id: string | null };
    };
