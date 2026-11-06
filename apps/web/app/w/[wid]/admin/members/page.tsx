'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkspaceRole } from '@xs-rag/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

interface MemberItem {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}

interface MembersResponse {
  data: MemberItem[];
  nextCursor?: string | null;
}

interface InvitationItem {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
}

interface InvitationsResponse {
  data: InvitationItem[];
}

export default function MembersPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>(WorkspaceRole.MEMBER);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Queries
  const { data: membersData, isLoading: membersLoading } = useQuery<MembersResponse>({
    queryKey: queryKeys.workspaces.members(wid),
    queryFn: async () => {
      return apiClient.get<MembersResponse>(`/workspaces/${wid}/members`);
    },
  });

  const { data: invitesData, isLoading: invitesLoading } = useQuery<InvitationsResponse>({
    queryKey: queryKeys.workspaces.invitations(wid),
    queryFn: async () => {
      return apiClient.get<InvitationsResponse>(`/workspaces/${wid}/invitations`);
    },
  });

  // Mutations
  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: WorkspaceRole }) => {
      return apiClient.post(`/workspaces/${wid}/invitations`, { email, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(wid) });
      setInviteEmail('');
      setErrorMessage(null);
      setSuccessMessage('Invitation sent successfully.');
    },
    onError: (err: unknown) => {
      setSuccessMessage(null);
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to send invitation.');
      }
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      return apiClient.patch(`/workspaces/${wid}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(wid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      setErrorMessage(null);
      setSuccessMessage('Member role updated.');
    },
    onError: (err: unknown) => {
      setSuccessMessage(null);
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to change role.');
      }
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiClient.delete(`/workspaces/${wid}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.members(wid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      setErrorMessage(null);
      setSuccessMessage('Member removed.');
    },
    onError: (err: unknown) => {
      setSuccessMessage(null);
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to remove member.');
      }
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return apiClient.delete(`/workspaces/${wid}/invitations/${invitationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.invitations(wid) });
      setErrorMessage(null);
      setSuccessMessage('Invitation cancelled.');
    },
    onError: (err: unknown) => {
      setSuccessMessage(null);
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to cancel invitation.');
      }
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
  };

  const members = membersData?.data ?? [];
  const invitations = invitesData?.data ?? [];

  return (
    <div className="p-8 max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Members & Invitations
        </h1>
        <p className="text-sm text-gray-500">
          Manage workspace members, assign roles, and invite collaborators.
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          data-testid="error-alert"
          className="rounded-md bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="rounded-md bg-green-50 p-4 text-sm font-medium text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
        >
          {successMessage}
        </div>
      )}

      {/* Invite Member Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite New Member</CardTitle>
          <CardDescription>Send an email invitation to join this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                name="email"
                type="email"
                required
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-40">
              <select
                name="role"
                className="flex h-10 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
              >
                <option value={WorkspaceRole.MEMBER}>Member</option>
                <option value={WorkspaceRole.ADMIN}>Admin</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
            >
              {inviteMutation.isPending ? 'Inviting...' : 'Invite'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Members</CardTitle>
          <CardDescription>{members.length} member(s) in this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="p-4 text-center text-sm text-gray-500">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No members found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 text-xs font-semibold uppercase text-gray-500">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {members.map((m) => (
                    <tr key={m.userId} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                        {m.name}
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{m.email}</td>
                      <td className="py-3 px-4">
                        <select
                          className="rounded border border-gray-300 bg-background px-2 py-1 text-xs dark:border-gray-700"
                          value={m.role}
                          onChange={(e) =>
                            changeRoleMutation.mutate({
                              userId: m.userId,
                              role: e.target.value as WorkspaceRole,
                            })
                          }
                          disabled={changeRoleMutation.isPending}
                        >
                          <option value={WorkspaceRole.MEMBER}>MEMBER</option>
                          <option value={WorkspaceRole.ADMIN}>ADMIN</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {new Date(m.joinedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => removeMemberMutation.mutate(m.userId)}
                          disabled={removeMemberMutation.isPending}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending Invitations</CardTitle>
          <CardDescription>
            Invitations that have not yet been accepted
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitesLoading ? (
            <div className="p-4 text-center text-sm text-gray-500">Loading invitations...</div>
          ) : invitations.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No pending invitations.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 text-xs font-semibold uppercase text-gray-500">
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
                        {inv.email}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                          {inv.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelInviteMutation.mutate(inv.id)}
                          disabled={cancelInviteMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
