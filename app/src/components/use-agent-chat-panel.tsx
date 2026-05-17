/**
 * Per-agent chat panel hook.
 *
 * Centralises every agent-scoped concern that gets spread into AIBoard
 * so the per-agent BoardTab and the cross-agent Mission Control share
 * one implementation. Callers pass an `agent` (the conversation's
 * scope) and the hook returns ready-to-use AIBoard props:
 *
 *   - chatEmptyState      — featured-skill cards + "see more"
 *   - composerHeader      — selected Skill chip above the prompt input
 *   - footer              — model selector + "Skills" button
 *   - renderUserMessage   — decode + render skill-invocation card
 *   - tool / link helpers — file tool renderer, Composio link card
 *
 * The hook also owns the Skill submission pipeline (createMission
 * for new conversations, tauriChat.send for follow-ups) so we don't
 * duplicate the encoding + feed-push logic in two places.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@houston-ai/core";
import { Play } from "lucide-react";
import {
  decodeAttachmentMessage,
  UserAttachmentMessage,
  type UserAttachmentMessageLabels,
} from "@houston-ai/chat";

import { useFeedStore } from "../stores/feeds";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import {
  useActivity,
  useAllConversations,
  useConnectedToolkits,
  useConnections,
  useOrchestrationStatus,
  useSkills,
} from "../hooks/queries";
import {
  tauriActivity,
  tauriAttachments,
  tauriChat,
  tauriConfig,
  tauriShell,
  tauriWorktree,
  withAttachmentPaths,
} from "../lib/tauri";
import { createMission } from "../lib/create-mission";
import { queryKeys } from "../lib/query-keys";
import { humanizeSkillName } from "../lib/humanize-skill-name";
import { useFileToolRenderer } from "../hooks/use-file-tool-renderer";
import {
  ComposioLinkCard,
} from "./composio-link-card";
import {
  latestAssistantComposioToolkits,
  parseComposioToolkitFromHref,
} from "../lib/composio-links";
import { DispatchActions } from "./dispatch-actions";
import {
  ComposioSigninCard,
  isComposioSigninHref,
} from "./composio-signin-card";
import { ChatModelSelector } from "./chat-model-selector";
import { getDefaultModel } from "../lib/providers";
import { analytics } from "../lib/analytics";
import {
  buildSkillClaudePrompt,
  decodeSkillMessage,
  encodeSkillMessage,
} from "../lib/skill-message";
import { attachmentReferences } from "../lib/attachment-message";
import { SkillCard } from "./skill-card";
import { NewMissionPickerDialog } from "./new-mission-picker-dialog";
import { UserSkillMessage } from "./user-skill-message";
import { SelectedSkillChip } from "./selected-skill-chip";
import { ProviderReconnectCard } from "./shell/provider-reconnect-card";
import { ToolRuntimeErrorCard } from "./shell/tool-runtime-error-card";
import { isToolRuntimeErrorMessage } from "./tool-runtime-feed";
import { useChatDisplayLabels } from "./use-chat-display-labels";
import {
  extractDispatchLinks,
} from "../lib/dispatch-links";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "./tabs/provider-auth-feed";

import type { AIBoardProps } from "@houston-ai/board";
import type { ChatMessage, ChatPanelProps, FeedItem } from "@houston-ai/chat";
import type { Agent, AgentDefinition, SkillSummary } from "../lib/types";

const EMPTY_FEED_ITEMS: FeedItem[] = [];

interface UseAgentChatPanelArgs {
  /** The agent the panel is currently scoped to. Null disables features. */
  agent: Agent | null;
  /** That agent's catalog definition (for agentModes etc.). */
  agentDef: AgentDefinition | null;
  /** Currently-open session key, if any. Drives Skill routing. */
  selectedSessionKey: string | null;
  /** Called with the new conversation id after a Skill's "Start". */
  onSelectSession?: (id: string) => void;
}

interface AgentChatPanelProps {
  /** Renders skill cards + "see more" when no Skill is in flight. */
  chatEmptyState: AIBoardProps["chatEmptyState"];
  /** Selected Skill chip rendered above the prompt input. */
  composerHeader: AIBoardProps["composerHeader"];
  /** Submit can run the selected Skill without extra text. */
  canSendEmpty: AIBoardProps["canSendEmpty"];
  /** Intercepts composer submit while a Skill is selected. */
  onComposerSubmit: AIBoardProps["onComposerSubmit"];
  /** Composer footer with model selector + Skills button. */
  footer: AIBoardProps["footer"];
  /** Decodes skill-invocation user messages into a card. */
  renderUserMessage: AIBoardProps["renderUserMessage"];
  /** Forwarded to AIBoard / ChatPanel for tool rendering. */
  isSpecialTool: ChatPanelProps["isSpecialTool"];
  renderToolResult: ChatPanelProps["renderToolResult"];
  processLabels: ChatPanelProps["processLabels"];
  getThinkingMessage: ChatPanelProps["getThinkingMessage"];
  renderTurnSummary: ChatPanelProps["renderTurnSummary"];
  transformContent: ChatPanelProps["transformContent"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  mapFeedItems: AIBoardProps["mapFeedItems"];
  afterMessages: AIBoardProps["afterMessages"];
  /** Custom Composio inline-link rendering. */
  renderLink: AIBoardProps["renderLink"];
  /** Hidden picker dialog mounted in the consumer. */
  pickerDialog: ReactNode;
  /** Effective provider/model for sending. */
  effectiveProvider: string;
  effectiveModel: string;
  /** Per-chat overrides chosen via the model selector. */
  chatProvider: string | null;
  chatModel: string | null;
}

export function useAgentChatPanel({
  agent,
  agentDef,
  selectedSessionKey,
  onSelectSession,
}: UseAgentChatPanelArgs): AgentChatPanelProps {
  const { t } = useTranslation(["board", "chat"]);
  const { t: tIntegrations } = useTranslation("integrations");
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const path = agent?.folderPath ?? null;
  const agentModes = agentDef?.config.agents;
  const feedItems = useFeedStore((s) => {
    if (!path || !selectedSessionKey) return EMPTY_FEED_ITEMS;
    return s.items[path]?.[selectedSessionKey] ?? EMPTY_FEED_ITEMS;
  });
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);

  // ── Workspace / agent / activity tier model resolution ─────────────────
  const workspace = useWorkspaceStore((s) => s.current);
  const workspaceId = workspace?.id ?? null;
  const agents = useAgentStore((s) => s.agents);
  const agentPaths = useMemo(() => agents.map((item) => item.folderPath), [agents]);
  const { data: allConversations } = useAllConversations(agentPaths);
  const { data: orchestrationStatus } = useOrchestrationStatus(
    path ?? undefined,
    selectedSessionKey ?? undefined,
  );
  const delegatedCount = useMemo(
    () =>
      (allConversations ?? []).filter(
        (conversation) =>
          conversation.orchestration_parent_agent_path === path &&
          conversation.orchestration_parent_session_key === selectedSessionKey,
      ).length,
    [allConversations, path, selectedSessionKey],
  );
  const wsProvider = workspace?.provider ?? "anthropic";
  const wsModel = workspace?.model ?? getDefaultModel(wsProvider);
  const [agentProvider, setAgentProvider] = useState<string | null>(null);
  const [agentModel, setAgentModel] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setAgentProvider(null);
      setAgentModel(null);
      return;
    }
    tauriConfig
      .read(path)
      .then((cfg) => {
        setAgentProvider((cfg.provider as string) ?? null);
        setAgentModel((cfg.model as string) ?? null);
      })
      .catch(() => {});
  }, [path]);

  const { data: activities } = useActivity(path ?? undefined);
  const selectedActivity = useMemo(() => {
    if (!selectedSessionKey || !activities) return null;
    return activities.find(
      (a) => (a.session_key ?? `activity-${a.id}`) === selectedSessionKey,
    ) ?? null;
  }, [activities, selectedSessionKey]);
  const activityProvider = selectedActivity?.provider ?? null;
  const activityModel = selectedActivity?.model ?? null;
  const selectedActivityId = selectedActivity?.id ?? null;

  const [chatProvider, setChatProvider] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState<string | null>(null);
  useEffect(() => {
    setChatProvider(null);
    setChatModel(null);
  }, [selectedSessionKey]);
  const effectiveProvider = chatProvider ?? activityProvider ?? agentProvider ?? wsProvider;
  const effectiveModel = chatModel ?? activityModel ?? agentModel ?? wsModel;
  const handleModelSelect = useCallback(
    (prov: string, mod: string) => {
      setChatProvider(prov);
      setChatModel(mod);
      if (!path || !selectedActivityId) return;
      tauriActivity.update(path, selectedActivityId, {
        provider: prov,
        model: mod,
      }).catch((err) => {
        addToast({
          title: t("chat:errors.modelPersistFailed"),
          description: String(err),
          variant: "error",
        });
      });
    },
    [path, selectedActivityId, addToast, t],
  );

  // ── Composio link card support ────────────────────────────────────────
  const { data: composioStatus } = useConnections();
  const isSignedIn = composioStatus?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );
  const latestComposioToolkits = useMemo(
    () => latestAssistantComposioToolkits(feedItems),
    [feedItems],
  );
  const pendingComposioRef = useRef<Set<string>>(new Set());
  const continuedComposioRef = useRef<string | null>(null);
  const handleComposioConnectStarted = useCallback((toolkit: string) => {
    pendingComposioRef.current.add(toolkit);
    continuedComposioRef.current = null;
  }, []);
  const sendComposioContinuation = useCallback(
    (text: string) => {
      if (!path || !selectedSessionKey) return;
      tauriChat
        .send(path, text, selectedSessionKey, {
          providerOverride: chatProvider ?? undefined,
          modelOverride: chatModel ?? undefined,
          visibleUserMessage: false,
        })
        .catch((err) => {
          addToast({
            title: t("chat:errors.sessionStart", { error: String(err) }),
            variant: "error",
          });
        });
    },
    [
      addToast,
      chatModel,
      chatProvider,
      path,
      selectedSessionKey,
      t,
    ],
  );
  const handleComposioSignInComplete = useCallback(() => {
    sendComposioContinuation(tIntegrations("continueAfterComposioSignIn"));
  }, [sendComposioContinuation, tIntegrations]);
  useEffect(() => {
    if (!path || !selectedSessionKey) return;
    if (latestComposioToolkits.length === 0) return;
    const pending = pendingComposioRef.current;
    if (!latestComposioToolkits.some((toolkit) => pending.has(toolkit))) return;
    if (!latestComposioToolkits.every((toolkit) => connectedSet.has(toolkit))) return;

    const key = latestComposioToolkits.slice().sort().join(",");
    if (continuedComposioRef.current === key) return;
    continuedComposioRef.current = key;
    pending.clear();
    const text = tIntegrations("continueAfterConnected", { toolkits: key });
    sendComposioContinuation(text);
  }, [
    connectedSet,
    latestComposioToolkits,
    path,
    sendComposioContinuation,
    selectedSessionKey,
    tIntegrations,
  ]);
  const renderLink = useCallback(
    ({ href, onOpen }: { href: string; onOpen: () => void }) => {
      if (isComposioSigninHref(href)) {
        return <ComposioSigninCard onSignInComplete={handleComposioSignInComplete} />;
      }
      const toolkit = parseComposioToolkitFromHref(href);
      if (toolkit) {
        return (
          <ComposioLinkCard
            toolkit={toolkit}
            isConnected={connectedSet.has(toolkit)}
            onOpen={onOpen}
            onConnectStarted={handleComposioConnectStarted}
          />
        );
      }
      return undefined;
    },
    [
      connectedSet,
      handleComposioConnectStarted,
      handleComposioSignInComplete,
      path,
      selectedSessionKey,
      workspaceId,
    ],
  );
  const transformContent = useCallback(
    (
      content: string,
      meta: { isLatestAssistantMessage: boolean; messageKey: string },
    ) => {
      if (!path || !selectedSessionKey) return { content };
      const dispatch = extractDispatchLinks(content);
      return {
        content: dispatch.content,
        extra: (
          <DispatchActions
            dispatch={dispatch}
            workspaceId={workspaceId}
            parentAgentPath={path}
            parentSessionKey={selectedSessionKey}
            orchestration={orchestrationStatus}
            delegatedCount={delegatedCount}
            allowAutoRun={meta.isLatestAssistantMessage}
            dispatchMessageKey={meta.messageKey}
            onRejectCreate={(text) => {
              void tauriChat.send(path, text, selectedSessionKey, {
                providerOverride: chatProvider ?? undefined,
                modelOverride: chatModel ?? undefined,
              });
            }}
          />
        ),
      };
    },
    [
      chatModel,
      chatProvider,
      delegatedCount,
      orchestrationStatus,
      path,
      selectedSessionKey,
      workspaceId,
    ],
  );

  // ── File-tool rendering (per-agent path) ──────────────────────────────
  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(path ?? "");

  // ── Skills + selected-skill state ─────────────────────────────────────
  const { data: allSkills } = useSkills(path ?? undefined);
  const emptySkillShowcase = useMemo(() => {
    const skills = allSkills ?? [];
    const featured = skills.filter((s) => s.featured);
    return (featured.length > 0 ? featured : skills).slice(0, 3);
  }, [allSkills]);
  const moreSkillsCount = Math.max(
    0,
    (allSkills?.length ?? 0) - emptySkillShowcase.length,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSkill, setActiveSkill] = useState<SkillSummary | null>(null);
  // Drop selected Skill when the agent / session changes so it doesn't
  // leak across contexts.
  useEffect(() => {
    setActiveSkill(null);
  }, [path, selectedSessionKey]);

  const onSelectSessionRef = useRef(onSelectSession);
  useEffect(() => {
    onSelectSessionRef.current = onSelectSession;
  }, [onSelectSession]);

  const attachmentLabels = useMemo<UserAttachmentMessageLabels>(
    () => ({
      attachmentCount: (count) => t("attachmentMessage.count", { count }),
    }),
    [t],
  );

  // While a Skill is selected, the regular composer still owns text
  // and attachments. This hook only wraps the submitted message with the
  // hidden Skill marker + deterministic "Use the X skill" prompt.
  const handleSkillComposerSubmit = useCallback<NonNullable<AIBoardProps["onComposerSubmit"]>>(
    async ({ sessionKey, text, files }) => {
      const skill = activeSkill;
      if (!skill || !agent || !path) return false;

      const claudePrompt = buildSkillClaudePrompt(skill, text);
      const encoded = encodeSkillMessage(skill, text, claudePrompt);
      const friendlyTitle = humanizeSkillName(skill.name);

      if (sessionKey) {
        // Mid-conversation: optimistic feed push + send, mirrors the
        // text-send pipeline.
        const scopeId = sessionKey;
        const attachmentPaths = await tauriAttachments.save(scopeId, files);
        const prompt = withAttachmentPaths(claudePrompt, attachmentPaths);
        const encodedWithAttachments = encodeSkillMessage(
          skill,
          text,
          prompt,
          attachmentReferences(files, attachmentPaths),
        );
        const mode = agentModes?.find((m) => m.id === undefined); // default mode
        await tauriChat.send(path, encodedWithAttachments, sessionKey, {
          mode: mode?.promptFile,
          providerOverride: chatProvider ?? undefined,
          modelOverride: chatModel ?? undefined,
        });
        pushFeedItem(path, sessionKey, {
          feed_type: "user_message",
          data: encodedWithAttachments,
        });
      } else {
        // New conversation: createMission with `title` override so the
        // kanban card reads "Research a company" instead of the marker.
        const agentMode = agentModes?.[0]?.id;
        const mode = agentModes?.find((m) => m.id === agentMode);
        let encodedUserMessage = encoded;

        // Honour worktree mode if the agent's config opts in. Same
        // bootstrap as BoardTab's text-send path.
        let worktreePath: string | undefined;
        try {
          const cfg = await tauriConfig.read(path);
          if (cfg.worktreeMode) {
            const slug = crypto.randomUUID().slice(0, 8);
            const wt = await tauriWorktree.create(path, slug);
            worktreePath = wt.path;
            const installCmd = cfg.installCommand as string | undefined;
            if (installCmd && worktreePath) {
              tauriShell.run(worktreePath, installCmd).catch(console.error);
            }
          }
        } catch {
          /* config may not exist yet */
        }

        const { conversationId, sessionKey } = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: path,
          },
          encoded,
          {
            agentMode,
            worktreePath,
            promptFile: mode?.promptFile,
            providerOverride: chatProvider ?? undefined,
            modelOverride: chatModel ?? undefined,
            buildPrompt: async (activityId) => {
              const paths = await tauriAttachments.save(`activity-${activityId}`, files);
              const prompt = withAttachmentPaths(claudePrompt, paths);
              encodedUserMessage = encodeSkillMessage(
                skill,
                text,
                prompt,
                attachmentReferences(files, paths),
              );
              return encodedUserMessage;
            },
            title: friendlyTitle,
          },
        );
        pushFeedItem(path, sessionKey, {
          feed_type: "user_message",
          data: encodedUserMessage,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        analytics.track("mission_created", {
          agent_mode: agentMode ?? "default",
        });
        onSelectSessionRef.current?.(conversationId);
      }
      setActiveSkill(null);
      return true;
    },
    [
      activeSkill,
      agent,
      path,
      agentModes,
      chatProvider,
      chatModel,
      pushFeedItem,
      queryClient,
      t,
    ],
  );

  // Picking a skill from a card or the picker pins it above the regular
  // composer. The user can add text or send the Skill by itself.
  const applySkill = useCallback(
    (skill: SkillSummary) => setActiveSkill(skill),
    [],
  );

  // ── Built JSX bundles ─────────────────────────────────────────────────
  const renderUserMessage = useCallback(
    (msg: { content: string }) => {
      const invocation = decodeSkillMessage(msg.content);
      if (invocation) {
        return (
          <UserSkillMessage
            invocation={invocation}
            attachmentLabels={attachmentLabels}
          />
        );
      }
      const attachmentInvocation = decodeAttachmentMessage(msg.content);
      if (!attachmentInvocation) return undefined;
      return (
        <UserAttachmentMessage
          invocation={attachmentInvocation}
          labels={attachmentLabels}
        />
      );
    },
    [attachmentLabels],
  );
  const renderSystemMessage = useCallback(
    (msg: ChatMessage) => {
      if (isToolRuntimeErrorMessage(msg)) {
        const isModelUnsupported =
          msg.runtimeError.kind === "provider_model_unsupported";
        return (
          <ToolRuntimeErrorCard
            error={msg.runtimeError}
            onRetry={async () => {
              if (!path || !selectedSessionKey) return;
              const text = t("chat:toolRuntimeError.retryPrompt");
              await tauriChat.send(path, text, selectedSessionKey, {
                providerOverride: chatProvider ?? undefined,
                modelOverride: chatModel ?? undefined,
              });
              pushFeedItem(path, selectedSessionKey, {
                feed_type: "user_message",
                data: text,
              });
            }}
            onSwitchModel={
              isModelUnsupported
                ? async () => {
                    // Demote the workspace default first so future sessions
                    // use a model the user's ChatGPT plan accepts.
                    if (workspace?.id) {
                      await useWorkspaceStore
                        .getState()
                        .updateProvider(workspace.id, "openai", "gpt-5.5");
                    }
                    // If this activity carries an explicit codex override,
                    // clear it too — otherwise the resolver will keep using
                    // the activity-level value and the workspace fix won't
                    // take effect for this mission.
                    if (
                      path &&
                      selectedActivityId &&
                      activityModel === "gpt-5.5-codex"
                    ) {
                      await tauriActivity.update(path, selectedActivityId, {
                        provider: "openai",
                        model: "gpt-5.5",
                      });
                      setChatProvider("openai");
                      setChatModel("gpt-5.5");
                    }
                  }
                : undefined
            }
          />
        );
      }
      if (isProviderAuthMessage(msg.content)) return null;
      return undefined;
    },
    [chatModel, chatProvider, path, pushFeedItem, selectedSessionKey, t],
  );
  const mapFeedItems = useCallback(
    ({ items }: { sessionKey: string; items: FeedItem[] }) =>
      filterProviderAuthFeedItems(items),
    [],
  );
  const afterMessages = useCallback(
    ({ feedItems }: { sessionKey: string; feedItems: FeedItem[] }) => {
      const signalKey = providerAuthSignalKey(feedItems);
      return (
        <ProviderReconnectCard
          providerId={signalKey ? effectiveProvider : undefined}
          signalKey={signalKey ?? undefined}
        />
      );
    },
    [effectiveProvider],
  );

  const composerHeader = useMemo<AIBoardProps["composerHeader"]>(() => {
    if (!agent || !activeSkill) return undefined;
    return (
      <SelectedSkillChip
        skill={activeSkill}
        onCancel={() => setActiveSkill(null)}
      />
    );
  }, [agent, activeSkill]);

  const chatEmptyState = useMemo<AIBoardProps["chatEmptyState"]>(() => {
    if (!agent) return undefined;
    if (activeSkill) return null;
    if (emptySkillShowcase.length === 0) return undefined;
    return (
      <div className="self-stretch w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-6 pt-6 pb-4 flex flex-col gap-3">
          <div className="text-center mb-1">
            <h3 className="text-base font-semibold text-foreground">
              {t("chatEmpty.heading")}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("chatEmpty.subheading")}
            </p>
          </div>
          {emptySkillShowcase.map((s) => (
            <SkillCard
              key={s.name}
              image={s.image}
              title={humanizeSkillName(s.name)}
              description={s.description}
              integrations={s.integrations}
              onClick={() => applySkill(s)}
            />
          ))}
          {moreSkillsCount > 0 && (
            <Button
              size="sm"
              className="self-center mt-1 rounded-full gap-1.5"
              onClick={() => setPickerOpen(true)}
            >
              <Play className="size-3 fill-current" />
              {t("chatEmpty.seeMore", { count: moreSkillsCount })}
            </Button>
          )}
        </div>
      </div>
    );
  }, [agent, activeSkill, emptySkillShowcase, moreSkillsCount, t, applySkill]);

  const footer = useMemo<AIBoardProps["footer"]>(() => {
    if (!agent) return undefined;
    return ({ hasMessages }) => (
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-keep-panel-open
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Play className="size-3 fill-current" />
          {t("composerSkill.browse")}
        </button>
        <ChatModelSelector
          provider={effectiveProvider}
          model={effectiveModel}
          onSelect={handleModelSelect}
          lockedProvider={hasMessages ? effectiveProvider : null}
        />
      </div>
    );
  }, [agent, t, effectiveProvider, effectiveModel, handleModelSelect]);

  const pickerDialog = agent ? (
    <NewMissionPickerDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      lockedAgent={agent}
      hideBlank
      onSkill={(_agentPath, skillName) => {
        const skill = (allSkills ?? []).find((s) => s.name === skillName);
        if (skill) applySkill(skill);
      }}
    />
  ) : null;

  return {
    chatEmptyState,
    composerHeader,
    canSendEmpty: activeSkill != null,
    onComposerSubmit: handleSkillComposerSubmit,
    footer,
    renderUserMessage,
    isSpecialTool,
    renderToolResult,
    processLabels,
    getThinkingMessage,
    renderTurnSummary,
    transformContent,
    renderSystemMessage,
    mapFeedItems,
    afterMessages,
    renderLink,
    pickerDialog,
    effectiveProvider,
    effectiveModel,
    chatProvider,
    chatModel,
  };
}
