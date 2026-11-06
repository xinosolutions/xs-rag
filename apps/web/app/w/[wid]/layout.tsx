'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { WorkspaceRole } from '@xs-rag/shared';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const { user, memberships, getRole, logout, isLoading } = useAuth();

  const role = getRole(wid);
  const isAdmin = role === WorkspaceRole.ADMIN;
  const currentWorkspace = memberships.find((m) => m.workspaceId === wid);
  const workspaceTitle = currentWorkspace ? currentWorkspace.name : 'Workspace';

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-sm text-gray-500">Loading workspace...</div>
      </div>
    );
  }

  const memberNavItems = [
    { label: 'Chat', href: `/w/${wid}/chat` },
  ];

  const adminNavItems = [
    { label: 'Documents', href: `/w/${wid}/admin/documents` },
    { label: 'Members', href: `/w/${wid}/admin/members` },
    { label: 'Settings', href: `/w/${wid}/admin/settings` },
    { label: 'Evaluation', href: `/w/${wid}/admin/evaluation` },
    { label: 'Feedback', href: `/w/${wid}/admin/feedback` },
    { label: 'Analytics', href: `/w/${wid}/admin/analytics` },
    { label: 'API Access', href: `/w/${wid}/admin/api-access` },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <Link
            href="/w"
            className="text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &larr; Workspaces
          </Link>
          <h2 className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100 truncate" title={workspaceTitle}>
            {workspaceTitle}
          </h2>
          {role && (
            <span
              className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                isAdmin
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
              }`}
            >
              {role}
            </span>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Navigation
          </div>
          {memberNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Admin
              </div>
              {adminNavItems.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="text-xs text-gray-500 truncate mb-2">{user?.email}</div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => logout()}>
            Log out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
