'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ChatContainer } from '@/components/chat/chat-container';

export default function ChatPage() {
  const params = useParams();
  const wid = typeof params.wid === 'string' ? params.wid : '';

  return <ChatContainer wid={wid} />;
}
