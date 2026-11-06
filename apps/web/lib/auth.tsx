'use client';

import React, { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WorkspaceRole } from '@xs-rag/shared';
import { apiClient } from './api-client';
import { queryKeys } from './query-keys';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceMembership {
  workspaceId: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
}

export interface AuthMeResponse {
  user: User;
  memberships: WorkspaceMembership[];
}

interface AuthContextValue {
  user: User | null;
  memberships: WorkspaceMembership[];
  isLoading: boolean;
  isError: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<unknown>;
  getRole: (workspaceId: string) => WorkspaceRole | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<AuthMeResponse>({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      return apiClient.get<AuthMeResponse>('/auth/me');
    },
    retry: false,
    staleTime: 60 * 1000,
  });

  const user = data?.user ?? null;
  const memberships = data?.memberships ?? [];

  const getRole = (workspaceId: string): WorkspaceRole | null => {
    const membership = memberships.find((m) => m.workspaceId === workspaceId);
    return membership ? membership.role : null;
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      queryClient.clear();
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        isLoading,
        isError,
        logout,
        refetch,
        getRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
