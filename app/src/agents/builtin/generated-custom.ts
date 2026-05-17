import type { AgentConfig } from "../../lib/types";

export const generatedCustomAgent: AgentConfig = {
  id: "generated-custom",
  name: "Generated agent",
  description: "A reusable agent created from a multi-agent workflow.",
  icon: "Bot",
  category: "productivity",
  author: "Houston",
  tags: ["generated", "custom", "delegation"],
  tabs: [
    { id: "activity", label: "Missions", builtIn: "board", badge: "activity" },
    { id: "job-description", label: "Job Description", builtIn: "job-description" },
    { id: "files", label: "Files", builtIn: "files" },
    { id: "integrations", label: "Integrations", builtIn: "integrations" },
  ],
  defaultTab: "activity",
  claudeMd: "",
};
