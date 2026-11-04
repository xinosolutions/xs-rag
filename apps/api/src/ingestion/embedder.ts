import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { DocumentFailureCode } from '@xs-rag/shared';
import { getEnv, Env } from '../config/env.js';
import { FakeLlmProvider } from '../rag/llm/fake.provider.js';
import { ChunkItem } from './chunker.js';
import { IngestionError } from './extractors/web.extractor.js';

@Injectable()
export class Embedder {
  private openai: OpenAI | null = null;

  constructor(private readonly fakeLlmProvider: FakeLlmProvider) {}

  async embedChunks(chunks: ChunkItem[]): Promise<number[][]> {
    const env = getEnv();
    const texts = chunks.map((c) => c.embeddingInput);
    if (texts.length === 0) return [];

    const batchSize = 64;
    const allVectors: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchVectors = await this.embedWithRetry(batch, env);
      allVectors.push(...batchVectors);
    }

    return allVectors;
  }

  private async embedWithRetry(batch: string[], env: Env): Promise<number[][]> {
    const delays = [1000, 2000, 4000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        if (env.LLM_PROVIDER === 'fake') {
          return await this.fakeLlmProvider.embed(batch);
        }

        if (!this.openai) {
          this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
        }

        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch,
        });

        return response.data.map((item) => item.embedding);
      } catch (err: unknown) {
        lastError = err;
        if (attempt < delays.length) {
          const delay = delays[attempt]!;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new IngestionError(
      DocumentFailureCode.EMBED_FAILED,
      `Embedding provider failed after retries: ${(lastError as Error)?.message || 'unknown error'}`,
    );
  }
}
