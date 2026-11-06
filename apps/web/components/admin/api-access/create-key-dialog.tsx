'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, AlertTriangle, Code } from 'lucide-react';
import { ApiKeyKind } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CreatedKeyResult {
  id: string;
  name: string;
  kind: ApiKeyKind;
  keyPrefix: string;
  allowedOrigins?: string[];
  secret: string;
  createdAt: string;
}

interface CreateKeyDialogProps {
  wid: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CreateKeyDialog({ wid, isOpen, onClose }: CreateKeyDialogProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<ApiKeyKind>(ApiKeyKind.SERVER);
  const [originsText, setOriginsText] = useState('http://localhost:3000');
  const [error, setError] = useState<string | null>(null);

  const [createdKey, setCreatedKey] = useState<CreatedKeyResult | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error('Name is required');
      }

      let allowedOrigins: string[] | undefined = undefined;
      if (kind === ApiKeyKind.WIDGET) {
        allowedOrigins = originsText
          .split(/[\n,]+/)
          .map((o) => o.trim())
          .filter(Boolean);

        if (allowedOrigins.length === 0) {
          throw new Error('At least one allowed origin is required for Widget keys');
        }
      }

      return apiClient.post<CreatedKeyResult>(`/workspaces/${wid}/api-keys`, {
        name: trimmedName,
        kind,
        ...(allowedOrigins ? { allowedOrigins } : {}),
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list(wid) });
      setCreatedKey(res);
      setError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create API key');
      }
    },
  });

  const handleClose = () => {
    setCreatedKey(null);
    setName('');
    setKind(ApiKeyKind.SERVER);
    setOriginsText('http://localhost:3000');
    setError(null);
    setCopiedSecret(false);
    setCopiedSnippet(false);
    onClose();
  };

  const widgetUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/widget.js` : 'http://localhost:3000/widget.js';
  const snippet = createdKey
    ? `<script src="${widgetUrl}" data-key="${createdKey.secret}"></script>`
    : '';

  const copyToClipboard = async (text: string, type: 'secret' | 'snippet') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        // ignore
      }
    }
    if (type === 'secret') {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } else {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {createdKey ? 'API Key Created' : 'Create New API Key'}
          </DialogTitle>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-5 py-2">
            <div className="rounded-md bg-amber-50 p-4 border border-amber-200 dark:border-amber-900/50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-sm flex gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold">Save your key now</p>
                <p className="text-xs mt-1">
                  This secret is shown only once and cannot be retrieved later. If you lose it, you will need to create a new key.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                API Secret Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  data-testid="key-secret"
                  value={createdKey.secret}
                  className="flex-1 rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <Button
                  type="button"
                  data-testid="copy-secret-btn"
                  onClick={() => copyToClipboard(createdKey.secret, 'secret')}
                  className="flex items-center gap-1.5"
                >
                  {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedSecret ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {createdKey.kind === ApiKeyKind.WIDGET && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1.5">
                  <Code className="h-4 w-4" />
                  Embed Script Snippet
                </label>
                <div className="space-y-2">
                  <pre
                    data-testid="widget-snippet"
                    className="p-3 rounded-md bg-gray-900 text-gray-100 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
                  >
                    {snippet}
                  </pre>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="copy-snippet-btn"
                    onClick={() => copyToClipboard(snippet, 'snippet')}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    {copiedSnippet ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSnippet ? 'Copied Snippet' : 'Copy Snippet'}
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" data-testid="close-created-modal-btn" onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4 py-2"
          >
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key Name <span className="text-red-500">*</span>
              </label>
              <Input
                data-testid="key-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production Backend or Support Widget"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key Type <span className="text-red-500">*</span>
              </label>
              <select
                data-testid="key-kind-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as ApiKeyKind)}
                className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value={ApiKeyKind.SERVER}>SERVER - For backend API access (/v1/ask)</option>
                <option value={ApiKeyKind.WIDGET}>WIDGET - For embedding public chat widget</option>
              </select>
            </div>

            {kind === ApiKeyKind.WIDGET && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Allowed Origins <span className="text-red-500">*</span>
                </label>
                <textarea
                  data-testid="allowed-origins-input"
                  value={originsText}
                  onChange={(e) => setOriginsText(e.target.value)}
                  placeholder="e.g. http://localhost:3000, https://example.com"
                  rows={2}
                  className="w-full rounded-md border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 font-mono text-xs"
                  required={kind === ApiKeyKind.WIDGET}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Enter 1 to 5 origins (comma-separated). Must be https:// or http://localhost without trailing slash.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="submit-create-key-btn"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Key'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
