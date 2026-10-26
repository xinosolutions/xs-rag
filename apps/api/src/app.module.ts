import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { ErrorEnvelopeFilter } from './common/error-envelope.filter.js';
import { FakeLlmProvider } from './rag/llm/fake.provider.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ErrorEnvelopeFilter,
    },
    FakeLlmProvider,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
