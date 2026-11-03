import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PrincipalGuard } from '../common/principal.guard.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Roles, RolesGuard, WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { WorkspacesService } from './workspaces.service.js';
import { updateSettingsSchema } from './workspaces.dto.js';
import type { UpdateSettingsDto } from './workspaces.dto.js';

@Controller('workspaces/:wid/settings')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
@Roles('ADMIN')
export class SettingsController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async getSettings(@Param('wid') wid: string) {
    return this.workspacesService.getSettings(wid);
  }

  @Patch()
  async updateSettings(
    @Param('wid') wid: string,
    @Body(new ZodPipe(updateSettingsSchema)) dto: UpdateSettingsDto,
  ) {
    return this.workspacesService.updateSettings(wid, dto);
  }
}
