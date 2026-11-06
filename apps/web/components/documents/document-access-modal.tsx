'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentVisibility } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface DocumentAccessModalProps {
  wid: string;
  document: {
    id: string;
    title: string;
    visibility: DocumentVisibility;
    memberIds?: string[];
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export function DocumentAccessModal({
  wid,
  document,
  isOpen,
  onClose,
}: DocumentAccessModalProps) {
  const [visibility, setVisibility] = useState<DocumentVisibility>(
    document?.visibility || DocumentVisibility.ALL_MEMBERS,
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    document?.memberIds || [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (document) {
      setVisibility(document.visibility);
      setSelectedMemberIds(document.memberIds || []);
      setError(null);
    }
  }, [document]);

  const { data: membersData } = useQuery<{ data: WorkspaceMember[] }>({
    queryKey: queryKeys.workspaces.members(wid),
    queryFn: () => apiClient.get<{ data: WorkspaceMember[] }>(`/workspaces/${wid}/members`),
    enabled: isOpen && visibility === DocumentVisibility.SELECTED,
  });

  const members = membersData?.data || [];

  const handleToggleMember = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!document) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiClient.patch(`/workspaces/${wid}/documents/${document.id}/access`, {
        visibility,
        memberIds: visibility === DocumentVisibility.SELECTED ? selectedMemberIds : undefined,
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(wid) });
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to update access permissions.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Document Access: {document?.title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Who can access this document?
            </label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
                <input
                  type="radio"
                  name="doc-visibility"
                  value={DocumentVisibility.ALL_MEMBERS}
                  checked={visibility === DocumentVisibility.ALL_MEMBERS}
                  onChange={() => setVisibility(DocumentVisibility.ALL_MEMBERS)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>All members</span>
              </label>

              <label className="flex items-center space-x-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
                <input
                  type="radio"
                  name="doc-visibility"
                  value={DocumentVisibility.ADMINS_ONLY}
                  checked={visibility === DocumentVisibility.ADMINS_ONLY}
                  onChange={() => setVisibility(DocumentVisibility.ADMINS_ONLY)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Admins only</span>
              </label>

              <label className="flex items-center space-x-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
                <input
                  type="radio"
                  name="doc-visibility"
                  value={DocumentVisibility.SELECTED}
                  checked={visibility === DocumentVisibility.SELECTED}
                  onChange={() => setVisibility(DocumentVisibility.SELECTED)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Selected members</span>
              </label>
            </div>
          </div>

          {visibility === DocumentVisibility.SELECTED && (
            <div className="rounded-md border border-gray-200 p-3 max-h-48 overflow-y-auto space-y-2 dark:border-gray-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Select Members
              </span>
              {members.length === 0 ? (
                <div className="text-xs text-gray-400">No other members found.</div>
              ) : (
                members.map((member) => (
                  <label
                    key={member.userId}
                    className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(member.userId)}
                      onChange={() => handleToggleMember(member.userId)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      {member.name} ({member.email})
                    </span>
                  </label>
                ))
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
