import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { ChatsService } from './chats.service.js';

@Controller('workspaces/:wid/citations')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard)
export class CitationsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get(':citationId/passage')
  async getPassage(
    @Param('wid') wid: string,
    @Param('citationId') citationId: string,
    @Req() req: Request,
  ) {
    return this.chatsService.getCitationPassage(req.principal!, wid, citationId);
  }
}
