import type { Env, StoreListing } from "./types";

interface AgentRow {
  id: string;
  repo: string;
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string;
  icon_url: string;
  config_json: string;
  installs: number;
  registered_at: string;
}

function rowToListing(row: AgentRow): StoreListing {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    author: row.author,
    tags: JSON.parse(row.tags),
    icon_url: row.icon_url,
    repo: row.repo,
    installs: row.installs,
    registered_at: row.registered_at,
  };
}

export async function getAllAgents(db: Env["DB"]): Promise<StoreListing[]> {
  const { results } = await db
    .prepare("SELECT * FROM agents ORDER BY installs DESC")
    .all<AgentRow>();
  return results.map(rowToListing);
}

export async function searchAgents(
  db: Env["DB"],
  query: string
): Promise<StoreListing[]> {
  const pattern = `%${query}%`;
  const { results } = await db
    .prepare(
      "SELECT * FROM agents WHERE name LIKE ?1 OR description LIKE ?1 OR tags LIKE ?1 ORDER BY installs DESC"
    )
    .bind(pattern)
    .all<AgentRow>();
  return results.map(rowToListing);
}

export async function insertAgent(
  db: Env["DB"],
  agent: {
    id: string;
    repo: string;
    name: string;
    description: string;
    category: string;
    author: string;
    tags: string[];
    icon_url: string;
    config_json: string;
  }
): Promise<StoreListing> {
  const registeredAt = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO agents (id, repo, name, description, category, author, tags, icon_url, config_json, installs, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
    )
    .bind(
      agent.id,
      agent.repo,
      agent.name,
      agent.description,
      agent.category,
      agent.author,
      JSON.stringify(agent.tags),
      agent.icon_url,
      agent.config_json,
      registeredAt
    )
    .run();

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    author: agent.author,
    tags: agent.tags,
    icon_url: agent.icon_url,
    repo: agent.repo,
    installs: 0,
    registered_at: registeredAt,
  };
}

export async function incrementInstalls(
  db: Env["DB"],
  id: string
): Promise<number | null> {
  await db
    .prepare("UPDATE agents SET installs = installs + 1 WHERE id = ?")
    .bind(id)
    .run();

  const row = await db
    .prepare("SELECT installs FROM agents WHERE id = ?")
    .bind(id)
    .first<{ installs: number }>();

  return row ? row.installs : null;
}
