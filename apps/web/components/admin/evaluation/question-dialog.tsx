'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface EvalQuestion {
  id: string;
  workspaceId: string;
  question: string;
  expectedAnswer?: string | null;
  expectUnanswered: boolean;
  expectedDocumentIds: string[];
  sourceFeedbackId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentItem {
  id: string;
  title: string;
  fileName: string;
}

interface QuestionDialogProps {
  wid: string;
  isOpen: boolean;
  onClose: () => void;
  questionToEdit?: EvalQuestion | null;
}

export function QuestionDialog({
  wid,
  isOpen,
  onClose,
  questionToEdit,
}: QuestionDialogProps) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [expectUnanswered, setExpectUnanswered] = useState(false);
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [expectedDocumentIds, setExpectedDocumentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load documents for selection
  const { data: docsData } = useQuery<{ data: DocumentItem[] }>({
    queryKey: queryKeys.documents.list(wid),
    queryFn: () => apiClient.get<{ data: DocumentItem[] }>(`/workspaces/${wid}/documents`),
    enabled: isOpen && Boolean(wid),
  });

  const documents = docsData?.data || [];

  useEffect(() => {
    if (questionToEdit) {
      setQuestion(questionToEdit.question || '');
      setExpectUnanswered(questionToEdit.expectUnanswered || false);
      setExpectedAnswer(questionToEdit.expectedAnswer || '');
      setExpectedDocumentIds(questionToEdit.expectedDocumentIds || []);
    } else {
      setQuestion('');
      setExpectUnanswered(false);
      setExpectedAnswer('');
      setExpectedDocumentIds([]);
    }
    setError(null);
  }, [questionToEdit, isOpen]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedQuestion = question.trim();
      const trimmedAnswer = expectedAnswer.trim();

      if (!trimmedQuestion) {
        throw new Error('Question is required');
      }
      if (!expectUnanswered && !trimmedAnswer) {
        throw new Error('Expected answer is required unless expect unanswered is checked');
      }

      const payload = {
        question: trimmedQuestion,
        expectUnanswered,
        expectedAnswer: expectUnanswered ? null : trimmedAnswer,
        expectedDocumentIds,
      };

      if (questionToEdit) {
        return apiClient.patch(`/workspaces/${wid}/eval/questions/${questionToEdit.id}`, payload);
      } else {
        return apiClient.post(`/workspaces/${wid}/eval/questions`, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.eval.questions(wid) });
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to save evaluation question');
      }
    },
  });

  const toggleDocumentId = (docId: string) => {
    setExpectedDocumentIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {questionToEdit ? 'Edit Evaluation Question' : 'Add Evaluation Question'}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-4 py-2"
        >
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Question <span className="text-red-500">*</span>
            </label>
            <textarea
              data-testid="eval-question-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter question to evaluate..."
              rows={3}
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="expectUnanswered"
              data-testid="eval-expect-unanswered-checkbox"
              checked={expectUnanswered}
              onChange={(e) => setExpectUnanswered(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
            />
            <label
              htmlFor="expectUnanswered"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Expect system to reply with no answer (unanswered)
            </label>
          </div>

          {!expectUnanswered && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expected Answer <span className="text-red-500">*</span>
              </label>
              <textarea
                data-testid="eval-expected-answer-input"
                value={expectedAnswer}
                onChange={(e) => setExpectedAnswer(e.target.value)}
                placeholder="Enter expected ground-truth answer..."
                rows={3}
                className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                required={!expectUnanswered}
              />
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Expected Documents (optional)
              </label>
              <div className="max-h-36 overflow-y-auto space-y-1 rounded-md border border-gray-200 p-2 dark:border-gray-800">
                {documents.map((doc) => (
                  <label
                    key={doc.id}
                    className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 p-1 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={expectedDocumentIds.includes(doc.id)}
                      onChange={() => toggleDocumentId(doc.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">{doc.title || doc.fileName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="submit-question-btn"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : questionToEdit ? 'Save Changes' : 'Add Question'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
