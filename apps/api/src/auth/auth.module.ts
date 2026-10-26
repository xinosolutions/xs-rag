import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { MailService } from './mail.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import { getEnv } from '../config/env.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = getEnv();
        return {
          secret: env.JWT_SECRET,
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MailService,
    PrismaService,
    PrincipalGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    MailService,
    PrismaService,
    PrincipalGuard,
  ],
})
export class AuthModule {}
