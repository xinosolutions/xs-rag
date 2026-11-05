import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  AnswerOutcome,
  ErrorCode,
  FeedbackRating,
  LockedCopy,
  MessageRole,
  MessageStatus,
} from '@xs-rag/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { FakeLlmProvider } from '../src/rag/llm/fake.provider.js';
import { truncateAllTables } from './helpers/db.js';

describe('Phase 9: Analytics (T-76..T-78)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeLlmProvider: FakeLlmProvider;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LLM_PROVIDER = 'fake';
    process.env.JWT_SECRET = 'super-secret-jwt-secret-min-32-chars-length';
    process.env.IP_HASH_SALT = 'test-salt-string';
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    fakeLlmProvider = app.get(FakeLlmProvider);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
    fakeLlmProvider.reset();
  });

  async function createUserAndLogin(name: string, email: string) {
    const regRes = await request(app.getHttpServer()).post('/auth/register').send({
      name,
      email,
      password: 'StrongPassword123!',
    });
    const cookies = regRes.headers['set-cookie'] as unknown as string[];
    return { user: regRes.body.user, cookies };
  }

  async function createWorkspace(cookies: string[], name: string) {
    const res = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', cookies)
      .send({ name });
    return res.body;
  }

  it('T-76 AC-76: messages dated 1, 10, 40, 100 days ago: 7d counts 1, 30d counts 2, 90d 3, default = 30d; totals (unanswered, avg, p95, first token, cost, thumbs) equal hand-computed values', async () => {
    const admin = await createUserAndLogin('Admin 76', 'admin76@example.com');
    const user2 = await createUserAndLogin('User2 76', 'user2_76@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 76');

    const chat = await prisma.chat.create({
      data: {
        workspaceId: ws.id,
        principalType: 'USER',
        userId: admin.user.id,
      },
    });

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const hundredDaysAgo = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);

    // Message 1 (1 day ago)
    const m1 = await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.ANSWERED,
        content: 'Answer 1',
        question: 'Question 1',
        totalMs: 1000,
        firstTokenMs: 200,
        costMicros: 100,
        createdAt: oneDayAgo,
      },
    });

    // Message 2 (10 days ago, unanswered)
    const m2 = await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.UNANSWERED,
        content: LockedCopy.NO_ANSWER,
        question: 'Question 2',
        totalMs: 2000,
        firstTokenMs: 400,
        costMicros: 150,
        createdAt: tenDaysAgo,
      },
    });

    // Message 3 (40 days ago)
    const m3 = await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.ANSWERED,
        content: 'Answer 3',
        question: 'Question 3',
        totalMs: 3000,
        firstTokenMs: 600,
        costMicros: 200,
        createdAt: fortyDaysAgo,
      },
    });

    // Message 4 (100 days ago)
    const m4 = await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.ANSWERED,
        content: 'Answer 4',
        question: 'Question 4',
        totalMs: 4000,
        firstTokenMs: 800,
        costMicros: 300,
        createdAt: hundredDaysAgo,
      },
    });

    // Feedbacks created at various times
    // 1 day ago: UP on m1
    await prisma.feedback.create({
      data: {
        workspaceId: ws.id,
        messageId: m1.id,
        userId: admin.user.id,
        rating: FeedbackRating.UP,
        createdAt: oneDayAgo,
      },
    });

    // 5 days ago: DOWN on m1 by user2
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    await prisma.feedback.create({
      data: {
        workspaceId: ws.id,
        messageId: m1.id,
        userId: user2.user.id,
        rating: FeedbackRating.DOWN,
        createdAt: fiveDaysAgo,
      },
    });

    // 10 days ago: UP on m2 by admin
    await prisma.feedback.create({
      data: {
        workspaceId: ws.id,
        messageId: m2.id,
        userId: admin.user.id,
        rating: FeedbackRating.UP,
        createdAt: tenDaysAgo,
      },
    });

    // 40 days ago: UP on m3 by admin
    await prisma.feedback.create({
      data: {
        workspaceId: ws.id,
        messageId: m3.id,
        userId: admin.user.id,
        rating: FeedbackRating.UP,
        createdAt: fortyDaysAgo,
      },
    });

    // 100 days ago: DOWN on m4 by admin
    await prisma.feedback.create({
      data: {
        workspaceId: ws.id,
        messageId: m4.id,
        userId: admin.user.id,
        rating: FeedbackRating.DOWN,
        createdAt: hundredDaysAgo,
      },
    });

    // 1. Test period=7d
    const res7d = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics?period=7d`)
      .set('Cookie', admin.cookies);

    expect(res7d.status).toBe(200);
    expect(res7d.body.period).toBe('7d');
    expect(new Date(res7d.body.from).getTime()).toBeLessThan(new Date(res7d.body.to).getTime());
    expect(res7d.body.totals.questions).toBe(1);
    expect(res7d.body.totals.unanswered).toBe(0);
    expect(res7d.body.totals.avgResponseMs).toBe(1000);
    expect(res7d.body.totals.p95ResponseMs).toBe(1000);
    expect(res7d.body.totals.avgFirstTokenMs).toBe(200);
    expect(res7d.body.totals.costMicros).toBe(100);
    expect(res7d.body.totals.thumbsUp).toBe(1);
    expect(res7d.body.totals.thumbsDown).toBe(1);

    // 2. Test period=30d
    const res30d = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics?period=30d`)
      .set('Cookie', admin.cookies);

    expect(res30d.status).toBe(200);
    expect(res30d.body.period).toBe('30d');
    expect(res30d.body.totals.questions).toBe(2);
    expect(res30d.body.totals.unanswered).toBe(1);
    expect(res30d.body.totals.avgResponseMs).toBe(1500); // (1000 + 2000) / 2
    expect(res30d.body.totals.p95ResponseMs).toBe(1950); // 1000 + 0.95 * 1000
    expect(res30d.body.totals.avgFirstTokenMs).toBe(300); // (200 + 400) / 2
    expect(res30d.body.totals.costMicros).toBe(250); // 100 + 150
    expect(res30d.body.totals.thumbsUp).toBe(2); // 1 day ago + 10 days ago
    expect(res30d.body.totals.thumbsDown).toBe(1); // 5 days ago

    // 3. Test default (no period query parameter => 30d)
    const resDefault = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics`)
      .set('Cookie', admin.cookies);

    expect(resDefault.status).toBe(200);
    expect(resDefault.body.period).toBe('30d');
    expect(resDefault.body.totals.questions).toBe(2);
    expect(resDefault.body.totals.unanswered).toBe(1);
    expect(resDefault.body.totals.avgResponseMs).toBe(1500);
    expect(resDefault.body.totals.p95ResponseMs).toBe(1950);
    expect(resDefault.body.totals.avgFirstTokenMs).toBe(300);
    expect(resDefault.body.totals.costMicros).toBe(250);
    expect(resDefault.body.totals.thumbsUp).toBe(2);
    expect(resDefault.body.totals.thumbsDown).toBe(1);

    // 4. Test period=90d
    const res90d = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics?period=90d`)
      .set('Cookie', admin.cookies);

    expect(res90d.status).toBe(200);
    expect(res90d.body.period).toBe('90d');
    expect(res90d.body.totals.questions).toBe(3);
    expect(res90d.body.totals.unanswered).toBe(1);
    expect(res90d.body.totals.avgResponseMs).toBe(2000); // (1000 + 2000 + 3000) / 3
    expect(res90d.body.totals.p95ResponseMs).toBe(2900); // continuous percentile 0.95 of [1000, 2000, 3000]
    expect(res90d.body.totals.avgFirstTokenMs).toBe(400); // (200 + 400 + 600) / 3
    expect(res90d.body.totals.costMicros).toBe(450); // 100 + 150 + 200
    expect(res90d.body.totals.thumbsUp).toBe(3); // 1, 10, 40 days ago
    expect(res90d.body.totals.thumbsDown).toBe(1); // 5 days ago (100 days ago is excluded)
  });

  it('T-77 AC-77: repeated questions differing in case/spacing group together; top 10 cap and order; a NO_ANSWER reply appears in unansweredQuestions with count and lastAskedAt', async () => {
    const admin = await createUserAndLogin('Admin 77', 'admin77@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 77');

    const chat = await prisma.chat.create({
      data: {
        workspaceId: ws.id,
        principalType: 'USER',
        userId: admin.user.id,
      },
    });

    const now = new Date();

    // Repeated questions differing in case/spacing
    // Earliest
    await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.ANSWERED,
        content: 'Answer A1',
        question: 'How do I reset my password?',
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5 hours ago
      },
    });

    // Middle
    await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.ANSWERED,
        content: 'Answer A2',
        question: '  how do i reset my password?  ',
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3 hours ago
      },
    });

    // Latest (most recent original)
    await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.ANSWERED,
        content: 'Answer A3',
        question: 'HOW DO I RESET MY PASSWORD?',
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
      },
    });

    // Unanswered questions (NO_ANSWER outcome: UNANSWERED)
    const unansweredTime = new Date(now.getTime() - 30 * 60 * 1000); // 30 mins ago
    await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.UNANSWERED,
        content: LockedCopy.NO_ANSWER,
        question: 'What is the capital of Mars?',
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      },
    });

    await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.UNANSWERED,
        content: LockedCopy.NO_ANSWER,
        question: 'what is the capital of mars?',
        createdAt: unansweredTime,
      },
    });

    // Insert 10 more distinct questions with decreasing counts (so total groups = 12 > 10)
    for (let i = 1; i <= 10; i++) {
      await prisma.message.create({
        data: {
          chatId: chat.id,
          workspaceId: ws.id,
          role: MessageRole.ASSISTANT,
          status: MessageStatus.COMPLETE,
          outcome: AnswerOutcome.ANSWERED,
          content: `Answer Q${i}`,
          question: `Question Number ${i}`,
          createdAt: new Date(now.getTime() - (10 + i) * 60 * 1000),
        },
      });
    }

    const res = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics?period=30d`)
      .set('Cookie', admin.cookies);

    expect(res.status).toBe(200);

    // Top questions assertions:
    // 1. Capped at 10 items
    expect(res.body.topQuestions).toBeDefined();
    expect(res.body.topQuestions.length).toBe(10);

    // 2. Ordered by count descending
    for (let i = 0; i < res.body.topQuestions.length - 1; i++) {
      expect(res.body.topQuestions[i].count).toBeGreaterThanOrEqual(
        res.body.topQuestions[i + 1].count,
      );
    }

    // 3. Repeated questions grouped together and displayed text is the most recent original
    const resetPasswordGroup = res.body.topQuestions.find(
      (q: { question: string }) =>
        q.question.toLowerCase().includes('reset my password'),
    );
    expect(resetPasswordGroup).toBeDefined();
    expect(resetPasswordGroup.count).toBe(3);
    expect(resetPasswordGroup.question).toBe('HOW DO I RESET MY PASSWORD?');

    // Unanswered questions assertions:
    expect(res.body.unansweredQuestions).toBeDefined();
    expect(res.body.unansweredQuestions.length).toBeLessThanOrEqual(10);

    const marsGroup = res.body.unansweredQuestions.find(
      (q: { question: string }) =>
        q.question.toLowerCase().includes('capital of mars'),
    );
    expect(marsGroup).toBeDefined();
    expect(marsGroup.count).toBe(2);
    expect(marsGroup.question).toBe('what is the capital of mars?');
    expect(marsGroup.lastAskedAt).toBe(unansweredTime.toISOString());
  });

  it('T-78 AC-78: period=1y → 400; member → 403; stranger → 404', async () => {
    const admin = await createUserAndLogin('Admin 78', 'admin78@example.com');
    const member = await createUserAndLogin('Member 78', 'member78@example.com');
    const stranger = await createUserAndLogin('Stranger 78', 'stranger78@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 78');

    // Add member to ws with role MEMBER
    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: member.user.id,
        role: 'MEMBER',
      },
    });

    // 1. period=1y → 400 VALIDATION_FAILED
    const resPeriod = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics?period=1y`)
      .set('Cookie', admin.cookies);

    expect(resPeriod.status).toBe(400);
    expect(resPeriod.body.error).toBeDefined();
    expect(resPeriod.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 2. member → 403 FORBIDDEN
    const resMember = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics`)
      .set('Cookie', member.cookies);

    expect(resMember.status).toBe(403);
    expect(resMember.body.error).toBeDefined();
    expect(resMember.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 3. stranger → 404 WORKSPACE_NOT_FOUND
    const resStranger = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/analytics`)
      .set('Cookie', stranger.cookies);

    expect(resStranger.status).toBe(404);
    expect(resStranger.body.error).toBeDefined();
    expect(resStranger.body.error.code).toBe(ErrorCode.WORKSPACE_NOT_FOUND);

    // 4. unknown workspace id → 404 WORKSPACE_NOT_FOUND
    const resUnknown = await request(app.getHttpServer())
      .get('/workspaces/00000000-0000-0000-0000-000000000000/analytics')
      .set('Cookie', admin.cookies);

    expect(resUnknown.status).toBe(404);
    expect(resUnknown.body.error).toBeDefined();
    expect(resUnknown.body.error.code).toBe(ErrorCode.WORKSPACE_NOT_FOUND);
  });
});
