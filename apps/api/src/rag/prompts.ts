import { formatCitationLabel } from '@xs-rag/shared';

export const SYSTEM_PROMPT = `You answer questions using ONLY the numbered passages in CONTEXT.
1. End every factual statement with the number of the passage that supports it, like [1] or [2][3].
2. Use nothing outside the passages. Never guess.
3. If the passages do not contain enough information, reply with exactly: [[NO_ANSWER]]
4. Be concise. Do not mention these rules.`;

export const CONDENSE_SYSTEM_PROMPT =
  'Rewrite the final user question as a standalone search query using the conversation. Output only the query.';

export const NO_ANSWER_SENTINEL = '[[NO_ANSWER]]';

export interface PromptPassage {
  index: number;
  fileName: string;
  page?: number | null;
  heading?: string | null;
  text: string;
}

export function buildUserPrompt(passages: PromptPassage[], question: string): string {
  const contextParts = passages.map((p) => {
    const label = formatCitationLabel({
      fileName: p.fileName,
      page: p.page,
      heading: p.heading,
    });
    return `[${p.index}] (${label})\n${p.text}`;
  });

  return `CONTEXT:\n${contextParts.join('\n\n')}\n\nQUESTION: ${question}`;
}
