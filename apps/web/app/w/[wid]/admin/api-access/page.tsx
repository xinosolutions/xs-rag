'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Globe, Server } from 'lucide-react';
import { ApiKeyKind } from '@xs-rag/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { CreateKeyDialog } from '@/components/admin/api-access/create-key-dialog';

interface ApiKeyItem {
  id: string;
  name: string;
  kind: ApiKeyKind;
  keyPrefix: string;
  allowedOrigins: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiKeysResponse {
  data: ApiKeyItem[];
}

export default function ApiAccessAdminPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading, error } = useQuery<ApiKeysResponse>({
    queryKey: queryKeys.apiKeys.list(wid),
    queryFn: () => apiClient.get<ApiKeysResponse>(`/workspaces/${wid}/api-keys`),
    enabled: Boolean(wid),
  });

  const keys = data?.data || [];

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => apiClient.delete(`/workspaces/${wid}/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list(wid) });
    },
  });

  return (
    <div className="flex-1 space-y-6 p-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            API &amp; Widget Access
          </h1>
          <p className="text-sm text-gray-500">
            Manage server keys for external backend access and public widget keys for embeddable chat.
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          data-testid="create-key-btn"
          size="sm"
          className="flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">
          Loading API keys...
        </div>
      ) : error ? (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          Failed to load API keys.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <table data-testid="api-keys-table" className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name &amp; Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Key Prefix
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Allowed Origins
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Last Used
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    No API keys created yet. Click &quot;Create API Key&quot; to generate a key.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} data-testid="api-key-row" className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-2">
                        {k.kind === ApiKeyKind.SERVER ? (
                          <Server className="h-4 w-4 text-purple-500" />
                        ) : (
                          <Globe className="h-4 w-4 text-blue-500" />
                        )}
                        <span>{k.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            k.kind === ApiKeyKind.SERVER
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          }`}
                        >
                          {k.kind}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 font-normal">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">
                      <span data-testid="key-prefix">{k.keyPrefix}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      <div data-testid="allowed-origins">
                        {k.kind === ApiKeyKind.WIDGET && k.allowedOrigins?.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {k.allowedOrigins.map((origin, idx) => (
                              <span
                                key={idx}
                                className="inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                              >
                                {origin}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-xs">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="delete-key-btn"
                        onClick={() => {
                          if (confirm(`Revoke API key "${k.name}"? This action cannot be undone.`)) {
                            deleteMutation.mutate(k.id);
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
      )}

      <CreateKeyDialog
        wid={wid}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}
