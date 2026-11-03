import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PrincipalGuard } from '../common/principal.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Roles, RolesGuard, WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { WorkspacesService } from './workspaces.service.js';
import { updateMemberRoleSchema } from './workspaces.dto.js';
import type { UpdateMemberRoleDto } from './workspaces.dto.js';

@Controller('workspaces/:wid/members')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
@Roles('ADMIN')
export class MembersController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async listMembers(
    @Param('wid') wid: string,
    @Query() query: { limit?: string | number; cursor?: string },
  ) {
    return this.workspacesService.listMembers(wid, query);
  }

  @Patch(':userId')
  async updateMemberRole(
    @Param('wid') wid: string,
    @Param('userId') userId: string,
    @Body(new ZodPipe(updateMemberRoleSchema)) dto: UpdateMemberRoleDto,
  ) {
    return this.workspacesService.updateMemberRole(wid, userId, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('wid') wid: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.workspacesService.removeMember(wid, userId);
  }
}
