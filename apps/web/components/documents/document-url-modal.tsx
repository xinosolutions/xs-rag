'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DocumentVisibility } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface DocumentUrlModalProps {
  wid: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentUrlModal({ wid, isOpen, onClose }: DocumentUrlModalProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<DocumentVisibility>(DocumentVisibility.ALL_MEMBERS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiClient.post(`/workspaces/${wid}/documents/url`, {
        url: url.trim(),
        title: title.trim() || undefined,
        visibility,
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(wid) });
      setUrl('');
      setTitle('');
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to add web document.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Web Document</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="url" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Web URL *
            </label>
            <Input
              id="url"
              name="url"
              type="url"
              placeholder="https://example.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="title" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title (Optional)
            </label>
            <Input
              id="title"
              name="title"
              placeholder="Custom document title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="visibility" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Visibility
            </label>
            <select
              id="visibility"
              name="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value={DocumentVisibility.ALL_MEMBERS}>All members</option>
              <option value={DocumentVisibility.ADMINS_ONLY}>Admins only</option>
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting || !url.trim()}>
              {isSubmitting ? 'Adding...' : 'Add Link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
