'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface DocumentDeleteModalProps {
  wid: string;
  document: {
    id: string;
    title: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentDeleteModal({
  wid,
  document,
  isOpen,
  onClose,
}: DocumentDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!document) return;

    setIsDeleting(true);
    setError(null);

    try {
      await apiClient.delete(`/workspaces/${wid}/documents/${document.id}`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(wid) });
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to delete document.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Document</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-semibold text-gray-900 dark:text-gray-100">{document?.title}</span>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
