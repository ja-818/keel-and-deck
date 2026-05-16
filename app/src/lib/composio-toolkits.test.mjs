import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeToolkitSlug,
  normalizeToolkitSlugs,
  toolkitDisplayName,
} from "./composio-toolkits.ts";

test("normalizes toolkit slugs for query matching", () => {
  assert.equal(normalizeToolkitSlug(" POSTHOG "), "posthog");
});

test("dedupes and sorts connected toolkit slugs", () => {
  assert.deepEqual(
    normalizeToolkitSlugs(["GMAIL", "posthog", "gmail", "", " PostHog "]),
    ["gmail", "posthog"],
  );
});

test("toolkitDisplayName returns human name for known toolkit", () => {
  assert.equal(toolkitDisplayName("GMAIL"), "Gmail");
  assert.equal(toolkitDisplayName("EXCEL"), "Microsoft Excel");
  assert.equal(toolkitDisplayName("GOOGLECALENDAR"), "Google Calendar");
});

test("toolkitDisplayName is case-insensitive", () => {
  assert.equal(toolkitDisplayName("gmail"), "Gmail");
  assert.equal(toolkitDisplayName("Slack"), "Slack");
});

test("toolkitDisplayName falls back to original string for unknown toolkit", () => {
  assert.equal(toolkitDisplayName("UNKNOWNTOOL"), "UNKNOWNTOOL");
  assert.equal(toolkitDisplayName("my-custom-app"), "my-custom-app");
});
