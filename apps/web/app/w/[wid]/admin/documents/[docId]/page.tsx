'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { DocumentItem } from '@/components/documents/documents-table';

interface PassageItem {
  id: string;
  ordinal: number;
  page?: number | null;
  heading?: string | null;
  text: string;
}

export default function DocumentPassagesPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const docId = typeof params.docId === 'string' ? params.docId : '';

  const { data: docData, isLoading: isDocLoading } = useQuery<DocumentItem>({
    queryKey: queryKeys.documents.detail(wid, docId),
    queryFn: () => apiClient.get<DocumentItem>(`/workspaces/${wid}/documents/${docId}`),
    enabled: Boolean(wid && docId),
  });

  const { data: passagesData, isLoading: isPassagesLoading } = useQuery<{
    data: PassageItem[];
    nextCursor?: string | null;
  }>({
    queryKey: queryKeys.documents.passages(wid, docId),
    queryFn: () =>
      apiClient.get<{ data: PassageItem[]; nextCursor?: string | null }>(
        `/workspaces/${wid}/documents/${docId}/passages`,
      ),
    enabled: Boolean(wid && docId),
  });

  const passages = passagesData?.data || [];
  const isLoading = isDocLoading || isPassagesLoading;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href={`/w/${wid}/admin/documents`}
          className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2"
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Documents
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {docData?.title || 'Document Passages'}
        </h1>
        {docData && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Type: {docData.sourceType} · {docData.chunkCount} passages total
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-500">Loading passages...</div>
      ) : passages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No passages extracted for this document.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {passages.map((passage) => (
            <div
              key={passage.id}
              data-testid="passage-card"
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-3 text-xs dark:border-gray-800">
                <span className="font-semibold text-gray-600 dark:text-gray-400">
                  Passage #{passage.ordinal + 1}
                </span>
                <div className="flex items-center space-x-3 text-gray-500 dark:text-gray-400">
                  {passage.page !== undefined && passage.page !== null && (
                    <span data-testid="passage-page">Page {passage.page}</span>
                  )}
                  {passage.heading && (
                    <span data-testid="passage-heading" className="font-medium text-gray-700 dark:text-gray-300">
                      {passage.heading}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {passage.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
