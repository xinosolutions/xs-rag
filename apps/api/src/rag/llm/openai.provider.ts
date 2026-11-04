import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import {
  LlmProvider,
  LlmCompletionParams,
  LlmChatResult,
} from './llm.provider.js';

@Injectable()
export class OpenAiProvider implements LlmProvider {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || '',
      });
    }
    return this.client;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const client = this.getClient();
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    return response.data.map((item) => item.embedding);
  }

  async *streamChat(params: LlmCompletionParams): AsyncIterable<string> {
    const client = this.getClient();
    const stream = await client.chat.completions.create({
      model: params.modelId === 'gpt-4o-mini' ? 'gpt-4o-mini' : 'gpt-4o-mini',
      max_tokens: params.maxTokens || 800,
      temperature: params.temperature ?? 0.2,
      messages: params.messages,
      stream: true,
    });

    for await (const chunk of stream) {
      if (params.abortSignal?.aborted) {
        throw new Error('Aborted');
      }
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        yield token;
      }
    }
  }

  async chat(params: LlmCompletionParams): Promise<LlmChatResult> {
    const client = this.getClient();
    const response = await client.chat.completions.create({
      model: params.modelId === 'gpt-4o-mini' ? 'gpt-4o-mini' : 'gpt-4o-mini',
      max_tokens: params.maxTokens || 100,
      temperature: params.temperature ?? 0,
      messages: params.messages,
      stream: false,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content || '';

    return {
      content,
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
    };
  }
}
