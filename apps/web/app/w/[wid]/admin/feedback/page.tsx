'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, MessageSquare, PlusCircle } from 'lucide-react';
import { FeedbackRating } from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { AddToEvalDialog } from '@/components/admin/feedback/add-to-eval-dialog';

interface FeedbackItem {
  id: string;
  rating: FeedbackRating;
  comment: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
  message: {
    id: string;
    question: string | null;
    content: string;
    outcome: string;
    modelId: string;
    citations: Array<{
      id: string;
      index: number;
      fileName: string;
      page: number | null;
      heading: string | null;
      snippet: string | null;
      available: boolean;
    }>;
  };
}

interface FeedbackResponse {
  data: FeedbackItem[];
  nextCursor?: string | null;
}

export default function FeedbackAdminPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';

  const [selectedRating, setSelectedRating] = useState<string | undefined>(undefined);
  const [selectedFeedbackForEval, setSelectedFeedbackForEval] = useState<FeedbackItem | null>(null);
  const [evalSuccessMessage, setEvalSuccessMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<FeedbackResponse>({
    queryKey: queryKeys.feedback.list(wid, selectedRating),
    queryFn: () => {
      const url = selectedRating
        ? `/workspaces/${wid}/feedback?rating=${encodeURIComponent(selectedRating)}`
        : `/workspaces/${wid}/feedback`;
      return apiClient.get<FeedbackResponse>(url);
    },
    enabled: Boolean(wid),
  });

  const feedbackItems = data?.data || [];

  return (
    <div className="flex-1 space-y-6 p-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            User Feedback
          </h1>
          <p className="text-sm text-gray-500">
            Review user ratings and comments on AI responses, and convert negative feedback into benchmark evaluation questions.
          </p>
        </div>

        {/* Rating filter buttons */}
        <div className="flex items-center space-x-2">
          <Button
            variant={selectedRating === undefined ? 'primary' : 'outline'}
            size="sm"
            data-testid="filter-all"
            onClick={() => setSelectedRating(undefined)}
          >
            All
          </Button>
          <Button
            variant={selectedRating === FeedbackRating.UP ? 'primary' : 'outline'}
            size="sm"
            data-testid="filter-up"
            onClick={() => setSelectedRating(FeedbackRating.UP)}
            className="flex items-center gap-1.5"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            UP
          </Button>
          <Button
            variant={selectedRating === FeedbackRating.DOWN ? 'primary' : 'outline'}
            size="sm"
            data-testid="filter-down"
            onClick={() => setSelectedRating(FeedbackRating.DOWN)}
            className="flex items-center gap-1.5"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            DOWN
          </Button>
        </div>
      </div>

      {evalSuccessMessage && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-950/50 dark:text-green-300">
          {evalSuccessMessage}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">
          Loading feedback...
        </div>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          Failed to load feedback.
        </div>
      ) : feedbackItems.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <MessageSquare className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-500">No feedback entries found for this filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbackItems.map((item) => (
            <div
              key={item.id}
              data-testid="feedback-card"
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.rating === FeedbackRating.UP
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                    }`}
                  >
                    {item.rating === FeedbackRating.UP ? (
                      <ThumbsUp className="h-3 w-3" />
                    ) : (
                      <ThumbsDown className="h-3 w-3" />
                    )}
                    {item.rating}
                  </span>
                  <span className="text-xs text-gray-500">
                    by <strong className="text-gray-700 dark:text-gray-300">{item.user?.name || 'User'}</strong> &bull;{' '}
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  data-testid="add-to-eval-btn"
                  onClick={() => setSelectedFeedbackForEval(item)}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Add to evaluation
                </Button>
              </div>

              {item.comment && (
                <div className="rounded-md bg-gray-50 p-3 text-xs italic text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-l-2 border-gray-300 dark:border-gray-600">
                  &ldquo;{item.comment}&rdquo;
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Question Asked:
                  </span>
                  <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                    {item.message?.question || '(Question text unavailable)'}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    AI Response:
                  </span>
                  <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3 mt-0.5">
                    {item.message?.content}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedFeedbackForEval && (
        <AddToEvalDialog
          wid={wid}
          feedbackId={selectedFeedbackForEval.id}
          questionText={
            selectedFeedbackForEval.message?.question ||
            selectedFeedbackForEval.message?.content ||
            ''
          }
          isOpen={Boolean(selectedFeedbackForEval)}
          onClose={() => setSelectedFeedbackForEval(null)}
          onSuccess={() => {
            setEvalSuccessMessage('Successfully added question to evaluation dataset!');
            setTimeout(() => setEvalSuccessMessage(null), 5000);
          }}
        />
      )}
    </div>
  );
}
