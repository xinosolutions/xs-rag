const MAILPIT_API = 'http://localhost:8025/api/v1';

export interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string; Name: string }>;
  Snippet: string;
}

export interface MailpitMessageDetail {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

export async function clearMailbox(): Promise<void> {
  try {
    await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
  } catch {
    // Ignore errors if mailpit not reachable
  }
}

export async function waitForEmail(
  toEmail?: string,
  timeoutMs = 10000,
): Promise<{ text: string; html: string; link?: string }> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${MAILPIT_API}/messages`);
      if (res.ok) {
        const data = (await res.json()) as { messages: MailpitMessage[] };
        const messages = data.messages || [];

        const match = messages.find((m) =>
          !toEmail ? true : m.To?.some((t) => t.Address.toLowerCase() === toEmail.toLowerCase()),
        );

        if (match) {
          const detailRes = await fetch(`${MAILPIT_API}/message/${match.ID}`);
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as MailpitMessageDetail;
            const text = detail.Text || '';
            const html = detail.HTML || '';

            // Extract link matching http://localhost:3000/...
            const linkMatch =
              text.match(/https?:\/\/[^\s]+/i) || html.match(/href="(https?:\/\/[^"]+)"/i);
            const link = linkMatch ? linkMatch[1] || linkMatch[0] : undefined;

            return { text, html, link };
          }
        }
      }
    } catch {
      // Retry
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  throw new Error(`Timed out waiting for email to ${toEmail || 'anyone'}`);
}
