import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ChatsService } from './chats.service.js';

const listChatsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller('workspaces/:wid/chats')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createChat(
    @Param('wid') wid: string,
    @Req() req: Request,
  ) {
    return this.chatsService.createChat(req.principal!, wid);
  }

  @Get()
  async listChats(
    @Param('wid') wid: string,
    @Req() req: Request,
    @Query(new ZodPipe(listChatsQuerySchema))
    query: z.infer<typeof listChatsQuerySchema>,
  ) {
    return this.chatsService.listChats(req.principal!, wid, query);
  }

  @Get(':chatId')
  async getChat(
    @Param('wid') wid: string,
    @Param('chatId') chatId: string,
    @Req() req: Request,
  ) {
    return this.chatsService.getChat(req.principal!, wid, chatId);
  }

  @Delete(':chatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChat(
    @Param('wid') wid: string,
    @Param('chatId') chatId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.chatsService.deleteChat(req.principal!, wid, chatId);
  }
}
