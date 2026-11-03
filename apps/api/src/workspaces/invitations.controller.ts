import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrincipalGuard } from '../common/principal.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Roles, RolesGuard, WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { WorkspacesService } from './workspaces.service.js';
import { inviteMemberSchema } from './workspaces.dto.js';
import type { InviteMemberDto } from './workspaces.dto.js';

@Controller()
export class InvitationsController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('workspaces/:wid/invitations')
  @UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
  @Roles('ADMIN')
  async listInvitations(@Param('wid') wid: string) {
    return this.workspacesService.listInvitations(wid);
  }

  @Post('workspaces/:wid/invitations')
  @UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @Param('wid') wid: string,
    @Req() req: Request,
    @Body(new ZodPipe(inviteMemberSchema)) dto: InviteMemberDto,
  ) {
    const callerUserId = req.principal!.userId!;
    return this.workspacesService.createInvitation(wid, callerUserId, dto);
  }

  @Delete('workspaces/:wid/invitations/:invitationId')
  @UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelInvitation(
    @Param('wid') wid: string,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    return this.workspacesService.cancelInvitation(wid, invitationId);
  }

  @Get('invitations/:token')
  async previewInvitation(@Param('token') token: string) {
    return this.workspacesService.previewInvitation(token);
  }

  @Post('invitations/:token/accept')
  @UseGuards(PrincipalGuard)
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(@Param('token') token: string, @Req() req: Request) {
    const userId = req.principal!.userId!;
    return this.workspacesService.acceptInvitation(token, userId);
  }
}
