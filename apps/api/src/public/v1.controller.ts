import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  ApiKeyKind,
  ErrorCode,
  LockedCopy,
  PrincipalType,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Principal } from '../common/principal.js';
import { RagService } from '../rag/rag.service.js';
import { UsageLimitService } from './usage-limit.service.js';

const v1AskSchema = z.object({
  question: z.string().trim().min(1, 'Question is required').max(2000, 'Question too long'),
  chatId: z.string().uuid().optional(),
});

@Controller('v1')
export class V1Controller {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly usageLimitService: UsageLimitService,
  ) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async ask(
    @Body(new ZodPipe(v1AskSchema)) body: z.infer<typeof v1AskSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiException(
        ErrorCode.API_KEY_INVALID,
        'API key required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const key = authHeader.substring(7).trim();
    if (!key || !key.startsWith('xsrag_sk_')) {
      throw new ApiException(
        ErrorCode.API_KEY_INVALID,
        'Invalid API key',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey || apiKey.kind !== ApiKeyKind.SERVER) {
      throw new ApiException(
        ErrorCode.API_KEY_INVALID,
        'Invalid API key',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    // Rate limiting per API key
    const rateLimit = parseInt(process.env.V1_RATE_PER_MIN || '60', 10);
    const rateCheck = this.usageLimitService.checkV1RateLimit(apiKey.id, rateLimit, 60);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', rateCheck.retryAfter.toString());
      throw new ApiException(
        ErrorCode.RATE_LIMITED,
        LockedCopy.RATE_LIMITED,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let targetChatId: string;
    if (body.chatId) {
      const existingChat = await this.prisma.chat.findUnique({
        where: { id: body.chatId },
      });

      if (
        !existingChat ||
        existingChat.workspaceId !== apiKey.workspaceId ||
        existingChat.apiKeyId !== apiKey.id
      ) {
        throw new ApiException(
          ErrorCode.CHAT_NOT_FOUND,
          'Chat not found',
          HttpStatus.NOT_FOUND,
        );
      }
      targetChatId = existingChat.id;
    } else {
      const newChat = await this.prisma.chat.create({
        data: {
          workspaceId: apiKey.workspaceId,
          principalType: PrincipalType.API_KEY,
          apiKeyId: apiKey.id,
        },
      });
      targetChatId = newChat.id;
    }

    const principal: Principal = {
      type: PrincipalType.API_KEY,
      apiKeyId: apiKey.id,
      workspaceId: apiKey.workspaceId,
    };

    const result = await this.ragService.ask({
      principal,
      chatId: targetChatId,
      question: body.question,
      persist: true,
    });

    return {
      chatId: result!.chatId,
      messageId: result!.messageId,
      content: result!.content,
      outcome: result!.outcome,
      citations: (result!.citations || []).map((c) => ({
        index: c.index,
        fileName: c.fileName,
        page: c.page ?? null,
        heading: c.heading ?? null,
        snippet: c.snippet ?? null,
      })),
    };
  }
}
