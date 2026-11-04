import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  ApiKeyKind,
  DocumentStatus,
  DocumentVisibility,
  ErrorCode,
  Limits,
  LockedCopy,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { setSseHeaders, formatSseEvent } from '../common/sse.js';
import { getEnv } from '../config/env.js';
import { RagService, AskStreamSink } from '../rag/rag.service.js';
import { ChatsService } from '../chats/chats.service.js';
import { SessionsService } from './sessions.service.js';
import { UsageLimitService } from './usage-limit.service.js';
import { SessionGuard } from './session.guard.js';

const sessionBodySchema = z.object({
  widgetKey: z.string().trim().optional(),
});

const messageBodySchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

class ResponseSseSink implements AskStreamSink {
  private headersSent = false;
  constructor(private readonly res: Response) {}

  private ensureHeaders(): void {
    if (!this.headersSent) {
      setSseHeaders(this.res);
      this.res.flushHeaders?.();
      this.headersSent = true;
    }
  }

  writeMeta(meta: {
    chatId: string;
    userMessageId: string;
    messageId: string;
    modelId: string;
    questionsRemaining?: number;
  }): void {
    this.ensureHeaders();
    this.res.write(formatSseEvent('meta', meta));
  }

  writeToken(token: string): void {
    this.ensureHeaders();
    this.res.write(formatSseEvent('token', { text: token }));
  }

  writeCitations(data: {
    content: string;
    outcome: string;
    citations: Array<{
      id: string;
      index: number;
      fileName: string;
      page?: number | null;
      heading?: string | null;
      snippet?: string | null;
    }>;
  }): void {
    this.ensureHeaders();
    this.res.write(formatSseEvent('citations', data));
  }

  writeDone(data: {
    messageId: string;
    status: string;
    totalMs: number;
  }): void {
    this.ensureHeaders();
    this.res.write(formatSseEvent('done', data));
    this.res.end();
  }

  writeError(data: {
    code: string;
    message: string;
  }): void {
    this.ensureHeaders();
    this.res.write(formatSseEvent('error', data));
    this.res.end();
  }
}

@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly usageLimitService: UsageLimitService,
    private readonly ragService: RagService,
    private readonly chatsService: ChatsService,
  ) {}

  @Get('demo')
  async getDemoInfo() {
    const demoSlug = getEnv().DEMO_WORKSPACE_SLUG;
    let demoWs = await this.prisma.workspace.findUnique({
      where: { slug: demoSlug },
    });

    if (!demoWs) {
      demoWs = await this.prisma.workspace.findFirst({
        where: { isDemo: true },
      });
    }

    if (!demoWs) {
      throw new ApiException(
        ErrorCode.WORKSPACE_NOT_FOUND,
        'Demo workspace not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const documents = await this.prisma.document.findMany({
      where: {
        workspaceId: demoWs.id,
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.ALL_MEMBERS,
      },
      select: {
        id: true,
        title: true,
        sourceType: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      workspaceName: demoWs.name,
      documents,
      suggestedQuestions: demoWs.suggestedQuestions || [],
      limit: {
        perSession: Limits.DEMO_QUESTIONS_PER_SESSION_24H,
        windowHours: 24,
      },
    };
  }

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  async startSession(
    @Body(new ZodPipe(sessionBodySchema)) body: z.infer<typeof sessionBodySchema>,
    @Req() req: Request,
  ) {
    const ipHash = this.usageLimitService.getIpHash(req);
    return this.sessionsService.createSession(body, ipHash);
  }

  @Get('widget/:widgetKey/config')
  async getWidgetConfig(@Param('widgetKey') widgetKey: string) {
    const keyHash = crypto
      .createHash('sha256')
      .update(widgetKey)
      .digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey || apiKey.kind !== ApiKeyKind.WIDGET) {
      throw new ApiException(
        ErrorCode.WIDGET_NOT_FOUND,
        'Widget key not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const ws = await this.prisma.workspace.findUnique({
      where: { id: apiKey.workspaceId },
    });

    if (!ws) {
      throw new ApiException(
        ErrorCode.WIDGET_NOT_FOUND,
        'Widget key not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      workspaceName: ws.name,
      welcomeText: LockedCopy.CHAT_EMPTY,
      allowedOrigins: apiKey.allowedOrigins,
    };
  }

  @Post('chats')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  async createChat(@Req() req: Request) {
    const principal = req.principal!;
    const chat = await this.prisma.chat.create({
      data: {
        workspaceId: principal.workspaceId!,
        principalType: principal.type,
        visitorId: principal.visitorId!,
        ipHash: principal.ipHash,
      },
    });

    return { id: chat.id };
  }

  @Get('chats/:chatId')
  @UseGuards(SessionGuard)
  async getChat(
    @Param('chatId') chatId: string,
    @Req() req: Request,
  ) {
    const principal = req.principal!;
    const chat = await this.chatsService.getChat(
      principal,
      principal.workspaceId!,
      chatId,
    );

    return {
      id: chat.id,
      messages: chat.messages,
    };
  }

  @Post('chats/:chatId/messages')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  async askMessage(
    @Param('chatId') chatId: string,
    @Body(new ZodPipe(messageBodySchema))
    body: z.infer<typeof messageBodySchema>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    };
    req.on('close', onClose);
    res.on('close', onClose);

    const sink = new ResponseSseSink(res);

    await this.ragService.ask({
      principal: req.principal!,
      chatId,
      question: body.question,
      sink,
      abortSignal: abortController.signal,
      persist: true,
    });
  }

  @Get('citations/:citationId/passage')
  @UseGuards(SessionGuard)
  async getPassage(
    @Param('citationId') citationId: string,
    @Req() req: Request,
  ) {
    return this.chatsService.getCitationPassage(
      req.principal!,
      req.principal!.workspaceId!,
      citationId,
    );
  }
}
