export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  subtitle: string;
  cliName: string;
  installUrl: string;
  loginCommand: string;
  cost: string;
  models: readonly ModelOption[];
  defaultModel: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    subtitle: "Codex",
    cliName: "codex",
    installUrl: "https://github.com/openai/codex",
    loginCommand: "codex login",
    cost: "Your ChatGPT subscription",
    // `gpt-5.5-codex` is the default — it is tuned for the agent / tool-use
    // workload Houston actually runs (the tutorial reads calendar + mail,
    // drafts emails, edits files, etc.) and is the model the codex CLI was
    // built around. The vanilla `gpt-5.5` stays available for users who
    // want it for chat-style tasks where coding-tuned behavior is less
    // helpful, but the picker (and the tutorial via `defaultModel`)
    // start on codex.
    models: [
      {
        id: "gpt-5.5-codex",
        label: "GPT-5.5 Codex",
        description: "Tuned for coding and agent tool use. Best for Houston's tutorial flow.",
      },
      {
        id: "gpt-5.5",
        label: "GPT-5.5",
        description: "Flagship general model. Best for plain chat and reasoning.",
      },
    ],
    defaultModel: "gpt-5.5-codex",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    subtitle: "Claude Code",
    cliName: "claude",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    loginCommand: "claude login",
    cost: "Your Claude subscription",
    models: [
      { id: "sonnet", label: "Sonnet", description: "Best balance of speed and quality." },
      { id: "opus", label: "Opus", description: "Most capable. Slower, more tokens." },
    ],
    defaultModel: "sonnet",
  },
] as const;

/** Find a provider by id. */
export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Find the model object for a provider + model id. */
export function getModel(providerId: string, modelId: string): ModelOption | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

/** Get the default provider + model for a provider id. */
export function getDefaultModel(providerId: string): string {
  return getProvider(providerId)?.defaultModel ?? "sonnet";
}

export interface ComingSoonProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly mark: string;
}

export const COMING_SOON_PROVIDERS: readonly ComingSoonProviderInfo[] = [
  { id: "gemini", name: "Google", subtitle: "Gemini CLI", mark: "G" },
  { id: "subq", name: "SubQ", subtitle: "SubQ Code", mark: "SQ" },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek Coder", mark: "DS" },
  { id: "minimax", name: "MiniMax", subtitle: "M2", mark: "MM" },
] as const;
