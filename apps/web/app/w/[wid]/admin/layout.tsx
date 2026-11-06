'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { WorkspaceRole, LockedCopy } from '@xs-rag/shared';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const { getRole, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-gray-500">Checking permissions...</div>;
  }

  const role = getRole(wid);

  if (role !== WorkspaceRole.ADMIN) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm dark:border-red-900 dark:bg-gray-900">
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Access Denied</h1>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
            {LockedCopy.NOT_ALLOWED}
          </p>
          <Link href={`/w/${wid}/chat`}>
            <Button variant="primary" size="sm">
              Return to Chat
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
