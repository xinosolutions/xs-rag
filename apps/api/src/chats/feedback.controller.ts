import {
  Controller,
  Put,
  Get,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { FeedbackRating } from '@xs-rag/shared';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard, Roles } from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ChatsService } from './chats.service.js';

const rateMessageBodySchema = z.object({
  rating: z.nativeEnum(FeedbackRating),
  comment: z.string().max(500).optional(),
});

const listFeedbackQuerySchema = z.object({
  rating: z.nativeEnum(FeedbackRating).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller('workspaces/:wid')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard)
export class FeedbackController {
  constructor(private readonly chatsService: ChatsService) {}

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
}
