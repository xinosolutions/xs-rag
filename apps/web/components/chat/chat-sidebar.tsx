'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';

export interface ChatSummary {
  id: string;
  title?: string | null;
  updatedAt: string;
}

interface ChatSidebarProps {
  wid: string;
  activeChatId?: string | null;
}

export function ChatSidebar({ wid, activeChatId }: ChatSidebarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ data: ChatSummary[]; nextCursor?: string | null }>({
    queryKey: queryKeys.chats.all(wid),
    queryFn: () => apiClient.get<{ data: ChatSummary[]; nextCursor?: string | null }>(`/workspaces/${wid}/chats`),
    enabled: Boolean(wid),
  });

  const chats = data?.data || [];

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await apiClient.delete(`/workspaces/${wid}/chats/${chatId}`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chats.all(wid) });
      if (activeChatId === chatId) {
        router.push(`/w/${wid}/chat`);
      }
    } catch {
      // Invalidate anyway
      await queryClient.invalidateQueries({ queryKey: queryKeys.chats.all(wid) });
    }
  };

  return (
    <aside className="w-64 border-r border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50 flex flex-col h-full shrink-0">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <Link href={`/w/${wid}/chat`}>
          <Button variant="outline" size="sm" className="w-full flex items-center justify-center gap-1.5">
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
          History
        </div>

        {isLoading ? (
          <div className="px-3 py-2 text-xs text-gray-400">Loading chats...</div>
        ) : chats.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">No earlier chats</div>
        ) : (
          chats.map((chat) => {
            const isActive = activeChatId === chat.id;
            return (
              <div
                key={chat.id}
                data-testid="chat-item"
                className={`group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100/70 text-blue-900 dark:bg-blue-950 dark:text-blue-200'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                <Link
                  href={`/w/${wid}/chat/${chat.id}`}
                  className="flex items-center gap-2 truncate flex-1 mr-2"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-gray-600 dark:text-gray-500" />
                  <span className="truncate">{chat.title || 'Untitled chat'}</span>
                </Link>

                <button
                  type="button"
                  data-testid="delete-chat-btn"
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity p-1 text-gray-400"
                  title="Delete chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Delete</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
