import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard } from '../common/roles.decorator.js';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
  providers: [
    PrismaService,
    PrincipalGuard,
    WorkspaceMemberGuard,
    RolesGuard,
    ApiKeysService,
  ],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
