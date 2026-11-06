'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, GitCompare, ExternalLink, Loader2 } from 'lucide-react';
import { EvalRunStatus } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export interface EvalRun {
  id: string;
  workspaceId: string;
  status: EvalRunStatus;
  modelId: string;
  judgeModelId: string;
  questionCount: number;
  accuracy: number | null;
  faithfulness: number | null;
  retrieval: number | null;
  costMicros: number;
  failureMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

interface RunsTableProps {
  wid: string;
  hasQuestions: boolean;
}

export function RunsTable({ wid, hasQuestions }: RunsTableProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // Poll while any run is in QUEUED or RUNNING status
  const { data: runsData, isLoading } = useQuery<{ data: EvalRun[]; nextCursor?: string | null }>({
    queryKey: queryKeys.eval.runs(wid),
    queryFn: () => apiClient.get<{ data: EvalRun[]; nextCursor?: string | null }>(`/workspaces/${wid}/eval/runs`),
    enabled: Boolean(wid),
    refetchInterval: (query) => {
      const runs = query.state.data?.data;
      const inProgress = runs?.some(
        (r) => r.status === EvalRunStatus.QUEUED || r.status === EvalRunStatus.RUNNING,
      );
      return inProgress ? 1000 : false;
    },
  });

  const runs = runsData?.data || [];
  const latestRun = runs[0] || null;
  const isRunning =
    latestRun?.status === EvalRunStatus.QUEUED || latestRun?.status === EvalRunStatus.RUNNING;

  const startRunMutation = useMutation({
    mutationFn: () => apiClient.post<EvalRun>(`/workspaces/${wid}/eval/runs`),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.eval.runs(wid) });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to start evaluation run');
      }
    },
  });

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `${Math.round(val * 100)}%`;
  };

  const formatCost = (micros: number | null | undefined) => {
    if (micros === null || micros === undefined) return '$0.0000';
    return `$${(micros / 1_000_000).toFixed(4)}`;
  };

  return (
    <div className="space-y-6">
      {/* Run Controls and Latest Scores Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Evaluation Execution
            </h2>
            <p className="text-sm text-gray-500">
              Execute test questions through the current workspace model and judge quality metrics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/w/${wid}/admin/evaluation/compare`} data-testid="compare-runs-link">
              <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                <GitCompare className="h-4 w-4" />
                Compare Runs
              </Button>
            </Link>
            <Button
              onClick={() => startRunMutation.mutate()}
              disabled={startRunMutation.isPending || isRunning || !hasQuestions}
              data-testid="start-run-btn"
              size="sm"
              className="flex items-center gap-1.5"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Run
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Latest Run Scores */}
        {latestRun && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Latest Run Status:
              </span>
              <span
                data-testid="run-status"
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  latestRun.status === EvalRunStatus.COMPLETED
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                    : latestRun.status === EvalRunStatus.FAILED
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 animate-pulse'
                }`}
              >
                {latestRun.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                    Accuracy
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div data-testid="score-accuracy" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatPercent(latestRun.accuracy)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                    Faithfulness
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div data-testid="score-faithfulness" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatPercent(latestRun.faithfulness)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                    Retrieval
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div data-testid="score-retrieval" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatPercent(latestRun.retrieval)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                    Cost
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div data-testid="score-cost" className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatCost(latestRun.costMicros)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* History table */}
      <div className="space-y-4">
        <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">
          Run History
        </h3>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table data-testid="runs-history" className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Run ID / Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Model
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Accuracy
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Faithfulness
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Retrieval
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    Loading run history...
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    No runs recorded yet. Start a run above to evaluate performance.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} data-testid="eval-run-row" className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      <div className="font-semibold">{r.id.slice(0, 8)}...</div>
                      <div className="text-xs text-gray-400 font-sans">
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === EvalRunStatus.COMPLETED
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                            : r.status === EvalRunStatus.FAILED
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {r.modelId}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatPercent(r.accuracy)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatPercent(r.faithfulness)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {formatPercent(r.retrieval)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                      {formatCost(r.costMicros)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Link
                        href={`/w/${wid}/admin/evaluation/runs/${r.id}`}
                        data-testid="view-run-link"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
