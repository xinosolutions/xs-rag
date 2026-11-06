'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  DocumentStatus,
  DocumentVisibility,
  LockedCopy,
} from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { DocumentAccessModal } from './document-access-modal';
import { DocumentDeleteModal } from './document-delete-modal';

export interface DocumentItem {
  id: string;
  title: string;
  sourceType: string;
  fileName?: string | null;
  sourceUrl?: string | null;
  sizeBytes?: number | null;
  status: DocumentStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
  attempts: number;
  pageCount?: number | null;
  chunkCount: number;
  visibility: DocumentVisibility;
  memberIds?: string[];
  createdAt: string;
  processedAt?: string | null;
}

interface DocumentsTableProps {
  wid: string;
  documents: DocumentItem[];
  isLoading: boolean;
}

export function DocumentsTable({ wid, documents, isLoading }: DocumentsTableProps) {
  const [accessDoc, setAccessDoc] = useState<DocumentItem | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocumentItem | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleRetry = async (docId: string) => {
    setRetryingId(docId);
    try {
      await apiClient.post(`/workspaces/${wid}/documents/${docId}/retry`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(wid) });
    } catch {
      // Invalidate anyway
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(wid) });
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (doc: DocumentItem) => {
    switch (doc.status) {
      case DocumentStatus.QUEUED:
      case DocumentStatus.PROCESSING:
        return (
          <span
            data-testid="status-processing"
            className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
          >
            {LockedCopy.STATUS_PROCESSING}
          </span>
        );
      case DocumentStatus.READY:
        return (
          <span
            data-testid="status-ready"
            className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300"
          >
            {LockedCopy.STATUS_READY}
          </span>
        );
      case DocumentStatus.FAILED:
        return (
          <div className="flex flex-col items-start gap-1">
            <span
              data-testid="status-failed"
              className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300"
            >
              {LockedCopy.STATUS_FAILED}
            </span>
            {doc.failureMessage && (
              <span className="text-xs text-red-600 dark:text-red-400 max-w-xs truncate" title={doc.failureMessage}>
                {doc.failureMessage}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              data-testid="retry-btn"
              onClick={() => handleRetry(doc.id)}
              disabled={retryingId === doc.id}
              className="mt-1 h-6 px-2 text-xs"
            >
              {retryingId === doc.id ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  const getVisibilityLabel = (vis: DocumentVisibility) => {
    switch (vis) {
      case DocumentVisibility.ADMINS_ONLY:
        return 'Admins only';
      case DocumentVisibility.SELECTED:
        return 'Selected members';
      case DocumentVisibility.ALL_MEMBERS:
      default:
        return 'All members';
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading documents...</div>;
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">{LockedCopy.DOCS_EMPTY_ADMIN}</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            <tr>
              <th scope="col" className="px-6 py-3">
                Document
              </th>
              <th scope="col" className="px-6 py-3">
                Type
              </th>
              <th scope="col" className="px-6 py-3">
                Status
              </th>
              <th scope="col" className="px-6 py-3">
                Visibility
              </th>
              <th scope="col" className="px-6 py-3">
                Passages
              </th>
              <th scope="col" className="px-6 py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {documents.map((doc) => (
              <tr key={doc.id} data-testid="document-row" className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                <td className="px-6 py-4">
                  <Link
                    href={`/w/${wid}/admin/documents/${doc.id}`}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {doc.title || doc.fileName || 'Untitled'}
                  </Link>
                  {doc.fileName && doc.title !== doc.fileName && (
                    <div className="text-xs text-gray-400">{doc.fileName}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {doc.sourceType}
                </td>
                <td className="px-6 py-4">{getStatusBadge(doc)}</td>
                <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                      doc.visibility === DocumentVisibility.ADMINS_ONLY
                        ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                        : doc.visibility === DocumentVisibility.SELECTED
                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {getVisibilityLabel(doc.visibility)}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                  <Link
                    href={`/w/${wid}/admin/documents/${doc.id}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {doc.chunkCount} passages
                  </Link>
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="access-btn"
                    onClick={() => setAccessDoc(doc)}
                  >
                    Access
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    data-testid="delete-btn"
                    onClick={() => setDeleteDoc(doc)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocumentAccessModal
        wid={wid}
        document={accessDoc}
        isOpen={Boolean(accessDoc)}
        onClose={() => setAccessDoc(null)}
      />

      <DocumentDeleteModal
        wid={wid}
        document={deleteDoc}
        isOpen={Boolean(deleteDoc)}
        onClose={() => setDeleteDoc(null)}
      />
    </>
  );
}
