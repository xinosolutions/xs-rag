'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkspaceRole } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

interface WorkspacesResponse {
  data: WorkspaceItem[];
}

export default function WorkspacesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();

  const [name, setName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<WorkspacesResponse>({
    queryKey: queryKeys.workspaces.all,
    queryFn: async () => {
      return apiClient.get<WorkspacesResponse>('/workspaces');
    },
  });

  const createMutation = useMutation({
    mutationFn: async (workspaceName: string) => {
      return apiClient.post<WorkspaceItem>('/workspaces', { name: workspaceName });
    },
    onSuccess: (newWs) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      setName('');
      setCreateError(null);
      router.push(`/w/${newWs.id}/admin/settings`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create workspace.');
      }
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreateError(null);
    createMutation.mutate(name.trim());
  };

  const workspaces = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            xs-RAG Workspaces
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {user ? user.email : ''}
            </span>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Your Workspaces
            </h2>

            {isLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading workspaces...</div>
            ) : workspaces.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-gray-500">
                  You are not a member of any workspaces yet. Create one to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {workspaces.map((ws) => (
                  <Card key={ws.id} className="transition-shadow hover:shadow-md">
                    <CardHeader className="p-5">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{ws.name}</CardTitle>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            ws.role === WorkspaceRole.ADMIN
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          }`}
                        >
                          {ws.role}
                        </span>
                      </div>
                      <CardDescription className="text-xs">{ws.slug}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-0">
                      <Link
                        href={ws.role === WorkspaceRole.ADMIN ? `/w/${ws.id}/admin/documents` : `/w/${ws.id}/chat`}
                        className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Open Workspace
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create Workspace</CardTitle>
                <CardDescription>Start a new document workspace as admin</CardDescription>
              </CardHeader>
              <form onSubmit={handleCreate}>
                <CardContent className="space-y-4">
                  {createError && (
                    <div
                      role="alert"
                      className="rounded-md bg-red-50 p-3 text-xs font-medium text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
                    >
                      {createError}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label
                      htmlFor="workspace-name"
                      className="block text-xs font-medium text-gray-700 dark:text-gray-300"
                    >
                      Workspace Name
                    </label>
                    <Input
                      id="workspace-name"
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Acme Policies"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create Workspace'}
                  </Button>
                </CardContent>
              </form>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
