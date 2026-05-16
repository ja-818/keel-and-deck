const TOOLKIT_DISPLAY: Record<string, string> = {
  GMAIL: "Gmail",
  GOOGLECALENDAR: "Google Calendar",
  GOOGLESHEETS: "Google Sheets",
  GOOGLEDOCS: "Google Docs",
  GOOGLEDRIVE: "Google Drive",
  SLACK: "Slack",
  NOTION: "Notion",
  GITHUB: "GitHub",
  JIRA: "Jira",
  TRELLO: "Trello",
  ASANA: "Asana",
  HUBSPOT: "HubSpot",
  SALESFORCE: "Salesforce",
  SHOPIFY: "Shopify",
  STRIPE: "Stripe",
  TWITTER: "Twitter",
  LINKEDIN: "LinkedIn",
  DISCORD: "Discord",
  AIRTABLE: "Airtable",
  EXCEL: "Microsoft Excel",
};

export function toolkitDisplayName(toolkit: string): string {
  return TOOLKIT_DISPLAY[toolkit.toUpperCase()] ?? toolkit;
}

export function normalizeToolkitSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function normalizeToolkitSlugs(slugs: string[]): string[] {
  return Array.from(
    new Set(
      slugs
        .map(normalizeToolkitSlug)
        .filter((slug) => slug.length > 0),
    ),
  ).sort();
}
