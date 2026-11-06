'use client';

import React, { useState } from 'react';
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

interface DocumentItem {
  id: string;
  title: string;
  fileName: string;
}

interface AddToEvalDialogProps {
  wid: string;
  feedbackId: string;
  questionText: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddToEvalDialog({
  wid,
  feedbackId,
  questionText,
  isOpen,
  onClose,
  onSuccess,
}: AddToEvalDialogProps) {
  const queryClient = useQueryClient();
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [expectedDocumentIds, setExpectedDocumentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load documents for optional selection
  const { data: docsData } = useQuery<{ data: DocumentItem[] }>({
    queryKey: queryKeys.documents.list(wid),
    queryFn: () => apiClient.get<{ data: DocumentItem[] }>(`/workspaces/${wid}/documents`),
    enabled: isOpen && Boolean(wid),
  });

  const documents = docsData?.data || [];

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmedAnswer = expectedAnswer.trim();
      if (!trimmedAnswer) {
        throw new Error('Expected answer is required');
      }

      return apiClient.post(`/workspaces/${wid}/feedback/${feedbackId}/eval-question`, {
        expectedAnswer: trimmedAnswer,
        ...(expectedDocumentIds.length > 0 ? { expectedDocumentIds } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.eval.questions(wid) });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to add feedback to evaluation');
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
      <DialogContent data-testid="add-to-eval-dialog" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add to Evaluation Dataset</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
          className="space-y-4 py-2"
        >
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Question
            </label>
            <div className="p-3 rounded-md bg-gray-50 text-sm text-gray-900 font-medium dark:bg-gray-800 dark:text-gray-100">
              {questionText}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Expected Answer <span className="text-red-500">*</span>
            </label>
            <textarea
              data-testid="eval-expected-answer-input"
              value={expectedAnswer}
              onChange={(e) => setExpectedAnswer(e.target.value)}
              placeholder="Enter the correct, expected answer for this question..."
              rows={3}
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              required
            />
          </div>

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
              data-testid="submit-add-to-eval-btn"
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? 'Adding...' : 'Add to Evaluation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
