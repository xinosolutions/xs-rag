'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { DocumentUpload } from '@/components/documents/document-upload';
import { DocumentUrlModal } from '@/components/documents/document-url-modal';
import { DocumentsTable, DocumentItem } from '@/components/documents/documents-table';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DocumentsAdminPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ data: DocumentItem[]; nextCursor?: string | null }>({
    queryKey: queryKeys.documents.list(wid),
    queryFn: () => apiClient.get<{ data: DocumentItem[]; nextCursor?: string | null }>(`/workspaces/${wid}/documents`),
    enabled: Boolean(wid),
  });

  const documents = data?.data || [];

  // Live updates via SSE for document.status
  useEffect(() => {
    if (!wid) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${API_BASE}/workspaces/${wid}/documents/events`, {
        withCredentials: true,
      });

      eventSource.addEventListener('document.status', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as {
            documentId: string;
            status: DocumentItem['status'];
            failureCode?: string | null;
            failureMessage?: string | null;
          };

          // Optimistically update query data
          queryClient.setQueryData(
            queryKeys.documents.list(wid),
            (old: { data: DocumentItem[]; nextCursor?: string | null } | undefined) => {
              if (!old) return old;
              return {
                ...old,
                data: old.data.map((item) =>
                  item.id === payload.documentId
                    ? {
                        ...item,
                        status: payload.status,
                        failureCode: payload.failureCode,
                        failureMessage: payload.failureMessage,
                      }
                    : item,
                ),
              };
            },
          );

          // And trigger query refetch to ensure freshness
          queryClient.invalidateQueries({ queryKey: queryKeys.documents.list(wid) });
        } catch {
          // ignore parse errors
        }
      });
    } catch {
      // EventSource failed to initialize
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [wid, queryClient]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Documents</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload files or add web pages to make them searchable by the assistant.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setIsUrlModalOpen(true)}
          className="flex items-center gap-2"
        >
          <Globe className="h-4 w-4" />
          Add Web Link
        </Button>
      </div>

      <DocumentUpload wid={wid} />

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          All Documents
        </h2>
        <DocumentsTable wid={wid} documents={documents} isLoading={isLoading} />
      </div>

      <DocumentUrlModal
        wid={wid}
        isOpen={isUrlModalOpen}
        onClose={() => setIsUrlModalOpen(false)}
      />
    </div>
  );
}
