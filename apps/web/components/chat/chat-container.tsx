'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AnswerOutcome,
  FeedbackRating,
  LockedCopy,
  MessageRole,
  MessageStatus,
} from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { parseSseStream } from '@/lib/sse';
import { queryKeys } from '@/lib/query-keys';
import { ChatSidebar } from './chat-sidebar';
import { MessageList, ChatMessage } from './message-list';
import { ChatInput } from './chat-input';
import { CitationPanel } from '@/components/citations/citation-panel';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ChatDetailResponse {
  id: string;
  title?: string | null;
  messages: Array<{
    id: string;
    role: MessageRole;
    content: string;
    status: MessageStatus;
    outcome?: AnswerOutcome | null;
    modelId?: string | null;
    createdAt?: string;
    citations?: Array<{
      id: string;
      index?: number;
      fileName: string;
      page?: number | null;
      heading?: string | null;
      snippet?: string | null;
      available?: boolean;
    }>;
    myFeedback?: {
      rating: FeedbackRating;
      comment?: string | null;
    } | null;
  }>;
}

interface ChatContainerProps {
  wid: string;
  chatId?: string;
}

export function ChatContainer({ wid, chatId }: ChatContainerProps) {
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | undefined>(chatId);
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamMessages, setStreamMessages] = useState<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setActiveChatId(chatId);
    setStreamMessages([]);
  }, [chatId]);

  const { data: chatData, isLoading } = useQuery<ChatDetailResponse>({
    queryKey: queryKeys.chats.detail(wid, activeChatId || ''),
    queryFn: () => apiClient.get<ChatDetailResponse>(`/workspaces/${wid}/chats/${activeChatId}`),
    enabled: Boolean(wid && activeChatId),
  });

  const persistedMessages: ChatMessage[] = (chatData?.messages || []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    outcome: m.outcome,
    modelId: m.modelId,
    createdAt: m.createdAt,
    citations: m.citations,
    myFeedback: m.myFeedback,
  }));

  // Combine persisted messages with current streaming messages if any
  const displayMessages = [...persistedMessages, ...streamMessages];

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleNewChat = () => {
    setActiveChatId(undefined);
    setStreamMessages([]);
    window.history.pushState(null, '', `/w/${wid}/chat`);
  };

  const handleSendMessage = async (question: string) => {
    if (isStreaming) return;

    let targetChatId = activeChatId;

    // If no chat exists yet, create one
    if (!targetChatId) {
      try {
        const newChat = await apiClient.post<{ id: string }>(`/workspaces/${wid}/chats`);
        targetChatId = newChat.id;
        setActiveChatId(targetChatId);
        window.history.replaceState(null, '', `/w/${wid}/chat/${targetChatId}`);
        await queryClient.invalidateQueries({ queryKey: queryKeys.chats.all(wid) });
      } catch {
        return;
      }
    }

    const userMsgId = `temp-user-${Date.now()}`;
    const assistantMsgId = `temp-assistant-${Date.now()}`;

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: MessageRole.USER,
      content: question,
      status: MessageStatus.COMPLETE,
    };

    const assistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: MessageRole.ASSISTANT,
      content: '',
      status: MessageStatus.STREAMING,
    };

    setStreamMessages([userMessage, assistantMessage]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${wid}/chats/${targetChatId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question }),
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        let errCode = 'GENERIC_ERROR';
        let errMsg = LockedCopy.GENERIC_ERROR;

        try {
          const errBody = await response.json();
          if (errBody?.error?.code) errCode = errBody.error.code;
          if (errBody?.error?.message) errMsg = errBody.error.message;
        } catch {
          // ignore
        }

        if (response.status === 409) {
          // CHAT_BUSY
          setStreamMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: errMsg,
                    status: MessageStatus.ERROR,
                    errorCode: errCode,
                  }
                : m,
            ),
          );
        } else if (response.status === 429) {
          setStreamMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: LockedCopy.RATE_LIMITED,
                    status: MessageStatus.ERROR,
                    errorCode: 'RATE_LIMITED',
                  }
                : m,
            ),
          );
        } else {
          setStreamMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: errMsg,
                    status: MessageStatus.ERROR,
                    errorCode: errCode,
                  }
                : m,
            ),
          );
        }
        return;
      }

      if (!response.body) {
        throw new Error('No response body stream');
      }

      let accumulatedContent = '';

      for await (const sse of parseSseStream(response.body)) {
        if (sse.event === 'meta') {
          const meta = sse.data as {
            messageId: string;
            modelId?: string;
          };
          if (meta.messageId) {
            setStreamMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, id: meta.messageId, modelId: meta.modelId }
                  : m,
              ),
            );
          }
        } else if (sse.event === 'token') {
          const tokenData = sse.data as { text: string };
          accumulatedContent += tokenData.text;
          setStreamMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId || m.role === MessageRole.ASSISTANT
                ? { ...m, content: accumulatedContent }
                : m,
            ),
          );
        } else if (sse.event === 'citations') {
          const citationsData = sse.data as {
            content: string;
            outcome: AnswerOutcome;
            citations: Array<ChatMessage['citations'] extends (infer U)[] | undefined ? U : never>;
          };
          accumulatedContent = citationsData.content;
          setStreamMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId || m.role === MessageRole.ASSISTANT
                ? {
                    ...m,
                    content: citationsData.content,
                    outcome: citationsData.outcome,
                    citations: citationsData.citations,
                  }
                : m,
            ),
          );
        } else if (sse.event === 'done') {
          const doneData = sse.data as {
            messageId: string;
            status: MessageStatus;
          };
          setStreamMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId || m.role === MessageRole.ASSISTANT
                ? {
                    ...m,
                    status: doneData.status || MessageStatus.COMPLETE,
                  }
                : m,
            ),
          );
        } else if (sse.event === 'error') {
          const errData = sse.data as { code: string; message: string };
          setStreamMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId || m.role === MessageRole.ASSISTANT
                ? {
                    ...m,
                    status: MessageStatus.ERROR,
                    errorCode: errData.code,
                    content:
                      errData.code === 'LLM_UNAVAILABLE'
                        ? LockedCopy.LLM_UNAVAILABLE
                        : errData.code === 'RATE_LIMITED'
                        ? LockedCopy.RATE_LIMITED
                        : errData.message || LockedCopy.GENERIC_ERROR,
                  }
                : m,
            ),
          );
        }
      }
    } catch {
      if (abortController.signal.aborted) {
        setStreamMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId || m.role === MessageRole.ASSISTANT
              ? {
                  ...m,
                  status: MessageStatus.STOPPED,
                }
              : m,
          ),
        );
      } else {
        setStreamMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId || m.role === MessageRole.ASSISTANT
              ? {
                  ...m,
                  status: MessageStatus.ERROR,
                  content: LockedCopy.GENERIC_ERROR,
                  errorCode: 'INTERNAL',
                }
              : m,
          ),
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      // Invalidate queries so persisted state is synchronized
      if (targetChatId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chats.detail(wid, targetChatId),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.chats.all(wid),
        });
      }
    }
  };

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Sidebar with chat history */}
      <ChatSidebar wid={wid} activeChatId={activeChatId} onNewChat={handleNewChat} />

      {/* Main chat window */}
      <div className="flex flex-1 flex-col h-full min-w-0 bg-white dark:bg-gray-950">
        <MessageList
          wid={wid}
          messages={displayMessages}
          isStreaming={isStreaming}
          onSelectCitation={(citId) => setSelectedCitationId(citId)}
        />

        <ChatInput
          onSendMessage={handleSendMessage}
          onStop={handleStop}
          isStreaming={isStreaming}
          disabled={isLoading}
        />
      </div>

      {/* Citation passage side panel */}
      {selectedCitationId && (
        <CitationPanel
          wid={wid}
          citationId={selectedCitationId}
          onClose={() => setSelectedCitationId(null)}
        />
      )}
    </div>
  );
}
