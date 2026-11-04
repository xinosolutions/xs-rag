import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HealthController } from './health.controller.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { ErrorEnvelopeFilter } from './common/error-envelope.filter.js';
import { FakeLlmProvider } from './rag/llm/fake.provider.js';
import { AuthModule } from './auth/auth.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    WorkspacesModule,
    DocumentsModule,
    IngestionModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ErrorEnvelopeFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    FakeLlmProvider,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
