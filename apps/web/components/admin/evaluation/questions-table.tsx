'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { QuestionDialog, EvalQuestion } from './question-dialog';

interface QuestionsTableProps {
  wid: string;
  questions: EvalQuestion[];
  isLoading: boolean;
}

export function QuestionsTable({ wid, questions, isLoading }: QuestionsTableProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<EvalQuestion | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (questionId: string) =>
      apiClient.delete(`/workspaces/${wid}/eval/questions/${questionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.eval.questions(wid) });
    },
  });

  const handleEdit = (q: EvalQuestion) => {
    setEditingQuestion(q);
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingQuestion(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Evaluation Dataset ({questions.length})
          </h2>
          <p className="text-sm text-gray-500">
            Benchmark questions with ground-truth expected answers to evaluate retrieval and answer quality.
          </p>
        </div>
        <Button
          onClick={handleAdd}
          data-testid="add-question-btn"
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Question
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Question
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Expected Answer / Type
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">
                  Loading evaluation dataset...
                </td>
              </tr>
            ) : questions.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-500">
                  No evaluation questions yet. Click &quot;Add Question&quot; to get started.
                </td>
              </tr>
            ) : (
              questions.map((q) => (
                <tr key={q.id} data-testid="eval-question-row" className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-medium">
                    {q.question}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {q.expectUnanswered ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        Expect Unanswered
                      </span>
                    ) : (
                      <span className="line-clamp-2">{q.expectedAnswer}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm space-x-2 whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="edit-question-btn"
                      onClick={() => handleEdit(q)}
                    >
                      <Edit2 className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="delete-question-btn"
                      onClick={() => {
                        if (confirm('Delete this evaluation question?')) {
                          deleteMutation.mutate(q.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <QuestionDialog
        wid={wid}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        questionToEdit={editingQuestion}
      />
    </div>
  );
}
