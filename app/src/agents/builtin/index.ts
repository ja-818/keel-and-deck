import { blankAgent } from "./default-experience";
import { generatedCustomAgent } from "./generated-custom";
import { personalAssistantAgent } from "./personal-assistant";
import type { AgentConfig } from "../../lib/types";

export const builtinConfigs: AgentConfig[] = [
  personalAssistantAgent,
  generatedCustomAgent,
  blankAgent,
];
