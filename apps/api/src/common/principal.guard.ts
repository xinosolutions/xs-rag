import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ErrorCode, PrincipalType } from '@xs-rag/shared';
import { TokenService } from '../auth/token.service.js';
import { ApiException } from './error-envelope.filter.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const cookieToken = request.cookies?.xs_access;
    const authHeader = request.headers.authorization;
    let token: string | undefined = undefined;

    if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim() !== '') {
      token = cookieToken.trim();
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    if (!token) {
      if (isPublic) {
        return true;
      }
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      if (!payload.sub || payload.typ !== 'access') {
        if (isPublic) return true;
        throw new ApiException(
          ErrorCode.AUTH_REQUIRED,
          'Invalid authentication token',
          HttpStatus.UNAUTHORIZED,
        );
      }

      request.principal = {
        type: PrincipalType.USER,
        userId: payload.sub,
      };
      return true;
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        throw err;
      }

      const errName = (err as { name?: string })?.name;
      if (errName === 'TokenExpiredError') {
        if (isPublic) return true;
        throw new ApiException(
          ErrorCode.AUTH_TOKEN_EXPIRED,
          'Access token expired',
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (isPublic) return true;
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Invalid authentication token',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
