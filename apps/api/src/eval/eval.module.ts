import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard } from '../common/roles.decorator.js';
import { DocumentAccessService } from '../documents/document-access.service.js';
import { RagModule } from '../rag/rag.module.js';
import { JudgeService } from './judge.service.js';
import { EvalService } from './eval.service.js';
import { EvalController } from './eval.controller.js';

@Module({
  imports: [AuthModule, RagModule],
  controllers: [EvalController],
  providers: [
    PrismaService,
    DocumentAccessService,
    JudgeService,
    EvalService,
    PrincipalGuard,
    WorkspaceMemberGuard,
    RolesGuard,
  ],
  exports: [EvalService, JudgeService],
})
export class EvalModule {}
