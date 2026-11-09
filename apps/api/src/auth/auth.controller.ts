import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { Public } from '../common/public.decorator.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.dto.js';
import type {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.dto.js';

const authLimit = parseInt(process.env.THROTTLE_AUTH_PER_MIN || '10', 10);

@Controller('auth')
@UseGuards(PrincipalGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodPipe(registerSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: authLimit, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodPipe(loginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.xs_refresh;
    const result = await this.authService.refresh(refreshToken);
    this.tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.xs_refresh;
    await this.authService.logout(refreshToken);
    this.tokenService.clearAuthCookies(res);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body(new ZodPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ) {
    await this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ) {
    await this.authService.resetPassword(dto);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() req: Request) {
    const userId = req.principal!.userId!;
    return this.authService.getMe(userId);
  }
}
