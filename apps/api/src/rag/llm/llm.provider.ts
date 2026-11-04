export interface LlmChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmCompletionParams {
  modelId: string;
  messages: LlmChatMessage[];
  abortSignal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmChatResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

export interface LlmProvider {
  embed(texts: string[]): Promise<number[][]>;
  streamChat(params: LlmCompletionParams): AsyncIterable<string>;
  chat(params: LlmCompletionParams): Promise<LlmChatResult>;
}
