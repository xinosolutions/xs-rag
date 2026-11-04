import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LlmProvider, LlmCompletionParams } from './llm.provider.js';

@Injectable()
export class FakeLlmProvider implements LlmProvider {
  private aliases: Record<string, string> = {};

  constructor() {
    this.loadAliases();
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
    const lastMessage = params.messages[params.messages.length - 1]?.content || '';

    if (lastMessage.includes('__FAIL__')) {
      throw new Error('Fake LLM Provider simulated failure');
    }

    if (lastMessage.includes('__NO_ANSWER__')) {
      yield '[[NO_ANSWER]]';
      return;
    }

    if (lastMessage.includes('__NO_CITATION__')) {
      yield 'Answer without citations.';
      return;
    }

    if (lastMessage.includes('__BAD_MARKER__')) {
      yield 'Text [9] and [1].';
      return;
    }

    const tokens = ['Answer ', 'based on the ', 'documents [1].'];

    for (const token of tokens) {
      if (params.abortSignal?.aborted) {
        throw new Error('Aborted');
      }

      if (lastMessage.includes('__SLOW__')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      yield token;
    }
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
