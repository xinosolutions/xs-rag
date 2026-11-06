'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { QuestionsTable } from '@/components/admin/evaluation/questions-table';
import { RunsTable } from '@/components/admin/evaluation/runs-table';
import { EvalQuestion } from '@/components/admin/evaluation/question-dialog';

export default function EvaluationPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';

  const { data: questionsData, isLoading: questionsLoading } = useQuery<{
    data: EvalQuestion[];
  }>({
    queryKey: queryKeys.eval.questions(wid),
    queryFn: () => apiClient.get<{ data: EvalQuestion[] }>(`/workspaces/${wid}/eval/questions`),
    enabled: Boolean(wid),
  });

  const questions = questionsData?.data || [];

  return (
    <div className="flex-1 space-y-8 p-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Evaluation
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage benchmark questions, run evaluations, measure accuracy, faithfulness and retrieval, and compare runs.
        </p>
      </div>

      {/* Execution & Run History */}
      <RunsTable wid={wid} hasQuestions={questions.length > 0} />

      {/* Benchmark Questions */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        <QuestionsTable wid={wid} questions={questions} isLoading={questionsLoading} />
      </div>
    </div>
  );
}
