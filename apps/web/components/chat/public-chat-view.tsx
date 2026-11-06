'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AnswerOutcome,
  LockedCopy,
  MessageRole,
  MessageStatus,
} from '@xs-rag/shared';
import { parseSseStream } from '@/lib/sse';
import { getPublicSessionToken } from '@/lib/public-session';
import { MessageList, ChatMessage } from './message-list';
import { ChatInput } from './chat-input';
import { CitationPanel } from '@/components/citations/citation-panel';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface PublicChatViewProps {
  isWidget?: boolean;
  widgetKey?: string;
  workspaceName?: string;
  welcomeText?: string;
  initialQuestion?: string | null;
  onQuestionConsumed?: () => void;
}

export function PublicChatView({
  isWidget = false,
  widgetKey,
  workspaceName,
  welcomeText,
  initialQuestion,
  onQuestionConsumed,
}: PublicChatViewProps) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [questionsRemaining, setQuestionsRemaining] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize session and chat
  useEffect(() => {
    let mounted = true;
    async function initSession() {
      try {
        const { sessionToken: token, questionsRemaining: remaining } =
          await getPublicSessionToken(widgetKey);
        if (!mounted) return;
        setSessionToken(token);
        setQuestionsRemaining(remaining);

        const res = await fetch(`${API_BASE}/public/chats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const chatData = await res.json();
          if (mounted) setChatId(chatData.id);
        }
      } catch (err) {
        console.error('Failed to init public chat session:', err);
      }
    }
    initSession();
    return () => {
      mounted = false;
    };
  }, [widgetKey]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSendMessage = useCallback(
    async (question: string) => {
      if (isStreaming || limitReached || !sessionToken || !chatId) return;

      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;

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

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(`${API_BASE}/public/chats/${chatId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ question }),
          signal: abortController.signal,
        });

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

          if (response.status === 429) {
            const limitCopy = isWidget ? LockedCopy.WIDGET_LIMIT : LockedCopy.DEMO_LIMIT;
            setLimitReached(true);
            setLimitMessage(limitCopy);
            setQuestionsRemaining(0);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: limitCopy,
                      status: MessageStatus.ERROR,
                      errorCode: errCode || 'DEMO_LIMIT_REACHED',
                    }
                  : m,
              ),
            );
          } else {
            setMessages((prev) =>
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
              questionsRemaining?: number;
            };
            if (typeof meta.questionsRemaining === 'number') {
              setQuestionsRemaining(meta.questionsRemaining);
            }
            if (meta.messageId) {
              setMessages((prev) =>
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
            setMessages((prev) =>
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
              citations: Array<
                ChatMessage['citations'] extends (infer U)[] | undefined ? U : never
              >;
            };
            accumulatedContent = citationsData.content;
            setMessages((prev) =>
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
            setMessages((prev) =>
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
            setMessages((prev) =>
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
                          : errData.code === 'DEMO_LIMIT_REACHED'
                          ? isWidget
                            ? LockedCopy.WIDGET_LIMIT
                            : LockedCopy.DEMO_LIMIT
                          : errData.message || LockedCopy.GENERIC_ERROR,
                    }
                  : m,
              ),
            );
          }
        }
      } catch {
        if (abortController.signal.aborted) {
          setMessages((prev) =>
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
          setMessages((prev) =>
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
      }
    },
    [isStreaming, limitReached, sessionToken, chatId, isWidget],
  );

  // Trigger initialQuestion if supplied from parent (e.g. clicking suggested question)
  useEffect(() => {
    if (initialQuestion && sessionToken && chatId && !isStreaming) {
      handleSendMessage(initialQuestion);
      onQuestionConsumed?.();
    }
  }, [initialQuestion, sessionToken, chatId, isStreaming, handleSendMessage, onQuestionConsumed]);

  return (
    <div className="flex flex-1 flex-col h-full min-w-0 bg-white dark:bg-gray-950 relative overflow-hidden">
      {/* Widget Header if in widget mode */}
      {isWidget && (
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {workspaceName || 'Document Assistant'}
            </h2>
            <p className="text-xs text-gray-500">
              {questionsRemaining !== null
                ? `${questionsRemaining} questions remaining`
                : welcomeText || 'Widget Chat'}
            </p>
          </div>
        </div>
      )}

      {/* Limit Banner */}
      {limitReached && limitMessage && (
        <div
          data-testid="demo-limit-message"
          className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200"
        >
          {limitMessage}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          onSelectCitation={(citId) => setSelectedCitationId(citId)}
          showFeedback={false}
        />
      </div>

      {/* Input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={!sessionToken || !chatId || limitReached}
      />

      {/* Citation side panel */}
      {selectedCitationId && (
        <CitationPanel
          citationId={selectedCitationId}
          sessionToken={sessionToken}
          onClose={() => setSelectedCitationId(null)}
        />
      )}
    </div>
  );
}
