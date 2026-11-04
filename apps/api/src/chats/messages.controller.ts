import {
  Controller,
  Post,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AnswerOutcome, MessageStatus } from '@xs-rag/shared';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { setSseHeaders, formatSseEvent } from '../common/sse.js';
import { RagService, AskStreamSink } from '../rag/rag.service.js';

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
    outcome: AnswerOutcome;
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
    status: MessageStatus;
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

@Controller('workspaces/:wid/chats/:chatId/messages')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard)
export class MessagesController {
  constructor(private readonly ragService: RagService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async askMessage(
    @Param('wid') wid: string,
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
}
