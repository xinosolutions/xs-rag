const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SessionResponse {
  sessionToken: string;
  expiresAt: string;
  questionsRemaining: number;
}

let cachedSessionToken: string | null = null;
let cachedExpiresAt: string | null = null;
let cachedWidgetKey: string | undefined = undefined;

export async function getPublicSessionToken(widgetKey?: string): Promise<{
  sessionToken: string;
  questionsRemaining: number;
}> {
  // Check if current cached token is still valid (with 60s buffer)
  if (
    cachedSessionToken &&
    cachedExpiresAt &&
    cachedWidgetKey === widgetKey &&
    new Date(cachedExpiresAt).getTime() > Date.now() + 60000
  ) {
    return {
      sessionToken: cachedSessionToken,
      questionsRemaining: 0, // not refreshed if cached
    };
  }

  const res = await fetch(`${API_BASE}/public/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(widgetKey ? { widgetKey } : {}),
  });

  if (!res.ok) {
    let errMsg = 'Failed to create public session';
    try {
      const err = await res.json();
      if (err?.error?.message) errMsg = err.error.message;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const data = (await res.json()) as SessionResponse;
  cachedSessionToken = data.sessionToken;
  cachedExpiresAt = data.expiresAt;
  cachedWidgetKey = widgetKey;

  return {
    sessionToken: data.sessionToken,
    questionsRemaining: data.questionsRemaining,
  };
}

export function getCurrentSessionToken(): string | null {
  return cachedSessionToken;
}

export function clearPublicSession(): void {
  cachedSessionToken = null;
  cachedExpiresAt = null;
  cachedWidgetKey = undefined;
}
