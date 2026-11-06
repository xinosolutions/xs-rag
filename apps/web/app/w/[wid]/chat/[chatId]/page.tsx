'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ChatContainer } from '@/components/chat/chat-container';

export default function ChatDetailPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';
  const chatId = typeof params.chatId === 'string' ? params.chatId : '';

  return <ChatContainer wid={wid} chatId={chatId} />;
}
