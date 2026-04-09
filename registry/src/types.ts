export interface StoreListing {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string[];
  icon_url: string;
  repo: string;
  installs: number;
  registered_at: string;
}

export interface HoustonConfig {
  id: string;
  name: string;
  description: string;
  category?: string;
  author?: string;
  tags?: string[];
  tabs: unknown[];
  [key: string]: unknown;
}

export interface Env {
  DB: D1Database;
}
