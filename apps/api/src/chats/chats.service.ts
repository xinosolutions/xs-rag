import { Injectable, HttpStatus, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  FeedbackRating,
  MessageRole,
  MessageStatus,
  PrincipalType,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { Principal } from '../common/principal.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { DocumentAccessService } from '../documents/document-access.service.js';
import { encodeCursor, decodeCursor } from '../common/pagination.js';

@Injectable()
export class ChatsService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.prisma.message.updateMany({
        where: { status: MessageStatus.STREAMING },
        data: { status: MessageStatus.ERROR },
      });
    } catch {
      // Ignore during initial migrations / setup
    }
  }

  async createChat(principal: Principal, wid: string) {
    const chat = await this.prisma.chat.create({
      data: {
        workspaceId: wid,
        principalType: principal.type,
        userId: principal.userId ?? null,
        visitorId: principal.visitorId ?? null,
        apiKeyId: principal.apiKeyId ?? null,
      },
    });

    return {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  async listChats(
    principal: Principal,
    wid: string,
    query: { cursor?: string; limit?: number },
  ) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const where: Prisma.ChatWhereInput = {
      workspaceId: wid,
      ...(principal.userId ? { userId: principal.userId } : {}),
      ...(principal.visitorId ? { visitorId: principal.visitorId } : {}),
      ...(principal.apiKeyId ? { apiKeyId: principal.apiKeyId } : {}),
    };

    const decodedCursor = query.cursor ? decodeCursor<string>(query.cursor) : null;

    const items = await this.prisma.chat.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(decodedCursor ? { cursor: { id: decodedCursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    let nextCursor: string | null = null;
    let data = items;
    if (items.length > limit) {
      data = items.slice(0, limit);
      nextCursor = encodeCursor(data[data.length - 1].id);
    }

    return {
      data,
      nextCursor,
    };
  }

  async getChat(principal: Principal, wid: string, chatId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            citations: {
              orderBy: { index: 'asc' },
            },
            feedback: true,
          },
        },
      },
    });

    if (!chat || chat.workspaceId !== wid) {
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

    // Load documents for citations to verify availability
    const documentIds = new Set<string>();
    chat.messages.forEach((m) => {
      m.citations.forEach((c) => {
        if (c.documentId) documentIds.add(c.documentId);
      });
    });

    const docs = await this.prisma.document.findMany({
      where: { id: { in: Array.from(documentIds) } },
      include: { access: true },
    });
    const docMap = new Map(docs.map((d) => [d.id, d]));

    const formattedMessages = chat.messages.map((m) => {
      const myFeedback = m.feedback.find(
        (f) => principal.userId && f.userId === principal.userId,
      );

      const citations = m.citations.map((c) => {
        const doc = c.documentId ? docMap.get(c.documentId) : null;
        const available =
          !!doc &&
          doc.status === 'READY' &&
          this.documentAccessService.canAccessDocument(principal, doc);

        return {
          id: c.id,
          index: c.index,
          fileName: c.fileName,
          page: c.page,
          heading: c.heading,
          snippet: available ? c.snippet : null,
          available,
        };
      });

      return {
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        outcome: m.outcome,
        modelId: m.modelId,
        createdAt: m.createdAt,
        citations,
        myFeedback: myFeedback
          ? { rating: myFeedback.rating, comment: myFeedback.comment }
          : null,
      };
    });

    return {
      id: chat.id,
      title: chat.title,
      messages: formattedMessages,
    };
  }

  async deleteChat(principal: Principal, wid: string, chatId: string): Promise<void> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat || chat.workspaceId !== wid) {
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

    await this.prisma.chat.delete({
      where: { id: chatId },
    });
  }

  async rateMessage(
    principal: Principal,
    wid: string,
    messageId: string,
    rating: FeedbackRating,
    comment?: string,
  ) {
    if (!principal.userId) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: true },
    });

    if (!message || message.chat.workspaceId !== wid || message.chat.userId !== principal.userId) {
      throw new ApiException(
        ErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (message.role !== MessageRole.ASSISTANT) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'Can only rate assistant messages',
        HttpStatus.BAD_REQUEST,
      );
    }

    const fb = await this.prisma.feedback.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId: principal.userId,
        },
      },
      update: {
        rating,
        comment: comment ?? null,
      },
      create: {
        workspaceId: wid,
        messageId,
        userId: principal.userId,
        rating,
        comment: comment ?? null,
      },
    });

    return {
      rating: fb.rating,
      comment: fb.comment,
    };
  }

  async getCitationPassage(principal: Principal, wid: string, citationId: string) {
    const citation = await this.prisma.messageCitation.findUnique({
      where: { id: citationId },
      include: {
        message: {
          include: { chat: true },
        },
      },
    });

    if (
      !citation ||
      citation.message.chat.workspaceId !== wid ||
      (principal.type === PrincipalType.USER && citation.message.chat.userId !== principal.userId) ||
      ((principal.type === PrincipalType.VISITOR || principal.type === PrincipalType.WIDGET) &&
        citation.message.chat.visitorId !== principal.visitorId)
    ) {
      throw new ApiException(
        ErrorCode.PASSAGE_NOT_FOUND,
        'Passage not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!citation.documentId || !citation.chunkId) {
      throw new ApiException(
        ErrorCode.PASSAGE_NOT_FOUND,
        'Passage not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const doc = await this.prisma.document.findUnique({
      where: { id: citation.documentId },
      include: { access: true },
    });

    if (!doc || !this.documentAccessService.canAccessDocument(principal, doc)) {
      throw new ApiException(
        ErrorCode.PASSAGE_NOT_FOUND,
        'Passage not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const chunk = await this.prisma.chunk.findUnique({
      where: { id: citation.chunkId },
    });

    if (!chunk) {
      throw new ApiException(
        ErrorCode.PASSAGE_NOT_FOUND,
        'Passage not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      citationId: citation.id,
      documentId: citation.documentId,
      fileName: citation.fileName,
      page: citation.page,
      heading: citation.heading,
      text: chunk.text,
    };
  }

  async listFeedback(
    principal: Principal,
    wid: string,
    query: { rating?: FeedbackRating; cursor?: string; limit?: number },
  ) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const where: Prisma.FeedbackWhereInput = {
      workspaceId: wid,
      ...(query.rating ? { rating: query.rating } : {}),
    };

    const decodedCursor = query.cursor ? decodeCursor<string>(query.cursor) : null;

    const items = await this.prisma.feedback.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(decodedCursor ? { cursor: { id: decodedCursor }, skip: 1 } : {}),
      include: {
        user: {
          select: { id: true, name: true },
        },
        message: {
          select: {
            id: true,
            question: true,
            content: true,
            outcome: true,
            modelId: true,
            citations: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    let data = items;
    if (items.length > limit) {
      data = items.slice(0, limit);
      nextCursor = encodeCursor(data[data.length - 1].id);
    }

    const formatted = data.map((fb) => ({
      id: fb.id,
      rating: fb.rating,
      comment: fb.comment,
      createdAt: fb.createdAt,
      user: fb.user,
      message: fb.message,
    }));

    return {
      data: formatted,
      nextCursor,
    };
  }
}
