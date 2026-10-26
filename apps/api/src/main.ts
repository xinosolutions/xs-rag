import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { getEnv } from './config/env.js';

async function bootstrap() {
  const env = getEnv();
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  await app.listen(env.API_PORT);
}

bootstrap();
