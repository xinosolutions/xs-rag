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

/** 'query' for search queries, 'document' for indexed chunks (providers may ignore it). */
export type EmbedTaskType = 'query' | 'document';

export interface LlmProvider {
  embed(texts: string[], taskType?: EmbedTaskType): Promise<number[][]>;
  streamChat(params: LlmCompletionParams): AsyncIterable<string>;
  chat(params: LlmCompletionParams): Promise<LlmChatResult>;
}
