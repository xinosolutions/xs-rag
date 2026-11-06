'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatInputProps {
  onSendMessage: (question: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({
  onSendMessage,
  onStop,
  isStreaming,
  disabled = false,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStreaming) {
      onStop();
      return;
    }

    const trimmed = input.trim();
    if (!trimmed || disabled) return;

    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <form onSubmit={handleSubmit} className="flex items-end gap-2 max-w-4xl mx-auto">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            data-testid="chat-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            disabled={disabled || isStreaming}
            className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 min-h-[42px] max-h-36"
          />
        </div>

        {isStreaming ? (
          <Button
            type="button"
            data-testid="stop-btn"
            variant="danger"
            onClick={onStop}
            className="flex items-center gap-1.5 h-[42px] px-4"
          >
            <Square className="h-4 w-4 fill-current" />
            <span>Stop</span>
          </Button>
        ) : (
          <Button
            type="submit"
            data-testid="send-btn"
            variant="primary"
            disabled={disabled || !input.trim()}
            className="flex items-center gap-1.5 h-[42px] px-4"
          >
            <Send className="h-4 w-4" />
            <span>Send</span>
          </Button>
        )}
      </form>
    </div>
  );
}
