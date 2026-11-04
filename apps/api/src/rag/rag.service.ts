import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AnswerOutcome,
  ErrorCode,
  Limits,
  LockedCopy,
  MessageRole,
  MessageStatus,
  PrincipalType,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { Principal } from '../common/principal.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { RetrievalService, RetrievedPassage } from './retrieval.service.js';
import {
  SYSTEM_PROMPT,
  CONDENSE_SYSTEM_PROMPT,
  NO_ANSWER_SENTINEL,
  buildUserPrompt,
} from './prompts.js';
import { CostCalculator } from './cost.js';
import { LlmProvider, LlmChatMessage } from './llm/llm.provider.js';
import { FakeLlmProvider } from './llm/fake.provider.js';
import { AnthropicProvider } from './llm/anthropic.provider.js';
import { OpenAiProvider } from './llm/openai.provider.js';

export interface AskStreamSink {
  writeMeta(meta: {
    chatId: string;
    userMessageId: string;
    messageId: string;
    modelId: string;
    questionsRemaining?: number;
  }): void;
  writeToken(token: string): void;
  writeCitations(data: {
    content: string;
    outcome: AnswerOutcome;
    citations: Array<{
      id: string;
      index: number;
      fileName: string;
      page?: number | null;
      heading?: string | null;
      snippet?: string | null;
    }>;
  }): void;
  writeDone(data: {
    messageId: string;
    status: MessageStatus;
    totalMs: number;
  }): void;
  writeError(data: {
    code: string;
    message: string;
  }): void;
}

export interface AskOptions {
  principal: Principal;
  chatId: string;
  question: string;
  sink?: AskStreamSink;
  abortSignal?: AbortSignal;
  persist?: boolean;
}

export interface AskResult {
  chatId: string;
  messageId: string;
  content: string;
  outcome: AnswerOutcome;
  citations: Array<{
    id: string;
    index: number;
    fileName: string;
    page?: number | null;
    heading?: string | null;
    snippet?: string | null;
  }>;
}

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly fakeLlmProvider: FakeLlmProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly openAiProvider: OpenAiProvider,
  ) {}

  private getChatProvider(modelId: string): LlmProvider {
    if (process.env.LLM_PROVIDER === 'fake') {
      return this.fakeLlmProvider;
    }
    if (modelId === 'gpt-4o-mini') {
      return this.openAiProvider;
    }
    return this.anthropicProvider;
  }

  private getEmbeddingProvider(): LlmProvider {
    if (process.env.LLM_PROVIDER === 'fake') {
      return this.fakeLlmProvider;
    }
    return this.openAiProvider;
  }

  async ask(options: AskOptions): Promise<AskResult | void> {
    const {
      principal,
      chatId,
      sink,
      abortSignal,
      persist = true,
    } = options;

    const trimmedQuestion = (options.question || '').trim();
    if (trimmedQuestion.length === 0 || trimmedQuestion.length > 2000) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'Question must be between 1 and 2000 characters',
        HttpStatus.BAD_REQUEST,
      );
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat || chat.workspaceId !== principal.workspaceId) {
      throw new ApiException(
        ErrorCode.CHAT_NOT_FOUND,
        'Chat not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (principal.type === PrincipalType.USER && chat.userId !== principal.userId) {
      throw new ApiException(
        ErrorCode.CHAT_NOT_FOUND,
        'Chat not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      (principal.type === PrincipalType.VISITOR || principal.type === PrincipalType.WIDGET) &&
      chat.visitorId !== principal.visitorId
    ) {
      throw new ApiException(
        ErrorCode.CHAT_NOT_FOUND,
        'Chat not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (principal.type === PrincipalType.API_KEY && chat.apiKeyId !== principal.apiKeyId) {
      throw new ApiException(
        ErrorCode.CHAT_NOT_FOUND,
        'Chat not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: chat.workspaceId },
    });
    const modelId = workspace?.modelId || 'claude-sonnet-5-5';

    const startTime = Date.now();
    let firstTokenMs: number | null = null;
    let userMessageId = '';
    let assistantMessageId = '';
    let questionsRemaining: number | undefined = undefined;

    if (persist) {
      if (
        (principal.type === PrincipalType.VISITOR ||
          principal.type === PrincipalType.WIDGET) &&
        principal.visitorId
      ) {
        const isWidget = principal.type === PrincipalType.WIDGET;
        try {
          const res = await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${principal.visitorId}))`,
            );

            const sessionLimit = isWidget
              ? Limits.WIDGET_QUESTIONS_PER_SESSION_24H
              : Limits.DEMO_QUESTIONS_PER_SESSION_24H;
            const ipLimit = isWidget
              ? Limits.WIDGET_QUESTIONS_PER_IP_24H
              : Limits.DEMO_QUESTIONS_PER_IP_24H;

            const copyMessage = isWidget
              ? LockedCopy.WIDGET_LIMIT
              : LockedCopy.DEMO_LIMIT;

            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const sessionMessages = await tx.message.findMany({
              where: {
                chat: { visitorId: principal.visitorId },
                role: MessageRole.ASSISTANT,
                status: {
                  in: [
                    MessageStatus.STREAMING,
                    MessageStatus.COMPLETE,
                    MessageStatus.STOPPED,
                  ],
                },
                createdAt: { gte: since },
              },
              orderBy: { createdAt: 'asc' },
            });

            if (sessionMessages.length >= sessionLimit) {
              const oldest = sessionMessages[0];
              const resetsAt = new Date(
                oldest.createdAt.getTime() + 24 * 60 * 60 * 1000,
              ).toISOString();
              throw new ApiException(
                ErrorCode.DEMO_LIMIT_REACHED,
                copyMessage,
                HttpStatus.TOO_MANY_REQUESTS,
                {
                  limit: sessionLimit,
                  scope: 'session',
                  resetsAt,
                },
              );
            }

            let ipMessagesCount = 0;
            if (principal.ipHash) {
              const ipMessages = await tx.message.findMany({
                where: {
                  chat: { ipHash: principal.ipHash },
                  role: MessageRole.ASSISTANT,
                  status: {
                    in: [
                      MessageStatus.STREAMING,
                      MessageStatus.COMPLETE,
                      MessageStatus.STOPPED,
                    ],
                  },
                  createdAt: { gte: since },
                },
                orderBy: { createdAt: 'asc' },
              });

              ipMessagesCount = ipMessages.length;

              if (ipMessages.length >= ipLimit) {
                const oldest = ipMessages[0];
                const resetsAt = new Date(
                  oldest.createdAt.getTime() + 24 * 60 * 60 * 1000,
                ).toISOString();
                throw new ApiException(
                  ErrorCode.DEMO_LIMIT_REACHED,
                  copyMessage,
                  HttpStatus.TOO_MANY_REQUESTS,
                  {
                    limit: ipLimit,
                    scope: 'ip',
                    resetsAt,
                  },
                );
              }
            }

            const sessionRemaining = sessionLimit - (sessionMessages.length + 1);
            const ipRemaining = ipLimit - (ipMessagesCount + 1);
            const rem = Math.max(0, Math.min(sessionRemaining, ipRemaining));

            const userMsg = await tx.message.create({
              data: {
                chatId,
                workspaceId: chat.workspaceId,
                role: MessageRole.USER,
                content: trimmedQuestion,
                status: MessageStatus.COMPLETE,
              },
            });

            const assistantMsg = await tx.message.create({
              data: {
                chatId,
                workspaceId: chat.workspaceId,
                role: MessageRole.ASSISTANT,
                content: '',
                status: MessageStatus.STREAMING,
                question: trimmedQuestion,
                modelId,
              },
            });

            return {
              userMessageId: userMsg.id,
              assistantMessageId: assistantMsg.id,
              questionsRemaining: rem,
            };
          });

          userMessageId = res.userMessageId;
          assistantMessageId = res.assistantMessageId;
          questionsRemaining = res.questionsRemaining;
        } catch (err: unknown) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            throw new ApiException(
              ErrorCode.CHAT_BUSY,
              'A message is already streaming in this chat',
              HttpStatus.CONFLICT,
            );
          }
          throw err;
        }
      } else {
        const userMsg = await this.prisma.message.create({
          data: {
            chatId,
            workspaceId: chat.workspaceId,
            role: MessageRole.USER,
            content: trimmedQuestion,
            status: MessageStatus.COMPLETE,
          },
        });
        userMessageId = userMsg.id;

        try {
          const assistantMsg = await this.prisma.message.create({
            data: {
              chatId,
              workspaceId: chat.workspaceId,
              role: MessageRole.ASSISTANT,
              content: '',
              status: MessageStatus.STREAMING,
              question: trimmedQuestion,
              modelId,
            },
          });
          assistantMessageId = assistantMsg.id;
        } catch (err: unknown) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            throw new ApiException(
              ErrorCode.CHAT_BUSY,
              'A message is already streaming in this chat',
              HttpStatus.CONFLICT,
            );
          }
          throw err;
        }
      }

      sink?.writeMeta({
        chatId,
        userMessageId,
        messageId: assistantMessageId,
        modelId,
        ...(questionsRemaining !== undefined ? { questionsRemaining } : {}),
      });
    }

    // Step 2: History Condensation
    let searchText = trimmedQuestion;
    let condensePromptTokens = 0;
    let condenseCompletionTokens = 0;

    const historyMessages = await this.prisma.message.findMany({
      where: {
        chatId,
        status: MessageStatus.COMPLETE,
        ...(userMessageId ? { id: { notIn: [userMessageId, assistantMessageId] } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    historyMessages.reverse();

    if (historyMessages.length > 0) {
      const condenseTurns: LlmChatMessage[] = [
        { role: 'system', content: CONDENSE_SYSTEM_PROMPT },
        ...historyMessages.map((m) => ({
          role: m.role.toLowerCase() as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: trimmedQuestion },
      ];

      const provider = this.getChatProvider(modelId);
      const condenseResult = await provider.chat({
        modelId,
        messages: condenseTurns,
        temperature: 0,
        maxTokens: 100,
        abortSignal,
      });

      condensePromptTokens = condenseResult.promptTokens;
      condenseCompletionTokens = condenseResult.completionTokens;
      if (condenseResult.content.trim().length > 0) {
        searchText = condenseResult.content.trim();
      }
    }

    // Step 3: Embed search query
    const embeddingProvider = this.getEmbeddingProvider();
    const [queryEmbedding] = await embeddingProvider.embed([searchText]);
    const embeddingTokens = Math.max(1, Math.ceil(searchText.length / 4));

    // Step 4 & 5: Retrieval & Relevance Gate
    const retrieval = await this.retrievalService.retrieve(
      principal,
      searchText,
      queryEmbedding,
    );

    if (!retrieval.meetsRelevanceGate || retrieval.passages.length === 0) {
      const totalMs = Date.now() - startTime;
      firstTokenMs = totalMs;

      const costMicros = CostCalculator.calculateCost({
        modelId,
        promptTokens: condensePromptTokens,
        completionTokens: condenseCompletionTokens,
        embeddingTokens,
      });

      if (persist && assistantMessageId) {
        await this.prisma.message.update({
          where: { id: assistantMessageId },
          data: {
            status: MessageStatus.COMPLETE,
            outcome: AnswerOutcome.UNANSWERED,
            content: LockedCopy.NO_ANSWER,
            promptTokens: condensePromptTokens,
            completionTokens: condenseCompletionTokens,
            embeddingTokens,
            costMicros,
            firstTokenMs,
            totalMs,
          },
        });
        await this.updateChatTitle(chatId, trimmedQuestion);
      }

      sink?.writeCitations({
        content: LockedCopy.NO_ANSWER,
        outcome: AnswerOutcome.UNANSWERED,
        citations: [],
      });
      sink?.writeDone({
        messageId: assistantMessageId,
        status: MessageStatus.COMPLETE,
        totalMs,
      });

      return {
        chatId,
        messageId: assistantMessageId,
        content: LockedCopy.NO_ANSWER,
        outcome: AnswerOutcome.UNANSWERED,
        citations: [],
      };
    }

    // Step 6: Build Prompt
    const passagesForPrompt = retrieval.passages.map((p, idx) => ({
      index: idx + 1,
      fileName: p.fileName,
      page: p.page,
      heading: p.heading,
      text: p.text,
    }));

    const userPrompt = buildUserPrompt(passagesForPrompt, trimmedQuestion);
    const chatTurns: LlmChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMessages.map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userPrompt },
    ];

    // Step 7: Stream with 14-char holdback
    const provider = this.getChatProvider(modelId);
    let heldBuffer = '';
    let rawGeneratedText = '';
    let sentinelDetected = false;
    let clientAborted = false;

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        clientAborted = true;
      });
    }

    try {
      const tokenStream = provider.streamChat({
        modelId,
        messages: chatTurns,
        temperature: 0.2,
        maxTokens: 800,
        abortSignal,
      });

      for await (const token of tokenStream) {
        if (clientAborted) break;
        rawGeneratedText += token;

        if (heldBuffer.length < 14) {
          heldBuffer += token;
          if (heldBuffer.length >= 14) {
            if (heldBuffer.startsWith(NO_ANSWER_SENTINEL)) {
              sentinelDetected = true;
              break;
            } else {
              if (firstTokenMs === null) {
                firstTokenMs = Date.now() - startTime;
              }
              sink?.writeToken(heldBuffer);
            }
          }
        } else {
          if (firstTokenMs === null) {
            firstTokenMs = Date.now() - startTime;
          }
          sink?.writeToken(token);
        }
      }

      if (!sentinelDetected && !clientAborted && heldBuffer.length < 14 && heldBuffer.length > 0) {
        if (firstTokenMs === null) {
          firstTokenMs = Date.now() - startTime;
        }
        sink?.writeToken(heldBuffer);
      }
    } catch {
      if (clientAborted || abortSignal?.aborted) {
        clientAborted = true;
      } else {
        const totalMs = Date.now() - startTime;
        if (persist && assistantMessageId) {
          await this.prisma.message.update({
            where: { id: assistantMessageId },
            data: {
              status: MessageStatus.ERROR,
              totalMs,
            },
          });
        }
        sink?.writeError({
          code: ErrorCode.LLM_UNAVAILABLE,
          message: LockedCopy.LLM_UNAVAILABLE,
        });
        return;
      }
    }

    const totalMs = Date.now() - startTime;
    if (firstTokenMs === null) {
      firstTokenMs = totalMs;
    }

    // Step 10: Client Abort Handling
    if (clientAborted) {
      const promptTokens =
        condensePromptTokens + Math.max(1, Math.ceil(userPrompt.length / 4));
      const completionTokens =
        condenseCompletionTokens + Math.max(1, Math.ceil(rawGeneratedText.length / 4));
      const costMicros = CostCalculator.calculateCost({
        modelId,
        promptTokens,
        completionTokens,
        embeddingTokens,
      });

      const { validIndices } = this.extractMarkerIndices(
        rawGeneratedText,
        retrieval.passages.length,
      );
      if (persist && assistantMessageId) {
        await this.persistCitations(assistantMessageId, validIndices, retrieval.passages);
        await this.prisma.message.update({
          where: { id: assistantMessageId },
          data: {
            status: MessageStatus.STOPPED,
            content: rawGeneratedText,
            promptTokens,
            completionTokens,
            embeddingTokens,
            costMicros,
            firstTokenMs,
            totalMs,
          },
        });
        await this.updateChatTitle(chatId, trimmedQuestion);
      }
      return;
    }

    // Step 7/8: Sentinel response
    if (sentinelDetected) {
      const promptTokens =
        condensePromptTokens + Math.max(1, Math.ceil(userPrompt.length / 4));
      const completionTokens =
        condenseCompletionTokens + Math.max(1, Math.ceil(rawGeneratedText.length / 4));
      const costMicros = CostCalculator.calculateCost({
        modelId,
        promptTokens,
        completionTokens,
        embeddingTokens,
      });

      if (persist && assistantMessageId) {
        await this.prisma.message.update({
          where: { id: assistantMessageId },
          data: {
            status: MessageStatus.COMPLETE,
            outcome: AnswerOutcome.UNANSWERED,
            content: LockedCopy.NO_ANSWER,
            promptTokens,
            completionTokens,
            embeddingTokens,
            costMicros,
            firstTokenMs,
            totalMs,
          },
        });
        await this.updateChatTitle(chatId, trimmedQuestion);
      }

      sink?.writeCitations({
        content: LockedCopy.NO_ANSWER,
        outcome: AnswerOutcome.UNANSWERED,
        citations: [],
      });
      sink?.writeDone({
        messageId: assistantMessageId,
        status: MessageStatus.COMPLETE,
        totalMs,
      });

      return {
        chatId,
        messageId: assistantMessageId,
        content: LockedCopy.NO_ANSWER,
        outcome: AnswerOutcome.UNANSWERED,
        citations: [],
      };
    }

    // Step 8: Marker Processing
    const K = retrieval.passages.length;
    const { validIndices, cleanedContent } = this.extractMarkerIndices(
      rawGeneratedText,
      K,
    );

    const promptTokens =
      condensePromptTokens + Math.max(1, Math.ceil(userPrompt.length / 4));
    const completionTokens =
      condenseCompletionTokens + Math.max(1, Math.ceil(rawGeneratedText.length / 4));
    const costMicros = CostCalculator.calculateCost({
      modelId,
      promptTokens,
      completionTokens,
      embeddingTokens,
    });

    if (validIndices.length === 0) {
      if (persist && assistantMessageId) {
        await this.prisma.message.update({
          where: { id: assistantMessageId },
          data: {
            status: MessageStatus.COMPLETE,
            outcome: AnswerOutcome.UNANSWERED,
            content: LockedCopy.NO_ANSWER,
            promptTokens,
            completionTokens,
            embeddingTokens,
            costMicros,
            firstTokenMs,
            totalMs,
          },
        });
        await this.updateChatTitle(chatId, trimmedQuestion);
      }

      sink?.writeCitations({
        content: LockedCopy.NO_ANSWER,
        outcome: AnswerOutcome.UNANSWERED,
        citations: [],
      });
      sink?.writeDone({
        messageId: assistantMessageId,
        status: MessageStatus.COMPLETE,
        totalMs,
      });

      return {
        chatId,
        messageId: assistantMessageId,
        content: LockedCopy.NO_ANSWER,
        outcome: AnswerOutcome.UNANSWERED,
        citations: [],
      };
    }

    // Has valid markers
    let persistedCitations: Array<{
      id: string;
      index: number;
      fileName: string;
      page?: number | null;
      heading?: string | null;
      snippet?: string | null;
    }> = [];

    if (persist && assistantMessageId) {
      persistedCitations = await this.persistCitations(
        assistantMessageId,
        validIndices,
        retrieval.passages,
      );

      await this.prisma.message.update({
        where: { id: assistantMessageId },
        data: {
          status: MessageStatus.COMPLETE,
          outcome: AnswerOutcome.ANSWERED,
          content: cleanedContent,
          promptTokens,
          completionTokens,
          embeddingTokens,
          costMicros,
          firstTokenMs,
          totalMs,
        },
      });
      await this.updateChatTitle(chatId, trimmedQuestion);
    } else {
      persistedCitations = validIndices.map((idx) => {
        const p = retrieval.passages[idx - 1];
        return {
          id: `eval-${idx}`,
          index: idx,
          fileName: p.fileName,
          page: p.page,
          heading: p.heading,
          snippet: p.text.slice(0, 300),
        };
      });
    }

    sink?.writeCitations({
      content: cleanedContent,
      outcome: AnswerOutcome.ANSWERED,
      citations: persistedCitations,
    });
    sink?.writeDone({
      messageId: assistantMessageId,
      status: MessageStatus.COMPLETE,
      totalMs,
    });

    return {
      chatId,
      messageId: assistantMessageId,
      content: cleanedContent,
      outcome: AnswerOutcome.ANSWERED,
      citations: persistedCitations,
    };
  }

  private extractMarkerIndices(
    text: string,
    K: number,
  ): { validIndices: number[]; cleanedContent: string } {
    const validSet = new Set<number>();
    const cleanedContent = text.replace(/\[(\d+)\]/g, (match, p1) => {
      const n = Number(p1);
      if (n >= 1 && n <= K) {
        validSet.add(n);
        return match;
      }
      return '';
    });

    const validIndices = Array.from(validSet).sort((a, b) => a - b);
    return { validIndices, cleanedContent };
  }

  private async persistCitations(
    messageId: string,
    validIndices: number[],
    passages: RetrievedPassage[],
  ): Promise<
    Array<{
      id: string;
      index: number;
      fileName: string;
      page?: number | null;
      heading?: string | null;
      snippet?: string | null;
    }>
  > {
    const created: Array<{
      id: string;
      index: number;
      fileName: string;
      page?: number | null;
      heading?: string | null;
      snippet?: string | null;
    }> = [];

    for (const idx of validIndices) {
      const p = passages[idx - 1];
      if (!p) continue;

      const row = await this.prisma.messageCitation.create({
        data: {
          messageId,
          index: idx,
          chunkId: p.id,
          documentId: p.documentId,
          fileName: p.fileName,
          page: p.page,
          heading: p.heading,
          snippet: p.text.slice(0, 300),
        },
      });

      created.push({
        id: row.id,
        index: row.index,
        fileName: row.fileName,
        page: row.page,
        heading: row.heading,
        snippet: row.snippet,
      });
    }

    return created;
  }

  private async updateChatTitle(chatId: string, question: string): Promise<void> {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) return;

    const data: Prisma.ChatUpdateInput = {
      updatedAt: new Date(),
    };
    if (!chat.title) {
      data.title = question.slice(0, 60);
    }
    await this.prisma.chat.update({
      where: { id: chatId },
      data,
    });
  }
}
