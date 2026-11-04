import {
  Controller,
  Put,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { FeedbackRating } from '@xs-rag/shared';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard, Roles } from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ChatsService } from './chats.service.js';
import { EvalService } from '../eval/eval.service.js';

const rateMessageBodySchema = z.object({
  rating: z.nativeEnum(FeedbackRating),
  comment: z.string().max(500).optional(),
});

const listFeedbackQuerySchema = z.object({
  rating: z.nativeEnum(FeedbackRating).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createEvalFromFeedbackSchema = z.object({
  expectedAnswer: z
    .string()
    .trim()
    .min(1, 'expectedAnswer is required')
    .max(2000, 'expectedAnswer is too long'),
  expectedDocumentIds: z.array(z.string()).optional(),
});

@Controller('workspaces/:wid')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard)
export class FeedbackController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly evalService: EvalService,
  ) {}

  @Put('messages/:messageId/feedback')
  async rateMessage(
    @Param('wid') wid: string,
    @Param('messageId') messageId: string,
    @Body(new ZodPipe(rateMessageBodySchema))
    body: z.infer<typeof rateMessageBodySchema>,
    @Req() req: Request,
  ) {
    return this.chatsService.rateMessage(
      req.principal!,
      wid,
      messageId,
      body.rating,
      body.comment,
    );
  }

  @Get('feedback')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async listFeedback(
    @Param('wid') wid: string,
    @Query(new ZodPipe(listFeedbackQuerySchema))
    query: z.infer<typeof listFeedbackQuerySchema>,
    @Req() req: Request,
  ) {
    return this.chatsService.listFeedback(req.principal!, wid, query);
  }

  @Post('feedback/:feedbackId/eval-question')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async createEvalQuestion(
    @Param('wid') wid: string,
    @Param('feedbackId') feedbackId: string,
    @Body(new ZodPipe(createEvalFromFeedbackSchema))
    body: z.infer<typeof createEvalFromFeedbackSchema>,
  ) {
    return this.evalService.createFromFeedback(wid, feedbackId, body);
  }
}
