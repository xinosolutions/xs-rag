'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceRole } from '@xs-rag/shared';
import { useAuth } from '@/lib/auth';

export default function WorkspaceIndexPage() {
  const params = useParams();
  const router = useRouter();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const { getRole, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      const role = getRole(wid);
      if (role === WorkspaceRole.ADMIN) {
        router.replace(`/w/${wid}/admin/documents`);
      } else {
        router.replace(`/w/${wid}/chat`);
      }
    }
  }, [isLoading, getRole, wid, router]);

  return <div className="p-8 text-center text-sm text-gray-500">Redirecting...</div>;
}
