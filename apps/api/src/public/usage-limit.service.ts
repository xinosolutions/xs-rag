import { Injectable, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  Limits,
  LockedCopy,
  MessageRole,
  MessageStatus,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { getEnv } from '../config/env.js';

export function getClientIp(req: Request): string {
  const trustProxy = getEnv().TRUST_PROXY;
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
      const headerVal = Array.isArray(xff) ? xff[0] : xff;
      const firstIp = headerVal.split(',')[0].trim();
      if (firstIp) return firstIp;
    }
  }
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

export function hashIp(ip: string): string {
  const salt = getEnv().IP_HASH_SALT;
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
}

@Injectable()
export class UsageLimitService {
  // In-memory request tracker for /v1/ask rate limiting per API key
  private readonly v1RateBuckets = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  getIpHash(req: Request): string {
    const ip = getClientIp(req);
    return hashIp(ip);
  }

  async getRemainingQuestions(params: {
    visitorId?: string;
    ipHash?: string;
    isWidget: boolean;
  }): Promise<number> {
    const sessionLimit = params.isWidget
      ? Limits.WIDGET_QUESTIONS_PER_SESSION_24H
      : Limits.DEMO_QUESTIONS_PER_SESSION_24H;
    const ipLimit = params.isWidget
      ? Limits.WIDGET_QUESTIONS_PER_IP_24H
      : Limits.DEMO_QUESTIONS_PER_IP_24H;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let sessionCount = 0;
    if (params.visitorId) {
      sessionCount = await this.prisma.message.count({
        where: {
          chat: { visitorId: params.visitorId },
          role: MessageRole.ASSISTANT,
          status: {
            in: [
              MessageStatus.STREAMING,
              MessageStatus.COMPLETE,
              MessageStatus.STOPPED,
            ],
          },
          createdAt: { gte: since },
        },
      });
    }

    let ipCount = 0;
    if (params.ipHash) {
      ipCount = await this.prisma.message.count({
        where: {
          chat: { ipHash: params.ipHash },
          role: MessageRole.ASSISTANT,
          status: {
            in: [
              MessageStatus.STREAMING,
              MessageStatus.COMPLETE,
              MessageStatus.STOPPED,
            ],
          },
          createdAt: { gte: since },
        },
      });
    }

    const sessionRemaining = Math.max(0, sessionLimit - sessionCount);
    const ipRemaining = Math.max(0, ipLimit - ipCount);
    return Math.min(sessionRemaining, ipRemaining);
  }

  async checkAllowance(
    tx: Prisma.TransactionClient,
    params: {
      visitorId: string;
      ipHash?: string;
      isWidget: boolean;
    },
  ): Promise<{ questionsRemaining: number }> {
    // Acquire transaction-level advisory lock on visitorId
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${params.visitorId}))`,
    );

    const sessionLimit = params.isWidget
      ? Limits.WIDGET_QUESTIONS_PER_SESSION_24H
      : Limits.DEMO_QUESTIONS_PER_SESSION_24H;
    const ipLimit = params.isWidget
      ? Limits.WIDGET_QUESTIONS_PER_IP_24H
      : Limits.DEMO_QUESTIONS_PER_IP_24H;

    const copyMessage = params.isWidget
      ? LockedCopy.WIDGET_LIMIT
      : LockedCopy.DEMO_LIMIT;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Fetch session messages
    const sessionMessages = await tx.message.findMany({
      where: {
        chat: { visitorId: params.visitorId },
        role: MessageRole.ASSISTANT,
        status: {
          in: [
            MessageStatus.STREAMING,
            MessageStatus.COMPLETE,
            MessageStatus.STOPPED,
          ],
        },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (sessionMessages.length >= sessionLimit) {
      const oldest = sessionMessages[0];
      const resetsAt = new Date(
        oldest.createdAt.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();
      throw new ApiException(
        ErrorCode.DEMO_LIMIT_REACHED,
        copyMessage,
        HttpStatus.TOO_MANY_REQUESTS,
        {
          limit: sessionLimit,
          scope: 'session',
          resetsAt,
        },
      );
    }

    // Fetch IP messages if ipHash provided
    let ipMessagesCount = 0;
    if (params.ipHash) {
      const ipMessages = await tx.message.findMany({
        where: {
          chat: { ipHash: params.ipHash },
          role: MessageRole.ASSISTANT,
          status: {
            in: [
              MessageStatus.STREAMING,
              MessageStatus.COMPLETE,
              MessageStatus.STOPPED,
            ],
          },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'asc' },
      });

      ipMessagesCount = ipMessages.length;

      if (ipMessages.length >= ipLimit) {
        const oldest = ipMessages[0];
        const resetsAt = new Date(
          oldest.createdAt.getTime() + 24 * 60 * 60 * 1000,
        ).toISOString();
        throw new ApiException(
          ErrorCode.DEMO_LIMIT_REACHED,
          copyMessage,
          HttpStatus.TOO_MANY_REQUESTS,
          {
            limit: ipLimit,
            scope: 'ip',
            resetsAt,
          },
        );
      }
    }

    const sessionRemaining = sessionLimit - (sessionMessages.length + 1);
    const ipRemaining = ipLimit - (ipMessagesCount + 1);
    const questionsRemaining = Math.max(0, Math.min(sessionRemaining, ipRemaining));

    return { questionsRemaining };
  }

  checkV1RateLimit(
    apiKeyId: string,
    limit: number,
    windowSeconds = 60,
  ): { allowed: boolean; retryAfter: number } {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    let timestamps = this.v1RateBuckets.get(apiKeyId);
    if (!timestamps) {
      timestamps = [];
      this.v1RateBuckets.set(apiKeyId, timestamps);
    }

    // Prune expired timestamps
    const active = timestamps.filter((t) => t > windowStart);
    this.v1RateBuckets.set(apiKeyId, active);

    if (active.length >= limit) {
      const oldest = active[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return { allowed: false, retryAfter };
    }

    active.push(now);
    return { allowed: true, retryAfter: 0 };
  }
}
