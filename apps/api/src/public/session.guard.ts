import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode, PrincipalType } from '@xs-rag/shared';
import { ApiException } from '../common/error-envelope.filter.js';
import { SessionsService } from './sessions.service.js';
import { UsageLimitService } from './usage-limit.service.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly usageLimitService: UsageLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Session token required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Session token required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const payload = this.sessionsService.verifySessionToken(token);

    request.principal = {
      type: payload.pt as unknown as PrincipalType,
      visitorId: payload.vid,
      workspaceId: payload.wid,
      ipHash: this.usageLimitService.getIpHash(request),
    };

    return true;
  }
}
