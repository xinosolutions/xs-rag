import { Injectable, HttpStatus } from '@nestjs/common';
import crypto from 'node:crypto';
import { ApiKeyKind, ErrorCode, PrincipalType } from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { getEnv } from '../config/env.js';
import { TokenService, SessionTokenPayload } from '../auth/token.service.js';
import { UsageLimitService } from './usage-limit.service.js';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageLimitService: UsageLimitService,
    private readonly tokenService: TokenService,
  ) {}

  async createSession(body: { widgetKey?: string }, ipHash: string) {
    let workspaceId: string;
    let pt: PrincipalType;

    if (body.widgetKey) {
      const keyHash = crypto
        .createHash('sha256')
        .update(body.widgetKey)
        .digest('hex');

      const apiKey = await this.prisma.apiKey.findUnique({
        where: { keyHash },
      });

      if (!apiKey || apiKey.kind !== ApiKeyKind.WIDGET) {
        throw new ApiException(
          ErrorCode.WIDGET_NOT_FOUND,
          'Widget key not found',
          HttpStatus.NOT_FOUND,
        );
      }

      await this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      });

      workspaceId = apiKey.workspaceId;
      pt = PrincipalType.WIDGET;
    } else {
      const demoSlug = getEnv().DEMO_WORKSPACE_SLUG;
      let demoWs = await this.prisma.workspace.findUnique({
        where: { slug: demoSlug },
      });

      if (!demoWs) {
        demoWs = await this.prisma.workspace.findFirst({
          where: { isDemo: true },
        });
      }

      if (!demoWs) {
        throw new ApiException(
          ErrorCode.WORKSPACE_NOT_FOUND,
          'Demo workspace not found',
          HttpStatus.NOT_FOUND,
        );
      }

      workspaceId = demoWs.id;
      pt = PrincipalType.VISITOR;
    }

    const vid = crypto.randomUUID();
    const isWidget = pt === PrincipalType.WIDGET;

    const questionsRemaining =
      await this.usageLimitService.getRemainingQuestions({
        visitorId: vid,
        ipHash,
        isWidget,
      });

    const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;

    const sessionToken = this.tokenService.generateSessionToken({
      pt: pt as 'VISITOR' | 'WIDGET',
      wid: workspaceId,
      vid,
    });

    return {
      sessionToken,
      expiresAt: new Date(expiresAtMs).toISOString(),
      questionsRemaining,
    };
  }

  verifySessionToken(token: string): SessionTokenPayload {
    try {
      const decoded = this.tokenService.verifySessionToken(token);

      if (
        !decoded ||
        decoded.typ !== 'session' ||
        !decoded.wid ||
        !decoded.vid ||
        !decoded.pt ||
        (decoded.pt !== 'VISITOR' && decoded.pt !== 'WIDGET')
      ) {
        throw new ApiException(
          ErrorCode.AUTH_REQUIRED,
          'Invalid session token',
          HttpStatus.UNAUTHORIZED,
        );
      }

      return decoded;
    } catch (err: unknown) {
      if (err instanceof ApiException) throw err;
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Invalid or expired session token',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
