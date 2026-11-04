import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmProvider,
  LlmCompletionParams,
  LlmChatResult,
} from './llm.provider.js';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      });
    }
    return this.client;
  }

  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error('Anthropic provider does not support text embeddings directly.');
  }

  async *streamChat(params: LlmCompletionParams): AsyncIterable<string> {
    const client = this.getClient();
    const systemMessage = params.messages.find((m) => m.role === 'system')?.content || '';
    const nonSystemMessages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const stream = await client.messages.stream({
      model: params.modelId === 'claude-haiku-5-5' ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022',
      max_tokens: params.maxTokens || 800,
      temperature: params.temperature ?? 0.2,
      system: systemMessage,
      messages: nonSystemMessages,
    });

    for await (const chunk of stream) {
      if (params.abortSignal?.aborted) {
        stream.controller.abort();
        throw new Error('Aborted');
      }
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        yield chunk.delta.text;
      }
    }
  }

  async chat(params: LlmCompletionParams): Promise<LlmChatResult> {
    const client = this.getClient();
    const systemMessage = params.messages.find((m) => m.role === 'system')?.content || '';
    const nonSystemMessages = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await client.messages.create({
      model: params.modelId === 'claude-haiku-5-5' ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022',
      max_tokens: params.maxTokens || 100,
      system: systemMessage,
      messages: nonSystemMessages,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    } as any);

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      content,
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    };
  }
}
