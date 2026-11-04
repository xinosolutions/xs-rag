import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard } from '../common/roles.decorator.js';
import { DocumentAccessService } from '../documents/document-access.service.js';
import { RagModule } from '../rag/rag.module.js';
import { EvalModule } from '../eval/eval.module.js';
import { ChatsService } from './chats.service.js';
import { ChatsController } from './chats.controller.js';
import { MessagesController } from './messages.controller.js';
import { CitationsController } from './citations.controller.js';
import { FeedbackController } from './feedback.controller.js';

@Module({
  imports: [AuthModule, RagModule, EvalModule],
  controllers: [
    ChatsController,
    MessagesController,
    CitationsController,
    FeedbackController,
  ],
  providers: [
    PrismaService,
    DocumentAccessService,
    ChatsService,
    PrincipalGuard,
    WorkspaceMemberGuard,
    RolesGuard,
  ],
  exports: [ChatsService],
})
export class ChatsModule {}
