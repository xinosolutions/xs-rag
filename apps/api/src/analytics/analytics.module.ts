import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import {
  WorkspaceMemberGuard,
  RolesGuard,
} from '../common/roles.decorator.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    PrismaService,
    PrincipalGuard,
    WorkspaceMemberGuard,
    RolesGuard,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
