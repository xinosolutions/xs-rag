'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, FileText } from 'lucide-react';
import { LockedCopy } from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface CitationPanelProps {
  wid?: string;
  citationId: string | null;
  onClose: () => void;
  sessionToken?: string | null;
}

interface PassageResponse {
  citationId: string;
  documentId: string;
  fileName: string;
  page?: number | null;
  heading?: string | null;
  text: string;
}

export function CitationPanel({ wid, citationId, onClose, sessionToken }: CitationPanelProps) {
  const { data, isLoading, isError } = useQuery<PassageResponse>({
    queryKey: sessionToken
      ? ['public', 'citations', citationId || '']
      : queryKeys.citations.passage(wid || '', citationId || ''),
    queryFn: async () => {
      if (sessionToken) {
        const res = await fetch(`${API_BASE}/public/citations/${citationId}/passage`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });
        if (!res.ok) {
          throw new Error('Citation unavailable');
        }
        return res.json();
      }
      return apiClient.get<PassageResponse>(`/workspaces/${wid}/citations/${citationId}/passage`);
    },
    enabled: Boolean(citationId && (wid || sessionToken)),
    retry: false,
  });

  if (!citationId) return null;

  return (
    <aside
      data-testid="citation-panel"
      className="w-80 lg:w-96 border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 flex flex-col h-full shrink-0 shadow-lg z-20"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center space-x-2">
          <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Citation Passage</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
          <X className="h-4 w-4 text-gray-500" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="text-xs text-gray-500 text-center py-8">Loading passage...</div>
        ) : isError ? (
          <div
            data-testid="citation-unavailable"
            className="rounded-md bg-amber-50 p-4 text-sm text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
          >
            {LockedCopy.CITATION_UNAVAILABLE}
          </div>
        ) : data ? (
          <div className="space-y-3">
            <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800/50 dark:text-gray-300 space-y-1">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                Source: {data.fileName}
              </div>
              {data.page !== undefined && data.page !== null && (
                <div>Page: {data.page}</div>
              )}
              {data.heading && (
                <div>Section: {data.heading}</div>
              )}
            </div>

            <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 bg-white p-3 rounded border border-gray-100 dark:bg-gray-900 dark:border-gray-800 whitespace-pre-wrap">
              {data.text}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
