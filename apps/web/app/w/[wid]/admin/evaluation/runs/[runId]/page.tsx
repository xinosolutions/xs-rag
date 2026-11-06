'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { EvalRunStatus } from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface EvalResultItem {
  id: string;
  questionId: string | null;
  questionText: string;
  expectedAnswer?: string | null;
  expectUnanswered: boolean;
  expectedDocumentIds: string[];
  answer: string;
  outcome: string;
  accuracyCorrect: boolean;
  faithfulness: number | null;
  retrievalHit: boolean | null;
  costMicros: number;
}

interface EvalRunDetail {
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
  results: EvalResultItem[];
}

export default function RunDetailPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const runId = typeof params.runId === 'string' ? params.runId : '';

  const { data: run, isLoading, error } = useQuery<EvalRunDetail>({
    queryKey: queryKeys.eval.run(wid, runId),
    queryFn: () => apiClient.get<EvalRunDetail>(`/workspaces/${wid}/eval/runs/${runId}`),
    enabled: Boolean(wid && runId),
  });

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `${Math.round(val * 100)}%`;
  };

  const formatCost = (micros: number | null | undefined) => {
    if (micros === null || micros === undefined) return '$0.0000';
    return `$${(micros / 1_000_000).toFixed(4)}`;
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8 text-center text-sm text-gray-500">
        Loading evaluation run details...
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex-1 p-8 space-y-4">
        <Link href={`/w/${wid}/admin/evaluation`}>
          <Button variant="outline" size="sm" className="flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Evaluation
          </Button>
        </Link>
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          Run not found or failed to load.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 max-w-6xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/w/${wid}/admin/evaluation`}>
            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              Run Details
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  run.status === EvalRunStatus.COMPLETED
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                    : run.status === EvalRunStatus.FAILED
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                }`}
              >
                {run.status}
              </span>
            </h1>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              ID: {run.id} &bull; Model: {run.modelId} &bull; Judge: {run.judgeModelId}
            </p>
          </div>
        </div>
      </div>

      {/* Aggregate Score Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-medium">
              Accuracy
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatPercent(run.accuracy)}
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
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatPercent(run.faithfulness)}
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
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatPercent(run.retrieval)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs uppercase tracking-wider text-gray-500 font-medium">
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatCost(run.costMicros)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Question Results ({run.results?.length || 0})
        </h2>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table data-testid="results-table" className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Question & Answer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Expected
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Accuracy
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Faithfulness
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                  Retrieval
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {(!run.results || run.results.length === 0) ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No results recorded for this run.
                  </td>
                </tr>
              ) : (
                run.results.map((res) => (
                  <tr key={res.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-sm max-w-md">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">
                        {res.questionText}
                      </div>
                      <div className="mt-1 text-gray-600 dark:text-gray-300 text-xs line-clamp-3">
                        {res.answer || <span className="italic text-gray-400">No content</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-xs">
                      {res.expectUnanswered ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                          Expect Unanswered
                        </span>
                      ) : (
                        <span className="line-clamp-2">{res.expectedAnswer}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {res.accuracyCorrect ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-xs">
                          <CheckCircle className="h-4 w-4" /> Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium text-xs">
                          <XCircle className="h-4 w-4" /> Incorrect
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
                      {formatPercent(res.faithfulness)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm">
                      {res.retrievalHit === null ? (
                        <span className="text-gray-400 text-xs">-</span>
                      ) : res.retrievalHit ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-xs">
                          <CheckCircle className="h-4 w-4" /> Hit
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium text-xs">
                          <XCircle className="h-4 w-4" /> Miss
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500 font-mono">
                      {formatCost(res.costMicros)}
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
