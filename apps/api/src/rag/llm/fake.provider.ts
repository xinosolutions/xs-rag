import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LlmProvider,
  LlmCompletionParams,
  LlmChatMessage,
  LlmChatResult,
} from './llm.provider.js';

export interface FakeCondenseCall {
  messages: LlmChatMessage[];
  timestamp: number;
}

@Injectable()
export class FakeLlmProvider implements LlmProvider {
  private aliases: Record<string, string> = {};
  public callCount = 0;
  public condenseCalls: FakeCondenseCall[] = [];

  constructor() {
    this.loadAliases();
  }

  public reset(): void {
    this.callCount = 0;
    this.condenseCalls = [];
  }

  private loadAliases(): void {
    try {
      const aliasPath = path.resolve('test/fixtures/embedding-aliases.json');
      if (fs.existsSync(aliasPath)) {
        const content = fs.readFileSync(aliasPath, 'utf-8');
        this.aliases = JSON.parse(content);
      }
    } catch {
      this.aliases = {};
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generateBagOfWordsVector(text, 1536));
  }

  async *streamChat(params: LlmCompletionParams): AsyncIterable<string> {
    this.callCount++;
    const lastMessage = params.messages[params.messages.length - 1]?.content || '';

    if (lastMessage.includes('__FAIL__')) {
      throw new Error('Fake LLM Provider simulated failure');
    }

    if (lastMessage.includes('__NO_ANSWER__')) {
      yield '[[NO_ANSWER]]';
      return;
    }

    if (lastMessage.includes('__NO_CITATION__')) {
      const tokens = ['Answer ', 'without ', 'citations.'];
      for (const token of tokens) {
        if (params.abortSignal?.aborted) {
          throw new Error('Aborted');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        yield token;
      }
      return;
    }

    if (lastMessage.includes('__BAD_MARKER__')) {
      const tokens = ['Text [9] ', 'and ', '[1].'];
      for (const token of tokens) {
        if (params.abortSignal?.aborted) {
          throw new Error('Aborted');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        yield token;
      }
      return;
    }

    if (lastMessage.includes('__SLOW__')) {
      for (let i = 0; i < 50; i++) {
        if (params.abortSignal?.aborted) {
          throw new Error('Aborted');
        }
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 100);
          if (params.abortSignal) {
            const onAbort = () => {
              clearTimeout(timer);
              reject(new Error('Aborted'));
            };
            if (params.abortSignal.aborted) {
              clearTimeout(timer);
              return reject(new Error('Aborted'));
            }
            params.abortSignal.addEventListener('abort', onAbort, { once: true });
          }
        });
        if (i === 49) {
          yield `token${i} [1].`;
        } else {
          yield `token${i} `;
        }
      }
      return;
    }

    const tokens = ['Answer ', 'based on the ', 'documents [1].'];

    for (const token of tokens) {
      if (params.abortSignal?.aborted) {
        throw new Error('Aborted');
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
      yield token;
    }
  }

  async chat(params: LlmCompletionParams): Promise<LlmChatResult> {
    this.callCount++;
    const isCondense = params.messages.some(
      (m) => m.role === 'system' && m.content.includes('Rewrite the final user question'),
    );

    const lastMessage = params.messages[params.messages.length - 1]?.content || '';

    if (isCondense) {
      this.condenseCalls.push({
        messages: [...params.messages],
        timestamp: Date.now(),
      });

      let condensedQuery = lastMessage;
      if (lastMessage.toLowerCase().includes('part-time')) {
        condensedQuery = 'part-time vacation allowance';
      }

      const promptTokens = Math.max(1, Math.ceil(JSON.stringify(params.messages).length / 4));
      const completionTokens = Math.max(1, Math.ceil(condensedQuery.length / 4));

      return {
        content: condensedQuery,
        promptTokens,
        completionTokens,
      };
    }

    const promptTokens = Math.max(1, Math.ceil(JSON.stringify(params.messages).length / 4));
    const completionTokens = Math.max(1, Math.ceil(lastMessage.length / 4));

    return {
      content: 'Answer based on the documents [1].',
      promptTokens,
      completionTokens,
    };
  }

  private hashWord(word: string, dim: number): number {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) >>> 0;
    }
    return hash % dim;
  }

  private generateBagOfWordsVector(text: string, dim: number): number[] {
    const words = text.toLowerCase().match(/[a-z0-9_-]+/g) || [];
    const vec: number[] = Array.from({ length: dim }, () => 0);

    for (const word of words) {
      const canonical = this.aliases[word] || word;
      const slot = this.hashWord(canonical, dim);
      vec[slot] += 1;
    }

    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        vec[i] = vec[i] / norm;
      }
    } else {
      vec[0] = 1;
    }

    return vec;
  }
}
