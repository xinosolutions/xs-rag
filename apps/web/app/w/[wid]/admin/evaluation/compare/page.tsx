'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Minus, CheckCircle, XCircle } from 'lucide-react';
import { EvalRunStatus } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EvalRun } from '@/components/admin/evaluation/runs-table';

interface MetricComparison {
  base: number | null;
  other: number | null;
  delta: number | null;
}

interface QuestionComparison {
  questionId: string;
  questionText: string;
  baseCorrect: boolean;
  otherCorrect: boolean;
  changed: boolean;
}

interface CompareResponse {
  base: Partial<EvalRun>;
  other: Partial<EvalRun>;
  deltas: {
    accuracy: number | null;
    faithfulness: number | null;
    retrieval: number | null;
  };
  metrics: {
    accuracy: MetricComparison;
    faithfulness: MetricComparison;
    retrieval: MetricComparison;
  };
  questions: QuestionComparison[];
}

export default function CompareRunsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';

  const initialBase = searchParams.get('baseRunId') || '';
  const initialOther = searchParams.get('otherRunId') || '';

  const [baseRunId, setBaseRunId] = useState(initialBase);
  const [otherRunId, setOtherRunId] = useState(initialOther);

  // Fetch runs list for selectors
  const { data: runsData } = useQuery<{ data: EvalRun[] }>({
    queryKey: queryKeys.eval.runs(wid),
    queryFn: () => apiClient.get<{ data: EvalRun[] }>(`/workspaces/${wid}/eval/runs`),
    enabled: Boolean(wid),
  });

  const runs = (runsData?.data || []).filter(
    (r) => r.status === EvalRunStatus.COMPLETED,
  );

  // Pre-select the latest two runs if not provided in search params
  useEffect(() => {
    if (!baseRunId && !otherRunId && runs.length >= 2) {
      setBaseRunId(runs[1].id);
      setOtherRunId(runs[0].id);
    } else if (runs.length === 1 && !baseRunId) {
      setBaseRunId(runs[0].id);
    }
  }, [runs, baseRunId, otherRunId]);

  const canCompare = Boolean(baseRunId && otherRunId && baseRunId !== otherRunId);

  const { data: compareData, isLoading, error } = useQuery<CompareResponse>({
    queryKey: queryKeys.eval.compare(wid, baseRunId, otherRunId),
    queryFn: () =>
      apiClient.get<CompareResponse>(
        `/workspaces/${wid}/eval/compare?baseRunId=${encodeURIComponent(
          baseRunId,
        )}&otherRunId=${encodeURIComponent(otherRunId)}`,
      ),
    enabled: Boolean(wid && canCompare),
  });

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `${Math.round(val * 100)}%`;
  };

  const formatDelta = (delta: number | null | undefined) => {
    if (delta === null || delta === undefined) return '-';
    const rounded = Math.round(delta * 100);
    if (rounded > 0) return `+${rounded}%`;
    if (rounded < 0) return `${rounded}%`;
    return '0%';
  };

  const renderDeltaBadge = (delta: number | null | undefined, testId: string) => {
    const formatted = formatDelta(delta);
    if (delta === null || delta === undefined || delta === 0) {
      return (
        <span data-testid={testId} className="inline-flex items-center text-gray-500 font-semibold text-lg">
          <Minus className="h-4 w-4 mr-0.5" /> {formatted}
        </span>
      );
    }
    if (delta > 0) {
      return (
        <span data-testid={testId} className="inline-flex items-center text-green-600 dark:text-green-400 font-semibold text-lg">
          <ArrowUpRight className="h-5 w-5 mr-0.5" /> {formatted}
        </span>
      );
    }
    return (
      <span data-testid={testId} className="inline-flex items-center text-red-600 dark:text-red-400 font-semibold text-lg">
        <ArrowDownRight className="h-5 w-5 mr-0.5" /> {formatted}
      </span>
    );
  };

  return (
    <div className="flex-1 space-y-6 p-8 max-w-6xl">
      <div className="flex items-center space-x-4">
        <Link href={`/w/${wid}/admin/evaluation`}>
          <Button variant="outline" size="sm" className="flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Evaluation
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Compare Evaluation Runs
          </h1>
          <p className="text-sm text-gray-500">
            Compare performance deltas between two evaluation runs across accuracy, faithfulness, and retrieval.
          </p>
        </div>
      </div>

      {/* Selectors Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Base Run (Reference)
            </label>
            <select
              data-testid="base-run-select"
              value={baseRunId}
              onChange={(e) => setBaseRunId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select Base Run...</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 8)} - {r.modelId} ({new Date(r.createdAt).toLocaleDateString()}) - Acc:{' '}
                  {formatPercent(r.accuracy)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Other Run (Candidate)
            </label>
            <select
              data-testid="other-run-select"
              value={otherRunId}
              onChange={(e) => setOtherRunId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select Other Run...</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 8)} - {r.modelId} ({new Date(r.createdAt).toLocaleDateString()}) - Acc:{' '}
                  {formatPercent(r.accuracy)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {baseRunId === otherRunId && baseRunId !== '' && (
          <p className="mt-2 text-xs text-red-500">
            Please choose two distinct runs to compare.
          </p>
        )}
      </div>

      {isLoading && (
        <div className="py-8 text-center text-sm text-gray-500">
          Loading comparison data...
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error instanceof ApiClientError ? error.message : 'Failed to compare runs'}
        </div>
      )}

      {compareData && (
        <div className="space-y-6">
          {/* Comparison Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                  Accuracy Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Delta</span>
                  {renderDeltaBadge(compareData.deltas.accuracy, 'delta-accuracy')}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
                  <div>
                    <span className="text-gray-400">Base: </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatPercent(compareData.metrics.accuracy.base)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400">Other: </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatPercent(compareData.metrics.accuracy.other)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                  Faithfulness Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Delta</span>
                  {renderDeltaBadge(compareData.deltas.faithfulness, 'delta-faithfulness')}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
                  <div>
                    <span className="text-gray-400">Base: </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatPercent(compareData.metrics.faithfulness.base)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400">Other: </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatPercent(compareData.metrics.faithfulness.other)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                  Retrieval Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Delta</span>
                  {renderDeltaBadge(compareData.deltas.retrieval, 'delta-retrieval')}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
                  <div>
                    <span className="text-gray-400">Base: </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatPercent(compareData.metrics.retrieval.base)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-400">Other: </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatPercent(compareData.metrics.retrieval.other)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Question Level Comparison Table */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Per-Question Comparisons ({compareData.questions.length})
            </h2>

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <table data-testid="compare-questions-table" className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Question
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                      Base Run
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                      Other Run
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                      Changed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {compareData.questions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                        No common questions between these two runs.
                      </td>
                    </tr>
                  ) : (
                    compareData.questions.map((q) => (
                      <tr key={q.questionId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-medium max-w-md">
                          {q.questionText}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {q.baseCorrect ? (
                            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                              <CheckCircle className="h-4 w-4" /> Correct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
                              <XCircle className="h-4 w-4" /> Incorrect
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {q.otherCorrect ? (
                            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium">
                              <CheckCircle className="h-4 w-4" /> Correct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
                              <XCircle className="h-4 w-4" /> Incorrect
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {q.changed ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                              Changed
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">Unchanged</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
