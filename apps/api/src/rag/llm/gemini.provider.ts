import { Injectable } from '@nestjs/common';
import { GoogleGenAI, type Content } from '@google/genai';
import {
  EmbedTaskType,
  LlmProvider,
  LlmCompletionParams,
  LlmChatResult,
} from './llm.provider.js';

/**
 * Must match the pgvector column `Chunk.embedding vector(1536)`.
 * gemini-embedding-001 supports Matryoshka truncation via outputDimensionality,
 * so we request exactly 1536 dims and L2-normalise them (Google recommends
 * normalising any dimension other than the native 3072).
 */
export const EMBEDDING_DIMENSIONS = 1536;

// gemini-2.5-flash is no longer offered to new API keys (404), so default to the 3.5 Flash line.
export const DEFAULT_GEMINI_CHAT_MODEL = 'gemini-3.5-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (!norm) return vector;
  return vector.map((v) => v / norm);
}

/** Splits our provider-neutral messages into Gemini's systemInstruction + contents. */
export function toGeminiContents(messages: LlmCompletionParams['messages']): {
  systemInstruction?: string;
  contents: Content[];
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const contents: Content[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  return { systemInstruction: system || undefined, contents };
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    }
    return this.client;
  }

  private chatModel(): string {
    return process.env.GEMINI_CHAT_MODEL || DEFAULT_GEMINI_CHAT_MODEL;
  }

  private embeddingModel(): string {
    return process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_GEMINI_EMBEDDING_MODEL;
  }

  private thinkingConfig(): { thinkingBudget: number } | undefined {
    const raw = process.env.GEMINI_THINKING_BUDGET;
    // Default 0: answers are grounded in retrieved passages, and thinking tokens
    // would otherwise eat into small maxOutputTokens budgets (e.g. the judge).
    const budget = raw === undefined || raw === '' ? 0 : Number(raw);
    return Number.isFinite(budget) ? { thinkingBudget: budget } : undefined;
  }

  async embed(texts: string[], taskType: EmbedTaskType = 'document'): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.getClient().models.embedContent({
      model: this.embeddingModel(),
      contents: texts,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: taskType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
      },
    });
    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(
        `Gemini returned ${embeddings.length} embeddings for ${texts.length} inputs`,
      );
    }
    return embeddings.map((e) => {
      const values = e.values ?? [];
      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Gemini embedding has ${values.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
        );
      }
      return l2Normalize(values);
    });
  }

  async *streamChat(params: LlmCompletionParams): AsyncIterable<string> {
    const { systemInstruction, contents } = toGeminiContents(params.messages);
    const stream = await this.getClient().models.generateContentStream({
      model: this.chatModel(),
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: params.maxTokens || 800,
        temperature: params.temperature ?? 0.2,
        thinkingConfig: this.thinkingConfig(),
        abortSignal: params.abortSignal,
      },
    });

    for await (const chunk of stream) {
      if (params.abortSignal?.aborted) {
        throw new Error('Aborted');
      }
      const token = chunk.text;
      if (token) {
        yield token;
      }
    }
  }

  async chat(params: LlmCompletionParams): Promise<LlmChatResult> {
    const { systemInstruction, contents } = toGeminiContents(params.messages);
    const response = await this.getClient().models.generateContent({
      model: this.chatModel(),
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: params.maxTokens || 100,
        temperature: params.temperature ?? 0,
        thinkingConfig: this.thinkingConfig(),
        abortSignal: params.abortSignal,
      },
    });

    return {
      content: response.text || '',
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
    };
  }
}
