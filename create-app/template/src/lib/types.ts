export interface Agent {
  name: string;
  path: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  last_used: string | null;
}

export interface SkillDetail {
  name: string;
  description: string;
  version: number;
  content: string;
}

export interface CommunitySkillResult {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
}

export interface LearningsData {
  entries: { index: number; text: string }[];
  chars: number;
  limit: number;
}

/** A channel entry from .houston/channels.json (matches Rust ChannelEntry) */
export interface ChannelEntry {
  id: string;
  channel_type: string;
  name: string;
  token: string;
}

/** Events emitted from the Rust backend via houston-tauri */
export type HoustonEvent =
  | {
      type: "FeedItem";
      data: { session_key: string; item: import("@houston-ai/chat").FeedItem };
    }
  | {
      type: "SessionStatus";
      data: { session_key: string; status: string; error: string | null };
    }
  | {
      type: "Toast";
      data: { message: string; variant: string };
    };
