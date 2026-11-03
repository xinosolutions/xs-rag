import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard } from '../common/roles.decorator.js';
import { WorkspacesController } from './workspaces.controller.js';
import { MembersController } from './members.controller.js';
import { InvitationsController } from './invitations.controller.js';
import { SettingsController } from './settings.controller.js';
import { AiModelsController } from './ai-models.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    WorkspacesController,
    MembersController,
    InvitationsController,
    SettingsController,
    AiModelsController,
  ],
  providers: [
    WorkspacesService,
    PrismaService,
    WorkspaceMemberGuard,
    RolesGuard,
    PrincipalGuard,
  ],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
