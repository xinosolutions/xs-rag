'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FileText,
  Globe,
  FileCode,
  Sparkles,
  HelpCircle,
  ArrowLeft,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicChatView } from '@/components/chat/public-chat-view';

export interface DemoDocument {
  id: string;
  title: string;
  sourceType: string;
}

export interface DemoData {
  workspaceName: string;
  documents: DemoDocument[];
  suggestedQuestions: string[];
  limit: {
    perSession: number;
    windowHours: number;
  };
}

interface DemoViewProps {
  demoData: DemoData;
}

export function DemoView({ demoData }: DemoViewProps) {
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  const getSourceIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'WEB':
        return <Globe className="h-4 w-4 text-emerald-600 shrink-0" />;
      case 'MARKDOWN':
        return <FileCode className="h-4 w-4 text-purple-600 shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-blue-600 shrink-0" />;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Top Navigation */}
      <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6 dark:border-gray-800 dark:bg-gray-900 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Home</span>
          </Link>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{demoData.workspaceName}</span>
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Public Demo
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-xs">
              <LogIn className="h-3.5 w-3.5 mr-1" />
              Sign In
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="text-xs">
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Create Account
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Sample Documents & Suggested Questions */}
        <aside className="hidden lg:flex w-80 xl:w-96 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/50 overflow-y-auto shrink-0">
          <div className="p-4 space-y-6">
            {/* Demo Notice */}
            <div className="rounded-lg bg-blue-50/70 p-3.5 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                Live RAG Exploration
              </div>
              <p className="text-blue-700/90 dark:text-blue-300/90 leading-relaxed">
                Test the grounded question-answering pipeline without signing in. Up to {demoData.limit.perSession} questions per session.
              </p>
            </div>

            {/* Sample Documents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Sample Documents ({demoData.documents.length})
                </h2>
              </div>
              <div className="space-y-1.5">
                {demoData.documents.map((doc) => (
                  <div
                    key={doc.id}
                    data-testid="demo-document-item"
                    className="flex items-center justify-between p-2 rounded-md border border-gray-100 bg-gray-50/50 hover:bg-gray-100/70 dark:border-gray-800 dark:bg-gray-800/30 text-xs text-gray-800 dark:text-gray-200 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      {getSourceIcon(doc.sourceType)}
                      <span className="truncate font-medium">{doc.title}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-gray-400 shrink-0">
                      {doc.sourceType}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Example Questions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <HelpCircle className="h-3.5 w-3.5" />
                  Example Questions ({demoData.suggestedQuestions.length})
                </h2>
              </div>
              <div className="space-y-2">
                {demoData.suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    data-testid="suggested-question"
                    onClick={() => setSelectedQuestion(q)}
                    className="w-full text-left p-2.5 rounded-lg border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-700 text-xs text-gray-700 dark:text-gray-300 transition-colors leading-relaxed group"
                  >
                    <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400 font-medium">
                      &ldquo;{q}&rdquo;
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Center: Chat Window */}
        <main className="flex flex-1 flex-col h-full min-w-0 bg-white dark:bg-gray-950">
          <PublicChatView
            isWidget={false}
            workspaceName={demoData.workspaceName}
            initialQuestion={selectedQuestion}
            onQuestionConsumed={() => setSelectedQuestion(null)}
          />
        </main>
      </div>
    </div>
  );
}
