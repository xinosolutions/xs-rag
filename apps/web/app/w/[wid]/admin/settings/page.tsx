'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  modelId?: string;
}

interface AiModelItem {
  id: string;
  label: string;
  provider: string;
}

interface AiModelsResponse {
  data: AiModelItem[];
}

interface SettingsResponse {
  modelId: string;
}

export default function SettingsPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const queryClient = useQueryClient();

  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelSuccess, setModelSuccess] = useState<string | null>(null);

  // Queries
  const { data: wsData, isLoading: wsLoading } = useQuery<WorkspaceDetail>({
    queryKey: queryKeys.workspaces.detail(wid),
    queryFn: async () => {
      return apiClient.get<WorkspaceDetail>(`/workspaces/${wid}`);
    },
  });

  const { data: modelsData, isLoading: modelsLoading } = useQuery<AiModelsResponse>({
    queryKey: queryKeys.aiModels.all,
    queryFn: async () => {
      return apiClient.get<AiModelsResponse>('/ai-models');
    },
  });

  const { data: settingsData, isLoading: settingsLoading } = useQuery<SettingsResponse>({
    queryKey: queryKeys.workspaces.settings(wid),
    queryFn: async () => {
      return apiClient.get<SettingsResponse>(`/workspaces/${wid}/settings`);
    },
  });

  useEffect(() => {
    if (wsData?.name) {
      setWorkspaceName(wsData.name);
    }
  }, [wsData?.name]);

  useEffect(() => {
    if (settingsData?.modelId) {
      setSelectedModel(settingsData.modelId);
    } else if (wsData?.modelId) {
      setSelectedModel(wsData.modelId);
    }
  }, [settingsData?.modelId, wsData?.modelId]);

  // Mutations
  const renameMutation = useMutation({
    mutationFn: async (newName: string) => {
      return apiClient.patch(`/workspaces/${wid}`, { name: newName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.detail(wid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      setNameError(null);
      setNameSuccess('Workspace renamed successfully.');
    },
    onError: (err: unknown) => {
      setNameSuccess(null);
      if (err instanceof ApiClientError) {
        setNameError(err.message);
      } else {
        setNameError('Failed to rename workspace.');
      }
    },
  });

  const modelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      return apiClient.patch(`/workspaces/${wid}/settings`, { modelId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.settings(wid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.detail(wid) });
      setModelError(null);
      setModelSuccess('AI model updated successfully.');
    },
    onError: (err: unknown) => {
      setModelSuccess(null);
      if (err instanceof ApiClientError) {
        setModelError(err.message);
      } else {
        setModelError('Failed to update AI model.');
      }
    },
  });

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;
    setNameError(null);
    setNameSuccess(null);
    renameMutation.mutate(workspaceName.trim());
  };

  const handleModelChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModel) return;
    setModelError(null);
    setModelSuccess(null);
    modelMutation.mutate(selectedModel);
  };

  const models = modelsData?.data ?? [];

  if (wsLoading || modelsLoading || settingsLoading) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="p-8 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Workspace Settings
        </h1>
        <p className="text-sm text-gray-500">
          Configure general settings and AI models for this workspace.
        </p>
      </div>

      {/* General Settings: Rename */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">General Settings</CardTitle>
          <CardDescription>Update your workspace display name</CardDescription>
        </CardHeader>
        <form onSubmit={handleRename}>
          <CardContent className="space-y-4">
            {nameError && (
              <div
                role="alert"
                className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
              >
                {nameError}
              </div>
            )}
            {nameSuccess && (
              <div
                role="status"
                className="rounded-md bg-green-50 p-3 text-sm font-medium text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
              >
                {nameSuccess}
              </div>
            )}
            <div className="space-y-1">
              <label
                htmlFor="workspace-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Workspace Name
              </label>
              <Input
                id="workspace-name"
                name="name"
                type="text"
                required
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </div>
            {wsData?.slug && (
              <div className="text-xs text-gray-500">
                Workspace slug: <span className="font-mono">{wsData.slug}</span>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={renameMutation.isPending || !workspaceName.trim()}
            >
              {renameMutation.isPending ? 'Saving...' : 'Save Workspace Name'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* AI Model Setting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI Model</CardTitle>
          <CardDescription>
            Choose the language model used to answer questions in this workspace
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleModelChange}>
          <CardContent className="space-y-4">
            {modelError && (
              <div
                role="alert"
                className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
              >
                {modelError}
              </div>
            )}
            {modelSuccess && (
              <div
                role="status"
                className="rounded-md bg-green-50 p-3 text-sm font-medium text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
              >
                {modelSuccess}
              </div>
            )}
            <div className="space-y-1">
              <label
                htmlFor="ai-model"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Selected Model
              </label>
              <select
                id="ai-model"
                name="modelId"
                className="flex h-10 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} ({model.id}) - {model.provider}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={modelMutation.isPending || !selectedModel}
            >
              {modelMutation.isPending ? 'Saving...' : 'Save Model'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
