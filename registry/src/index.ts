import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { getAllAgents, searchAgents, insertAgent, incrementInstalls } from "./db";
import { fetchHoustonConfig, checkIconExists, buildIconUrl } from "./github";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.get("/api/catalog", async (c) => {
  const agents = await getAllAgents(c.env.DB);
  return c.json({ agents });
});

app.get("/api/search", async (c) => {
  const query = c.req.query("q") ?? "";
  if (!query.trim()) {
    const agents = await getAllAgents(c.env.DB);
    return c.json({ agents, query });
  }
  const agents = await searchAgents(c.env.DB, query);
  return c.json({ agents, query });
});

app.post("/api/register", async (c) => {
  let body: { repo?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const repo = body.repo?.trim();
  if (!repo || !repo.includes("/")) {
    return c.json({ error: 'Missing or invalid "repo" field (expected "owner/repo")' }, 400);
  }

  let config;
  try {
    config = await fetchHoustonConfig(repo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch houston.json";
    return c.json({ error: message }, 400);
  }

  const hasIcon = await checkIconExists(repo);
  const iconUrl = hasIcon ? buildIconUrl(repo) : "";

  try {
    const listing = await insertAgent(c.env.DB, {
      id: config.id,
      repo,
      name: config.name,
      description: config.description,
      category: config.category ?? "",
      author: config.author ?? "",
      tags: config.tags ?? [],
      icon_url: iconUrl,
      config_json: JSON.stringify(config),
    });
    return c.json(listing, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    if (message.includes("UNIQUE")) {
      return c.json({ error: "Agent already registered (duplicate id or repo)" }, 409);
    }
    return c.json({ error: message }, 500);
  }
});

app.post("/api/agents/:id/install", async (c) => {
  const id = c.req.param("id");
  const installs = await incrementInstalls(c.env.DB, id);

  if (installs === null) {
    return c.json({ error: "Agent not found" }, 404);
  }

  return c.json({ installs });
});

export default app;
