import { Injectable } from '@nestjs/common';
import { LlmProvider, LlmCompletionParams } from './llm.provider.js';
import { createHash } from 'crypto';

@Injectable()
export class FakeLlmProvider implements LlmProvider {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generateDeterministicVector(text, 1536));
  }

  async *streamChat(params: LlmCompletionParams): AsyncIterable<string> {
    const lastMessage = params.messages[params.messages.length - 1]?.content || '';

    if (lastMessage.includes('__FAIL__')) {
      throw new Error('Fake LLM Provider simulated failure');
    }

    if (lastMessage.includes('__NO_ANSWER__')) {
      yield "I don't know based on the documents available to you.";
      return;
    }

    const tokens = ['Based ', 'on the ', 'policy, ', 'here is ', 'the answer [[doc:1]].'];

    for (const token of tokens) {
      if (params.abortSignal?.aborted) {
        throw new Error('Aborted');
      }

      if (lastMessage.includes('__SLOW__')) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }

      yield token;
    }
  }

  private generateDeterministicVector(text: string, dim: number): number[] {
    const hash = createHash('sha256').update(text).digest();
    const vec: number[] = new Array(dim);
    let norm = 0;

    for (let i = 0; i < dim; i++) {
      const byte = hash[i % hash.length]!;
      const val = (byte / 255.0) * 2 - 1; // Range -1..1
      vec[i] = val;
      norm += val * val;
    }

    // Normalize to unit vector for cosine distance
    norm = Math.sqrt(norm);
    for (let i = 0; i < dim; i++) {
      vec[i] = vec[i]! / (norm || 1);
    }

    return vec;
  }
}
