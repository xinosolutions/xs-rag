import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AnswerOutcome,
  MessageRole,
  MessageStatus,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';

export type AnalyticsPeriod = '7d' | '30d' | '90d';

export interface AnalyticsTotals {
  questions: number;
  unanswered: number;
  avgResponseMs: number | null;
  p95ResponseMs: number | null;
  avgFirstTokenMs: number | null;
  costMicros: number;
  thumbsUp: number;
  thumbsDown: number;
}

export interface TopQuestionItem {
  question: string;
  count: number;
}

export interface UnansweredQuestionItem {
  question: string;
  count: number;
  lastAskedAt: string;
}

export interface AnalyticsResponse {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  totals: AnalyticsTotals;
  topQuestions: TopQuestionItem[];
  unansweredQuestions: UnansweredQuestionItem[];
}

interface QuestionGroup {
  question: string;
  count: number;
  lastAskedAt: Date;
}

const PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    wid: string,
    period: AnalyticsPeriod = '30d',
  ): Promise<AnalyticsResponse> {
    const days = PERIOD_DAYS[period] ?? 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const [totalsRows, feedbackRows, messages] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          questions: number;
          unanswered: number;
          avgResponseMs: number | null;
          p95ResponseMs: number | null;
          avgFirstTokenMs: number | null;
          costMicros: number;
        }>
      >(
        Prisma.sql`SELECT
          COUNT(*) FILTER (WHERE status IN ('COMPLETE'::"MessageStatus", 'STOPPED'::"MessageStatus"))::int AS questions,
          COUNT(*) FILTER (WHERE status IN ('COMPLETE'::"MessageStatus", 'STOPPED'::"MessageStatus") AND outcome = 'UNANSWERED'::"AnswerOutcome")::int AS unanswered,
          AVG("totalMs") FILTER (WHERE status = 'COMPLETE'::"MessageStatus" AND "totalMs" IS NOT NULL) AS "avgResponseMs",
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalMs") FILTER (WHERE status = 'COMPLETE'::"MessageStatus" AND "totalMs" IS NOT NULL) AS "p95ResponseMs",
          AVG("firstTokenMs") FILTER (WHERE status = 'COMPLETE'::"MessageStatus" AND "firstTokenMs" IS NOT NULL) AS "avgFirstTokenMs",
          COALESCE(SUM("costMicros"), 0)::int AS "costMicros"
        FROM "Message"
        WHERE "workspaceId" = ${wid}
          AND "role" = 'ASSISTANT'::"MessageRole"
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}`,
      ),
      this.prisma.$queryRaw<
        Array<{
          thumbsUp: number;
          thumbsDown: number;
        }>
      >(
        Prisma.sql`SELECT
          COUNT(*) FILTER (WHERE rating = 'UP'::"FeedbackRating")::int AS "thumbsUp",
          COUNT(*) FILTER (WHERE rating = 'DOWN'::"FeedbackRating")::int AS "thumbsDown"
        FROM "Feedback"
        WHERE "workspaceId" = ${wid}
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}`,
      ),
      this.prisma.message.findMany({
        where: {
          workspaceId: wid,
          role: MessageRole.ASSISTANT,
          status: { in: [MessageStatus.COMPLETE, MessageStatus.STOPPED] },
          createdAt: { gte: from, lte: to },
          question: { not: null },
        },
        select: {
          question: true,
          outcome: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const topMap = new Map<string, QuestionGroup>();
    const unansweredMap = new Map<string, QuestionGroup>();

    for (const msg of messages) {
      if (!msg.question) continue;
      const key = msg.question.trim().toLowerCase();
      if (!key) continue;

      const existingTop = topMap.get(key);
      if (!existingTop) {
        topMap.set(key, {
          question: msg.question,
          count: 1,
          lastAskedAt: msg.createdAt,
        });
      } else {
        existingTop.count += 1;
      }

      if (msg.outcome === AnswerOutcome.UNANSWERED) {
        const existingUnanswered = unansweredMap.get(key);
        if (!existingUnanswered) {
          unansweredMap.set(key, {
            question: msg.question,
            count: 1,
            lastAskedAt: msg.createdAt,
          });
        } else {
          existingUnanswered.count += 1;
        }
      }
    }

    const topQuestions = Array.from(topMap.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastAskedAt.getTime() - a.lastAskedAt.getTime();
      })
      .slice(0, 10)
      .map((g) => ({
        question: g.question,
        count: g.count,
      }));

    const unansweredQuestions = Array.from(unansweredMap.values())
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastAskedAt.getTime() - a.lastAskedAt.getTime();
      })
      .slice(0, 10)
      .map((g) => ({
        question: g.question,
        count: g.count,
        lastAskedAt: g.lastAskedAt.toISOString(),
      }));

    const t = totalsRows[0];
    const f = feedbackRows[0];

    const totals: AnalyticsTotals = {
      questions: Number(t?.questions ?? 0),
      unanswered: Number(t?.unanswered ?? 0),
      avgResponseMs:
        t?.avgResponseMs != null ? Math.round(Number(t.avgResponseMs)) : null,
      p95ResponseMs:
        t?.p95ResponseMs != null ? Math.round(Number(t.p95ResponseMs)) : null,
      avgFirstTokenMs:
        t?.avgFirstTokenMs != null ? Math.round(Number(t.avgFirstTokenMs)) : null,
      costMicros: Number(t?.costMicros ?? 0),
      thumbsUp: Number(f?.thumbsUp ?? 0),
      thumbsDown: Number(f?.thumbsDown ?? 0),
    };

    return {
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      topQuestions,
      unansweredQuestions,
    };
  }
}
