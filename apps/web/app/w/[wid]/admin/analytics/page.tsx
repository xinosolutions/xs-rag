'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  HelpCircle,
  Clock,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type PeriodType = '7d' | '30d' | '90d';

interface AnalyticsTotals {
  questions: number;
  unanswered: number;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
  avgFirstTokenMs: number | null;
  costMicros: number;
  thumbsUp: number;
  thumbsDown: number;
}

interface TopQuestionItem {
  question: string;
  count: number;
}

interface UnansweredQuestionItem {
  question: string;
  count: number;
  lastAskedAt: string;
}

interface AnalyticsResponse {
  period: PeriodType;
  from: string;
  to: string;
  totals: AnalyticsTotals;
  topQuestions: TopQuestionItem[];
  unansweredQuestions: UnansweredQuestionItem[];
}

export default function AnalyticsAdminPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';

  const [period, setPeriod] = useState<PeriodType>('30d');

  const { data, isLoading, error } = useQuery<AnalyticsResponse>({
    queryKey: queryKeys.analytics.data(wid, period),
    queryFn: () => apiClient.get<AnalyticsResponse>(`/workspaces/${wid}/analytics?period=${period}`),
    enabled: Boolean(wid),
  });

  const totals = data?.totals;
  const topQuestions = data?.topQuestions || [];
  const unansweredQuestions = data?.unansweredQuestions || [];

  const formatDurationSec = (ms: number | null | undefined) => {
    if (ms === null || ms === undefined) return '-';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatCostUsd = (micros: number | null | undefined) => {
    if (micros === null || micros === undefined) return '$0.0000';
    return `$${(micros / 1_000_000).toFixed(4)}`;
  };

  return (
    <div className="flex-1 space-y-6 p-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Workspace Analytics
          </h1>
          <p className="text-sm text-gray-500">
            Usage trends, latency percentiles, cost estimates, and question performance over time.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center space-x-2">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'primary' : 'outline'}
              size="sm"
              data-testid={`period-${p}`}
              onClick={() => setPeriod(p)}
              className="font-medium"
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">
          Loading analytics dashboard...
        </div>
      ) : error || !totals ? (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          Failed to load analytics data.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Totals Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>Questions</span>
                  <MessageSquare className="h-4 w-4 text-blue-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div data-testid="total-questions" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {totals.questions}
                </div>
                <div className="text-xs text-gray-400 mt-1">Total assistant messages</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>Unanswered</span>
                  <HelpCircle className="h-4 w-4 text-amber-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div data-testid="total-unanswered" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {totals.unanswered}
                </div>
                <div className="text-xs text-gray-400 mt-1">No-answer responses</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>Avg Latency</span>
                  <Clock className="h-4 w-4 text-purple-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div data-testid="avg-response-time" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {formatDurationSec(totals.avgResponseMs)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  P95: <span data-testid="p95-response-time">{formatDurationSec(totals.p95ResponseMs)}</span> &bull; 1st Token:{' '}
                  <span data-testid="avg-first-token">{formatDurationSec(totals.avgFirstTokenMs)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>Total Cost</span>
                  <DollarSign className="h-4 w-4 text-green-500" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                <div data-testid="total-cost" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCostUsd(totals.costMicros)}
                </div>
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                  <span className="flex items-center gap-1 text-green-600">
                    <ThumbsUp className="h-3 w-3" />
                    <span data-testid="thumbs-up-count">{totals.thumbsUp}</span>
                  </span>
                  &bull;
                  <span className="flex items-center gap-1 text-red-600">
                    <ThumbsDown className="h-3 w-3" />
                    <span data-testid="thumbs-down-count">{totals.thumbsDown}</span>
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Two Question Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Questions Table */}
            <div className="space-y-3">
              <h2 className="text-md font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Top Questions ({topQuestions.length})
              </h2>

              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <table data-testid="top-questions-table" className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Question
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {topQuestions.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-8 text-center text-xs text-gray-400">
                          No questions recorded in this period.
                        </td>
                      </tr>
                    ) : (
                      topQuestions.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                          <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 font-medium">
                            {item.question}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {item.count}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Unanswered Questions Table */}
            <div className="space-y-3">
              <h2 className="text-md font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Unanswered Questions ({unansweredQuestions.length})
              </h2>

              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <table data-testid="unanswered-questions-table" className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Question
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                        Count
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Last Asked
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {unansweredQuestions.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-xs text-gray-400">
                          No unanswered questions in this period.
                        </td>
                      </tr>
                    ) : (
                      unansweredQuestions.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                          <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 font-medium">
                            {item.question}
                          </td>
                          <td className="px-4 py-2.5 text-center text-sm font-semibold text-amber-600 dark:text-amber-400">
                            {item.count}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                            {new Date(item.lastAskedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
