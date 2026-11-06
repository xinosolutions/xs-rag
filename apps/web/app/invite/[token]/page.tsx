'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkspaceRole, LockedCopy } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

interface InvitationPreview {
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
}

interface AcceptResponse {
  workspaceId: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = typeof params.token === 'string' ? params.token : '';
  const { user, isLoading: authLoading } = useAuth();

  const [acceptError, setAcceptError] = useState<string | null>(null);

  const {
    data: invitation,
    isLoading: inviteLoading,
    error: inviteError,
  } = useQuery<InvitationPreview>({
    queryKey: queryKeys.invitations.preview(token),
    queryFn: async () => {
      return apiClient.get<InvitationPreview>(`/invitations/${token}`);
    },
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post<AcceptResponse>(`/invitations/${token}/accept`);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      router.push(`/w/${res.workspaceId}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setAcceptError(err.message);
      } else {
        setAcceptError(LockedCopy.GENERIC_ERROR);
      }
    },
  });

  if (inviteLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-sm text-gray-500">Loading invitation...</div>
      </div>
    );
  }

  if (inviteError || !invitation) {
    const errorMsg =
      inviteError instanceof ApiClientError
        ? inviteError.message
        : 'Invitation not found or has expired.';
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation Error</CardTitle>
          </CardHeader>
          <CardContent>
            <div role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          </CardContent>
          <CardFooter>
            <Link href="/login" className="w-full">
              <Button variant="secondary" className="w-full">
                Go to Sign In
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isEmailMatch = user && user.email.toLowerCase() === invitation.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>
            You have been invited to join <strong>{invitation.workspaceName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {acceptError && (
            <div
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
            >
              {acceptError}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-900 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Workspace</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{invitation.workspaceName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Invited Email</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{invitation.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Role</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{invitation.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Expires</span>
              <span className="text-gray-700 dark:text-gray-300">
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {!user ? (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-center text-gray-500">
                Please sign in as <strong>{invitation.email}</strong> to accept this invitation.
              </p>
              <Link href={`/login?next=/invite/${token}`} className="block w-full">
                <Button className="w-full">Sign in to accept</Button>
              </Link>
              <Link href={`/register?next=/invite/${token}`} className="block w-full">
                <Button variant="outline" className="w-full">Create account</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {!isEmailMatch && (
                <div className="rounded-md bg-yellow-50 p-3 text-xs text-yellow-800 border border-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800">
                  You are signed in as <strong>{user.email}</strong>, but this invitation was sent to{' '}
                  <strong>{invitation.email}</strong>.
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending}
              >
                {acceptMutation.isPending ? 'Accepting...' : 'Accept Invitation'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
