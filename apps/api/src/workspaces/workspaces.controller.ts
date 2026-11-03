import {
  Controller,
  Get,
  Post,
  Patch,
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
import {
  createWorkspaceSchema,
  renameWorkspaceSchema,
} from './workspaces.dto.js';
import type {
  CreateWorkspaceDto,
  RenameWorkspaceDto,
} from './workspaces.dto.js';

@Controller('workspaces')
@UseGuards(PrincipalGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkspace(
    @Req() req: Request,
    @Body(new ZodPipe(createWorkspaceSchema)) dto: CreateWorkspaceDto,
  ) {
    const userId = req.principal!.userId!;
    return this.workspacesService.createWorkspace(userId, dto);
  }

  @Get()
  async listCallerWorkspaces(@Req() req: Request) {
    const userId = req.principal!.userId!;
    return this.workspacesService.listCallerWorkspaces(userId);
  }

  @Get(':wid')
  @UseGuards(WorkspaceMemberGuard)
  async getWorkspace(@Param('wid') wid: string, @Req() req: Request) {
    const role = req.principal?.role;
    return this.workspacesService.getWorkspace(wid, role);
  }

  @Patch(':wid')
  @UseGuards(WorkspaceMemberGuard, RolesGuard)
  @Roles('ADMIN')
  async renameWorkspace(
    @Param('wid') wid: string,
    @Req() req: Request,
    @Body(new ZodPipe(renameWorkspaceSchema)) dto: RenameWorkspaceDto,
  ) {
    const role = req.principal?.role;
    return this.workspacesService.renameWorkspace(wid, dto, role);
  }
}
