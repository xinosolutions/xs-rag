export interface LlmChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmCompletionParams {
  modelId: string;
  messages: LlmChatMessage[];
  abortSignal?: AbortSignal;
}

export interface LlmProvider {
  embed(texts: string[]): Promise<number[][]>;
  streamChat(params: LlmCompletionParams): AsyncIterable<string>;
}
