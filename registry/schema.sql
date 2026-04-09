CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT '',
  author TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  icon_url TEXT DEFAULT '',
  config_json TEXT NOT NULL,
  installs INTEGER DEFAULT 0,
  registered_at TEXT NOT NULL
);
