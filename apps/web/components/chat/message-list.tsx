'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ThumbsUp, ThumbsDown, AlertCircle, Bot, User as UserIcon } from 'lucide-react';
import {
  AnswerOutcome,
  FeedbackRating,
  LockedCopy,
  MessageRole,
  MessageStatus,
} from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { CitationChip, CitationItem } from '@/components/citations/citation-chip';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  outcome?: AnswerOutcome | null;
  modelId?: string | null;
  createdAt?: string;
  citations?: CitationItem[];
  myFeedback?: {
    rating: FeedbackRating;
    comment?: string | null;
  } | null;
  errorCode?: string | null;
}

interface MessageListProps {
  wid: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  onSelectCitation: (citationId: string) => void;
}

export function MessageList({
  wid,
  messages,
  isStreaming,
  onSelectCitation,
}: MessageListProps) {
  const [feedbackState, setFeedbackState] = useState<Record<string, FeedbackRating | null>>({});

  const handleFeedback = async (messageId: string, rating: FeedbackRating) => {
    // Optimistically update
    setFeedbackState((prev) => ({ ...prev, [messageId]: rating }));

    try {
      await apiClient.put(`/workspaces/${wid}/messages/${messageId}/feedback`, {
        rating,
      });
    } catch {
      // Revert if failed
      setFeedbackState((prev) => ({ ...prev, [messageId]: null }));
    }
  };

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <Bot className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">
            {LockedCopy.CHAT_EMPTY}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      {messages.map((msg) => {
        const isUser = msg.role === MessageRole.USER;
        const currentRating = feedbackState[msg.id] ?? msg.myFeedback?.rating ?? null;

        if (isUser) {
          return (
            <div key={msg.id} className="flex justify-end gap-3">
              <div className="max-w-2xl rounded-2xl bg-blue-600 px-4 py-2.5 text-sm text-white shadow-sm">
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300">
                <UserIcon className="h-4 w-4" />
              </div>
            </div>
          );
        }

        // Assistant Message
        const isUnanswered =
          msg.outcome === AnswerOutcome.UNANSWERED ||
          msg.content.trim() === LockedCopy.NO_ANSWER;
        const isStopped = msg.status === MessageStatus.STOPPED;
        const isError = msg.status === MessageStatus.ERROR || Boolean(msg.errorCode);

        let errorCopy: string | null = null;
        if (isError) {
          if (msg.errorCode === 'LLM_UNAVAILABLE' || msg.content.includes('LLM_UNAVAILABLE')) {
            errorCopy = LockedCopy.LLM_UNAVAILABLE;
          } else if (msg.errorCode === 'RATE_LIMITED' || msg.content.includes('RATE_LIMITED')) {
            errorCopy = LockedCopy.RATE_LIMITED;
          } else {
            errorCopy = msg.content || LockedCopy.GENERIC_ERROR;
          }
        }

        return (
          <div key={msg.id} className="flex justify-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <Bot className="h-4 w-4" />
            </div>

            <div className="max-w-3xl flex-1 space-y-3">
              <div
                className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                  isError
                    ? 'border-red-200 bg-red-50/50 text-red-900 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300'
                    : 'border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100'
                }`}
                aria-live={msg.status === MessageStatus.STREAMING ? 'polite' : undefined}
              >
                {isError ? (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p data-testid="error-copy">{errorCopy}</p>
                  </div>
                ) : isUnanswered ? (
                  <p data-testid="no-answer-copy" className="text-gray-700 dark:text-gray-300">
                    {LockedCopy.NO_ANSWER}
                  </p>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}

                {isStopped && (
                  <div
                    data-testid="answer-stopped"
                    className="mt-3 text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1"
                  >
                    <span>{LockedCopy.ANSWER_STOPPED}</span>
                  </div>
                )}

                {/* Citations chips */}
                {msg.citations && msg.citations.length > 0 && !isError && !isUnanswered && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-1.5">
                      Sources
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {msg.citations.map((c) => (
                        <CitationChip
                          key={c.id}
                          citation={c}
                          onClick={() => onSelectCitation(c.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Feedback buttons (thumbs up / down) */}
              {!isError && msg.status !== MessageStatus.STREAMING && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs text-gray-400 mr-1">Was this helpful?</span>
                  <button
                    type="button"
                    data-testid="thumbs-up-btn"
                    onClick={() => handleFeedback(msg.id, FeedbackRating.UP)}
                    className={`rounded p-1 text-xs transition-colors ${
                      currentRating === FeedbackRating.UP
                        ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                    }`}
                    title="Thumbs up"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    <span className="sr-only">Thumbs up</span>
                  </button>

                  <button
                    type="button"
                    data-testid="thumbs-down-btn"
                    onClick={() => handleFeedback(msg.id, FeedbackRating.DOWN)}
                    className={`rounded p-1 text-xs transition-colors ${
                      currentRating === FeedbackRating.DOWN
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300'
                    }`}
                    title="Thumbs down"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    <span className="sr-only">Thumbs down</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
