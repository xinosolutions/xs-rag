import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { WorkspaceRole } from '@xs-rag/shared';
import { PrincipalGuard } from '../common/principal.guard.js';
import {
  WorkspaceMemberGuard,
  RolesGuard,
  Roles,
} from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AnalyticsService, AnalyticsPeriod } from './analytics.service.js';

const analyticsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});

type AnalyticsQueryDto = {
  period: AnalyticsPeriod;
};

@Controller('workspaces/:wid/analytics')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
@Roles(WorkspaceRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  async getAnalytics(
    @Param('wid') wid: string,
    @Query(new ZodPipe(analyticsQuerySchema)) query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getAnalytics(wid, query.period);
  }
}
