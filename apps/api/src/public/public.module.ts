import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { RagModule } from '../rag/rag.module.js';
import { ChatsModule } from '../chats/chats.module.js';
import { UsageLimitService } from './usage-limit.service.js';
import { SessionsService } from './sessions.service.js';
import { SessionGuard } from './session.guard.js';
import { PublicController } from './public.controller.js';
import { V1Controller } from './v1.controller.js';

@Module({
  imports: [AuthModule, RagModule, ChatsModule],
  controllers: [PublicController, V1Controller],
  providers: [
    PrismaService,
    UsageLimitService,
    SessionsService,
    SessionGuard,
  ],
  exports: [UsageLimitService, SessionsService],
})
export class PublicModule {}
