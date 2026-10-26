import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { getEnv } from './config/env.js';

async function bootstrap() {
  const env = getEnv();
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  await app.listen(env.API_PORT);
}

bootstrap();
