import type { HoustonConfig } from "./types";

const RAW_BASE = "https://raw.githubusercontent.com";

export async function fetchHoustonConfig(
  repo: string
): Promise<HoustonConfig> {
  const url = `${RAW_BASE}/${repo}/main/houston.json`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch houston.json from ${repo} (${res.status})`
    );
  }

  const config = (await res.json()) as HoustonConfig;

  const missing: string[] = [];
  if (!config.id) missing.push("id");
  if (!config.name) missing.push("name");
  if (!config.description) missing.push("description");
  if (!config.tabs || !Array.isArray(config.tabs) || config.tabs.length === 0) {
    missing.push("tabs");
  }

  if (missing.length > 0) {
    throw new Error(
      `houston.json missing required fields: ${missing.join(", ")}`
    );
  }

  return config;
}

export async function checkIconExists(repo: string): Promise<boolean> {
  const url = `${RAW_BASE}/${repo}/main/icon.png`;
  const res = await fetch(url, { method: "HEAD" });
  return res.ok;
}

export function buildIconUrl(repo: string): string {
  return `${RAW_BASE}/${repo}/main/icon.png`;
}
