import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChatPanel,
  decodeAttachmentMessage,
  UserAttachmentMessage,
} from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@houston-ai/core";
import { useFeedStore } from "../../stores/feeds";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { useDraftStore, useDraftText, useDraftFiles } from "../../stores/drafts";
import {
  isActiveSessionStatus,
  useSessionStatus,
  useSessionStatusStore,
} from "../../stores/session-status";
import { useSessionMessageQueue } from "../../hooks/use-session-message-queue";
import {
  tauriChat,
  tauriAttachments,
  tauriSystem,
  tauriConfig,
} from "../../lib/tauri";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { getConversationScopeKey } from "../../lib/conversation-scope";
import { createMission } from "../../lib/create-mission";
import { queryKeys } from "../../lib/query-keys";
import { useFileToolRenderer } from "../../hooks/use-file-tool-renderer";
import {
  useAllConversations,
  useConnectedToolkits,
  useConnections,
  useOrchestrationStatus,
} from "../../hooks/queries";
import {
  ComposioLinkCard,
  parseComposioToolkitFromHref,
} from "../composio-link-card";
import {
  ComposioSigninCard,
  isComposioSigninHref,
} from "../composio-signin-card";
import { latestAssistantComposioToolkits } from "../../lib/composio-links";
import { DispatchActions } from "../dispatch-actions";
import { analytics } from "../../lib/analytics";
import { extractDispatchLinks } from "../../lib/dispatch-links";
import type { Agent } from "../../lib/types";
import { HoustonThinkingIndicator } from "../shell/experience-card";
import { ChatModelSelector } from "../chat-model-selector";
import { useChatDisplayLabels } from "../use-chat-display-labels";
import { getDefaultModel } from "../../lib/providers";
import { ProviderReconnectCard } from "../shell/provider-reconnect-card";
import { ToolRuntimeErrorCard } from "../shell/tool-runtime-error-card";
import { isToolRuntimeErrorMessage } from "../tool-runtime-feed";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "../tabs/provider-auth-feed";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";

interface AgentSessionChatProps {
  agent: Agent;
  sessionKey: string;
  mode: "existing" | "new";
  onMissionCreated?: (sessionKey: string) => void;
}

export function AgentSessionChat({
  agent,
  sessionKey,
  mode,
  onMissionCreated,
}: AgentSessionChatProps) {
  const { t } = useTranslation("chat");
  const { t: tIntegrations } = useTranslation("integrations");
  const queuedLabels = useQueuedMessageLabels();
  const attachmentLabels = useMemo(
    () => ({
      attachmentCount: (count: number) => t("attachmentMessage.count", { count }),
    }),
    [t],
  );
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();
  const attachmentValidation = useAttachmentRejectionDialog();
  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(agent.folderPath);
  const queryClient = useQueryClient();

  const agentPath = agent.folderPath;
  const conversationScopeKey = useMemo(
    () => getConversationScopeKey(agentPath, sessionKey),
    [agentPath, sessionKey],
  );
  const attachmentScope = mode === "new" ? sessionKey : `agent-${agent.id}`;
  const feedItems = useFeedStore((s) => s.items[agentPath]?.[sessionKey]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setFeed = useFeedStore((s) => s.setFeed);
  const clearFeed = useFeedStore((s) => s.clearFeed);
  const addToast = useUIStore((s) => s.addToast);
  const handleNotice = useCallback(
    (message: string) => addToast({ title: message }),
    [addToast],
  );
  const [isLoading, setIsLoading] = useState(false);
  const sessionStatus = useSessionStatus(agentPath, sessionKey);
  const isSessionActive = isActiveSessionStatus(sessionStatus);
  const composerText = useDraftText(conversationScopeKey);
  const composerFiles = useDraftFiles(conversationScopeKey);
  const setComposerText = useCallback(
    (text: string) => useDraftStore.getState().setDraftText(conversationScopeKey, text),
    [conversationScopeKey],
  );
  const setComposerFiles = useCallback(
    (files: File[]) => useDraftStore.getState().setDraftFiles(conversationScopeKey, files),
    [conversationScopeKey],
  );
  const sendingRef = useRef(false);
  const loadedRef = useRef<string | null>(null);
  const pendingComposioRef = useRef<Set<string>>(new Set());
  const continuedComposioRef = useRef<string | null>(null);

  const workspace = useWorkspaceStore((s) => s.current);
  const workspaceId = workspace?.id ?? null;
  const agents = useAgentStore((s) => s.agents);
  const wsProvider = workspace?.provider ?? "anthropic";
  const wsModel = workspace?.model ?? getDefaultModel(wsProvider);

  const [agentProvider, setAgentProvider] = useState<string | null>(null);
  const [agentModel, setAgentModel] = useState<string | null>(null);
  useEffect(() => {
    tauriConfig
      .read(agentPath)
      .then((cfg) => {
        setAgentProvider((cfg.provider as string) ?? null);
        setAgentModel((cfg.model as string) ?? null);
      })
      .catch(() => {});
  }, [agentPath]);

  const [chatProvider, setChatProvider] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState<string | null>(null);
  useEffect(() => {
    setChatProvider(null);
    setChatModel(null);
  }, [agent.id, sessionKey]);

  const effectiveProvider = chatProvider ?? agentProvider ?? wsProvider;
  const effectiveModel = chatModel ?? agentModel ?? wsModel;
  const authSignalKey = useMemo(
    () => providerAuthSignalKey(feedItems ?? []),
    [feedItems],
  );
  const visibleFeedItems = useMemo(
    () => filterProviderAuthFeedItems(feedItems ?? []),
    [feedItems],
  );
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: allConversations } = useAllConversations(agentPaths);
  const { data: orchestrationStatus } = useOrchestrationStatus(agentPath, sessionKey);
  const delegatedConversations = useMemo(
    () =>
      (allConversations ?? []).filter(
        (conversation) =>
          conversation.orchestration_parent_agent_path === agentPath &&
          conversation.orchestration_parent_session_key === sessionKey,
      ),
    [allConversations, agentPath, sessionKey],
  );
  const handleModelSelect = useCallback((prov: string, mod: string) => {
    setChatProvider(prov);
    setChatModel(mod);
  }, []);

  useEffect(() => {
    if (mode === "new") return;
    const key = `${agent.id}:${sessionKey}`;
    if (loadedRef.current === key) return;
    loadedRef.current = key;
    clearFeed(agentPath, sessionKey);
    tauriChat.loadHistory(agentPath, sessionKey).then((rows) => {
      if (rows.length > 0) setFeed(agentPath, sessionKey, rows as FeedItem[]);
    });
  }, [agent.id, mode, sessionKey, agentPath, setFeed, clearFeed]);

  const handleStop = useCallback(() => {
    tauriChat
      .stop(agentPath, sessionKey)
      .then((res) => {
        if (!res.cancelled) return;
        setIsLoading(false);
        useSessionStatusStore.getState().setStatus(agentPath, sessionKey, "completed");
      })
      .catch(console.error);
  }, [agentPath, sessionKey]);

  useEffect(() => {
    if (sessionStatus === "completed" || sessionStatus === "error") {
      setIsLoading(false);
    }
  }, [sessionStatus]);

  const handleOpenLink = useCallback((url: string) => {
    tauriSystem.openUrl(url).catch(console.error);
  }, []);

  const { data: composioStatus } = useConnections();
  const isSignedIn = composioStatus?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(() => new Set(connectedList ?? []), [connectedList]);
  const latestComposioToolkits = useMemo(
    () => latestAssistantComposioToolkits(visibleFeedItems),
    [visibleFeedItems],
  );

  const sendNow = useCallback(
    async (text: string, files: File[]) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setIsLoading(true);
      let started = false;
      try {
        if (mode === "new") {
          let sentPrompt = text;
          const result = await createMission(
            {
              id: agent.id,
              name: agent.name,
              color: agent.color,
              folderPath: agentPath,
            },
            text,
            {
              providerOverride: chatProvider ?? undefined,
              modelOverride: chatModel ?? undefined,
              buildPrompt: async (activityId) => {
                const paths = await tauriAttachments.save(`activity-${activityId}`, files);
                sentPrompt = buildAttachmentPrompt(text, files, paths);
                return sentPrompt;
              },
            },
          );
          started = true;
          pushFeedItem(agentPath, result.sessionKey, {
            feed_type: "user_message",
            data: sentPrompt,
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations(agentPath) });
          analytics.track("mission_created", { agent_mode: "default" });
          setComposerText("");
          setComposerFiles([]);
          onMissionCreated?.(result.sessionKey);
          return;
        }

        const paths = await tauriAttachments.save(attachmentScope, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        await tauriChat.send(agentPath, prompt, sessionKey, {
          providerOverride: chatProvider ?? undefined,
          modelOverride: chatModel ?? undefined,
        });
        started = true;
        pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: prompt });
        analytics.track("chat_message_sent");
        setComposerText("");
        setComposerFiles([]);
      } catch (err) {
        setIsLoading(false);
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: t("errors.sessionStart", { error: String(err) }),
        });
        throw err;
      } finally {
        if (!started) setIsLoading(false);
        sendingRef.current = false;
      }
    },
    [
      mode,
      agent,
      agentPath,
      sessionKey,
      attachmentScope,
      pushFeedItem,
      setComposerText,
      setComposerFiles,
      chatProvider,
      chatModel,
      t,
      queryClient,
      onMissionCreated,
    ],
  );
  const handleQueued = useCallback(() => {
    setComposerText("");
    setComposerFiles([]);
  }, [setComposerText, setComposerFiles]);
  const messageQueue = useSessionMessageQueue({
    agentPath,
    sessionKey,
    isActive: isLoading || isSessionActive,
    sendNow,
    onQueued: handleQueued,
  });

  const handleComposioConnectStarted = useCallback((toolkit: string) => {
    pendingComposioRef.current.add(toolkit);
    continuedComposioRef.current = null;
  }, []);
  const sendComposioContinuation = useCallback(
    async (text: string) => {
      setIsLoading(true);
      try {
        await tauriChat.send(agentPath, text, sessionKey, {
          providerOverride: chatProvider ?? undefined,
          modelOverride: chatModel ?? undefined,
          visibleUserMessage: false,
        });
      } catch (err) {
        setIsLoading(false);
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: t("errors.sessionStart", { error: String(err) }),
        });
      }
    },
    [agentPath, chatModel, chatProvider, pushFeedItem, sessionKey, t],
  );
  const handleComposioSignInComplete = useCallback(() => {
    void sendComposioContinuation(tIntegrations("continueAfterComposioSignIn"));
  }, [sendComposioContinuation, tIntegrations]);

  useEffect(() => {
    if (latestComposioToolkits.length === 0) return;
    if (isLoading || isSessionActive) return;
    const pending = pendingComposioRef.current;
    if (!latestComposioToolkits.some((toolkit) => pending.has(toolkit))) return;
    if (!latestComposioToolkits.every((toolkit) => connectedSet.has(toolkit))) return;

    const key = latestComposioToolkits.slice().sort().join(",");
    if (continuedComposioRef.current === key) return;
    continuedComposioRef.current = key;
    pending.clear();
    void sendComposioContinuation(
      tIntegrations("continueAfterConnected", { toolkits: key }),
    );
  }, [
    connectedSet,
    isLoading,
    isSessionActive,
    latestComposioToolkits,
    sendComposioContinuation,
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
    ],
  );
  const transformContent = useCallback(
    (
      content: string,
      meta: { isLatestAssistantMessage: boolean; messageKey: string },
    ) => {
      const dispatch = extractDispatchLinks(content);
      return {
        content: dispatch.content,
        extra: (
          <DispatchActions
            dispatch={dispatch}
            workspaceId={workspaceId}
            parentAgentPath={agentPath}
            parentSessionKey={sessionKey}
            orchestration={orchestrationStatus}
            delegatedCount={delegatedConversations.length}
            allowAutoRun={meta.isLatestAssistantMessage}
            dispatchMessageKey={meta.messageKey}
            onRejectCreate={(rejectText) => messageQueue.sendOrQueue(rejectText, [])}
          />
        ),
      };
    },
    [
      agentPath,
      delegatedConversations.length,
      messageQueue.sendOrQueue,
      orchestrationStatus,
      sessionKey,
      workspaceId,
    ],
  );

  return (
    <div className="h-full w-full flex flex-col">
      <ChatPanel
        sessionKey={sessionKey}
        feedItems={visibleFeedItems}
        isLoading={isLoading || isSessionActive}
        onSend={messageQueue.sendOrQueue}
        onStop={handleStop}
        onOpenLink={handleOpenLink}
        renderLink={renderLink}
        isSpecialTool={isSpecialTool}
        renderToolResult={renderToolResult}
        transformContent={transformContent}
        processLabels={processLabels}
        getThinkingMessage={getThinkingMessage}
        renderTurnSummary={renderTurnSummary}
        renderSystemMessage={(msg) => {
          if (isToolRuntimeErrorMessage(msg)) {
            return (
              <ToolRuntimeErrorCard
                error={msg.runtimeError}
                onRetry={() =>
                  messageQueue.sendOrQueue(t("toolRuntimeError.retryPrompt"), [])
                }
              />
            );
          }
          if (isProviderAuthMessage(msg.content)) return null;
          if (authSignalKey && msg.content.startsWith("Session error:")) return null;
          return undefined;
        }}
        renderUserMessage={(msg) => {
          const invocation = decodeAttachmentMessage(msg.content);
          if (!invocation) return undefined;
          return (
            <UserAttachmentMessage
              invocation={invocation}
              labels={attachmentLabels}
            />
          );
        }}
        afterMessages={
          <ProviderReconnectCard
            providerId={authSignalKey ? effectiveProvider : undefined}
            signalKey={authSignalKey ?? undefined}
          />
        }
        thinkingIndicator={<HoustonThinkingIndicator />}
        placeholder={t("composer.placeholder")}
        value={composerText}
        onValueChange={setComposerText}
        attachments={composerFiles}
        onAttachmentsChange={setComposerFiles}
        onNotice={handleNotice}
        prepareAttachments={attachmentValidation.prepareAttachments}
        onAttachmentRejections={attachmentValidation.onAttachmentRejections}
        queuedMessages={messageQueue.queuedMessages}
        onRemoveQueuedMessage={messageQueue.removeQueuedMessage}
        queuedLabels={queuedLabels}
        footer={
          <ChatModelSelector
            provider={effectiveProvider}
            model={effectiveModel}
            onSelect={handleModelSelect}
            lockedProvider={visibleFeedItems.length > 0 ? effectiveProvider : null}
          />
        }
        emptyState={
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("empty.title")}</EmptyTitle>
              <EmptyDescription>{t("empty.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      {attachmentValidation.dialog}
    </div>
  );
}
