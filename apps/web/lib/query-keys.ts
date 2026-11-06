export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  workspaces: {
    all: ['workspaces'] as const,
    detail: (wid: string) => ['workspaces', wid] as const,
    settings: (wid: string) => ['workspaces', wid, 'settings'] as const,
    members: (wid: string) => ['workspaces', wid, 'members'] as const,
    invitations: (wid: string) => ['workspaces', wid, 'invitations'] as const,
  },
  documents: {
    list: (wid: string, status?: string) => ['workspaces', wid, 'documents', { status }] as const,
    detail: (wid: string, docId: string) => ['workspaces', wid, 'documents', docId] as const,
    passages: (wid: string, docId: string) => ['workspaces', wid, 'documents', docId, 'passages'] as const,
  },
  chats: {
    all: (wid: string) => ['workspaces', wid, 'chats'] as const,
    detail: (wid: string, chatId: string) => ['workspaces', wid, 'chats', chatId] as const,
  },
  citations: {
    passage: (wid: string, citationId: string) => ['workspaces', wid, 'citations', citationId, 'passage'] as const,
  },
  aiModels: {
    all: ['ai-models'] as const,
  },
  invitations: {
    preview: (token: string) => ['invitations', token] as const,
  },
  eval: {
    questions: (wid: string) => ['workspaces', wid, 'eval', 'questions'] as const,
    runs: (wid: string) => ['workspaces', wid, 'eval', 'runs'] as const,
    run: (wid: string, runId: string) => ['workspaces', wid, 'eval', 'runs', runId] as const,
    compare: (wid: string, baseRunId: string, otherRunId: string) =>
      ['workspaces', wid, 'eval', 'compare', { baseRunId, otherRunId }] as const,
  },
  feedback: {
    list: (wid: string, rating?: string) => ['workspaces', wid, 'feedback', { rating }] as const,
  },
  analytics: {
    data: (wid: string, period?: string) => ['workspaces', wid, 'analytics', { period }] as const,
  },
  apiKeys: {
    list: (wid: string) => ['workspaces', wid, 'api-keys'] as const,
  },
} as const;
