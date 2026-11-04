import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import {
  AnswerOutcome,
  DocumentStatus,
  DocumentVisibility,
  ErrorCode,
  FeedbackRating,
  MessageRole,
  MessageStatus,
  PrincipalType,
} from '@xs-rag/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { FakeLlmProvider } from '../src/rag/llm/fake.provider.js';
import { truncateAllTables } from './helpers/db.js';
import { insertTestChunk } from './helpers/chunks.js';
import { computeRunScores, computeQuestionScores } from '../src/eval/scoring.js';

describe('Phase 8: Evaluation Questions, Runs, Judge, Compare & Feedback to Eval (T-69..T-75)', () => {
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

  async function insertReadyDocument(
    workspaceId: string,
    title: string,
    visibility: DocumentVisibility = DocumentVisibility.ALL_MEMBERS,
  ) {
    return prisma.document.create({
      data: {
        workspaceId,
        title,
        sourceType: 'MARKDOWN',
        visibility,
        status: DocumentStatus.READY,
        contentHash: randomUUID(),
        uploadedById: randomUUID(),
        fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.md`,
        mimeType: 'text/markdown',
        sizeBytes: 500,
        chunkCount: 1,
      },
    });
  }

  it('T-69 AC-69: create, list, patch, delete question; missing expectedAnswer without expectUnanswered → 400; expectedDocumentIds from another workspace → 400; member → 403; unknown id → 404 EVAL_QUESTION_NOT_FOUND', async () => {
    const admin = await createUserAndLogin('Admin 69', 'admin69@example.com');
    const member = await createUserAndLogin('Member 69', 'member69@example.com');
    const ws1 = await createWorkspace(admin.cookies, 'WS 69-1');
    const ws2 = await createWorkspace(admin.cookies, 'WS 69-2');

    // Add member to ws1
    await prisma.membership.create({
      data: {
        workspaceId: ws1.id,
        userId: member.user.id,
        role: 'MEMBER',
      },
    });

    const doc1 = await insertReadyDocument(ws1.id, 'Doc in WS1');
    const doc2 = await insertReadyDocument(ws2.id, 'Doc in WS2');

    // 1. Missing expectedAnswer without expectUnanswered -> 400
    const errRes1 = await request(app.getHttpServer())
      .post(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'What is the leave policy?',
      });
    expect(errRes1.status).toBe(400);
    expect(errRes1.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 2. expectedDocumentIds from another workspace -> 400
    const errRes2 = await request(app.getHttpServer())
      .post(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'What is the leave policy?',
        expectedAnswer: '20 days per year',
        expectedDocumentIds: [doc2.id],
      });
    expect(errRes2.status).toBe(400);
    expect(errRes2.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 3. Member -> 403
    const memberRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', member.cookies)
      .send({
        question: 'What is the leave policy?',
        expectedAnswer: '20 days per year',
      });
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 4. Admin creates valid question -> 201
    const createRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'How many vacation days do new hires get?',
        expectedAnswer: 'Full-time staff get 20 vacation days.',
        expectedDocumentIds: [doc1.id],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.question).toBe('How many vacation days do new hires get?');
    expect(createRes.body.expectedAnswer).toBe('Full-time staff get 20 vacation days.');
    expect(createRes.body.expectUnanswered).toBe(false);
    expect(createRes.body.expectedDocumentIds).toEqual([doc1.id]);
    const qid = createRes.body.id;

    // 5. Admin creates expectUnanswered question -> 201 (no expectedAnswer needed)
    const createUnansweredRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'What is the stock option vesting schedule?',
        expectUnanswered: true,
      });
    expect(createUnansweredRes.status).toBe(201);
    expect(createUnansweredRes.body.expectUnanswered).toBe(true);

    // 6. List questions -> 200
    const listRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', admin.cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(2);
    expect(listRes.body.data[0].id).toBe(qid);

    // Member list -> 403
    const memberListRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', member.cookies);
    expect(memberListRes.status).toBe(403);

    // 7. Patch question -> 200
    const patchRes = await request(app.getHttpServer())
      .patch(`/workspaces/${ws1.id}/eval/questions/${qid}`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'Updated vacation question?',
        expectedAnswer: 'Updated 20 days.',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.question).toBe('Updated vacation question?');
    expect(patchRes.body.expectedAnswer).toBe('Updated 20 days.');

    // Unknown ID patch -> 404 EVAL_QUESTION_NOT_FOUND
    const unknownPatch = await request(app.getHttpServer())
      .patch(`/workspaces/${ws1.id}/eval/questions/${randomUUID()}`)
      .set('Cookie', admin.cookies)
      .send({ question: 'Hello?' });
    expect(unknownPatch.status).toBe(404);
    expect(unknownPatch.body.error.code).toBe(ErrorCode.EVAL_QUESTION_NOT_FOUND);

    // 8. Delete question -> 204
    const deleteRes = await request(app.getHttpServer())
      .delete(`/workspaces/${ws1.id}/eval/questions/${qid}`)
      .set('Cookie', admin.cookies);
    expect(deleteRes.status).toBe(204);

    // Unknown ID delete -> 404 EVAL_QUESTION_NOT_FOUND
    const unknownDelete = await request(app.getHttpServer())
      .delete(`/workspaces/${ws1.id}/eval/questions/${randomUUID()}`)
      .set('Cookie', admin.cookies);
    expect(unknownDelete.status).toBe(404);
    expect(unknownDelete.body.error.code).toBe(ErrorCode.EVAL_QUESTION_NOT_FOUND);

    // Verify deletion
    const listAfterDelete = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/eval/questions`)
      .set('Cookie', admin.cookies);
    expect(listAfterDelete.body.data).toHaveLength(1);
    expect(listAfterDelete.body.data[0].id).toBe(createUnansweredRes.body.id);
  });

  it('T-70 AC-70: 100 questions inserted, 101st POST → 409 EVAL_LIMIT', async () => {
    const admin = await createUserAndLogin('Admin 70', 'admin70@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 70');

    // Insert 100 questions directly
    const bulkData = Array.from({ length: 100 }, (_, i) => ({
      workspaceId: ws.id,
      question: `Question number ${i + 1}?`,
      expectedAnswer: `Expected answer ${i + 1}`,
      expectUnanswered: false,
      expectedDocumentIds: [],
    }));
    await prisma.evalQuestion.createMany({ data: bulkData });

    // 101st POST -> 409 EVAL_LIMIT
    const res = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'Question 101?',
        expectedAnswer: 'Answer 101',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ErrorCode.EVAL_LIMIT);
  });

  it('T-71 AC-71: start run → 202 QUEUED; poll until COMPLETED; accuracy, faithfulness, retrieval set; results.length = question count; modelId stored; costMicros > 0; list newest first; get by id', async () => {
    const admin = await createUserAndLogin('Admin 71', 'admin71@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 71');

    // Add a document and chunk
    const doc = await insertReadyDocument(ws.id, 'Leave Policy');
    const vector = await fakeLlmProvider.embed(['vacation leave 20 days per year']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 1,
      text: 'Full-time staff get 20 vacation days per year.',
      embedding: vector[0],
    });

    // Insert 2 eval questions
    await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'How many vacation days do staff get?',
        expectedAnswer: 'Full-time staff get 20 vacation days per year.',
        expectedDocumentIds: [doc.id],
      });

    await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: '__NO_ANSWER__ Does Acme have a pension plan?',
        expectUnanswered: true,
      });

    // Start run -> 202 QUEUED
    const startRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/runs`)
      .set('Cookie', admin.cookies);
    expect(startRes.status).toBe(202);
    expect(startRes.body.id).toBeDefined();
    expect(startRes.body.status).toBe('QUEUED');
    expect(startRes.body.questionCount).toBe(2);

    const runId = startRes.body.id;

    // Poll until COMPLETED (up to 15 seconds)
    let completedRun: any = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const getRes = await request(app.getHttpServer())
        .get(`/workspaces/${ws.id}/eval/runs/${runId}`)
        .set('Cookie', admin.cookies);
      if (getRes.body.status === 'COMPLETED') {
        completedRun = getRes.body;
        break;
      }
    }

    expect(completedRun).not.toBeNull();
    expect(completedRun.status).toBe('COMPLETED');
    expect(completedRun.modelId).toBeDefined();
    expect(completedRun.judgeModelId).toBeDefined();
    expect(typeof completedRun.accuracy).toBe('number');
    expect(typeof completedRun.faithfulness).toBe('number');
    expect(typeof completedRun.retrieval).toBe('number');
    expect(completedRun.costMicros).toBeGreaterThan(0);
    expect(completedRun.results).toHaveLength(2);

    // List runs -> newest first
    const listRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/eval/runs`)
      .set('Cookie', admin.cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(runId);
  });

  it('T-72 AC-72: no questions → 409 EVAL_NO_QUESTIONS; start, then immediate second start → 409 EVAL_RUN_IN_PROGRESS; member → 403', async () => {
    const admin = await createUserAndLogin('Admin 72', 'admin72@example.com');
    const member = await createUserAndLogin('Member 72', 'member72@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 72');

    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: member.user.id,
        role: 'MEMBER',
      },
    });

    // 1. Zero questions -> 409 EVAL_NO_QUESTIONS
    const noQRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/runs`)
      .set('Cookie', admin.cookies);
    expect(noQRes.status).toBe(409);
    expect(noQRes.body.error.code).toBe(ErrorCode.EVAL_NO_QUESTIONS);

    // Add 1 question
    await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/questions`)
      .set('Cookie', admin.cookies)
      .send({
        question: 'Any question?',
        expectedAnswer: 'Any answer.',
      });

    // 2. Member caller -> 403
    const memberRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/runs`)
      .set('Cookie', member.cookies);
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 3. Simulated in-progress run -> 409 EVAL_RUN_IN_PROGRESS
    await prisma.evalRun.create({
      data: {
        workspaceId: ws.id,
        status: 'RUNNING',
        modelId: 'fake-model',
        judgeModelId: 'fake-model',
        questionCount: 1,
        startedById: admin.user.id,
      },
    });

    const inProgRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/eval/runs`)
      .set('Cookie', admin.cookies);
    expect(inProgRes.status).toBe(409);
    expect(inProgRes.body.error.code).toBe(ErrorCode.EVAL_RUN_IN_PROGRESS);
  });

  it('T-73 AC-73: Unit scoring definitions (accuracy, faithfulness, retrieval per 7.7)', () => {
    // Scoring logic verification
    const q1 = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'CORRECT',
      totalClaims: 2,
      supportedClaims: 2,
      expectedDocumentIds: ['docA'],
      retrievedDocumentIds: ['docA'],
    });
    const q2 = computeQuestionScores({
      expectUnanswered: true,
      outcome: AnswerOutcome.UNANSWERED,
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });

    const scores = computeRunScores([q1, q2]);
    expect(scores.accuracy).toBe(1.0);
    expect(scores.faithfulness).toBe(1.0);
    expect(scores.retrieval).toBe(1.0);
  });

  it('T-74 AC-74: compare two runs → both summaries, deltas, per-question changed; run of another workspace → 404 EVAL_RUN_NOT_FOUND; same id twice → 400', async () => {
    const admin = await createUserAndLogin('Admin 74', 'admin74@example.com');
    const ws1 = await createWorkspace(admin.cookies, 'WS 74-1');
    const ws2 = await createWorkspace(admin.cookies, 'WS 74-2');

    // Create 2 questions in ws1
    const q1 = await prisma.evalQuestion.create({
      data: {
        workspaceId: ws1.id,
        question: 'Question 1?',
        expectedAnswer: 'Answer 1',
        expectUnanswered: false,
      },
    });
    const q2 = await prisma.evalQuestion.create({
      data: {
        workspaceId: ws1.id,
        question: 'Question 2?',
        expectedAnswer: 'Answer 2',
        expectUnanswered: false,
      },
    });

    // Create base run in ws1: Q1 correct, Q2 incorrect => accuracy 0.5
    const baseRun = await prisma.evalRun.create({
      data: {
        workspaceId: ws1.id,
        status: 'COMPLETED',
        modelId: 'model-a',
        judgeModelId: 'judge-model',
        questionCount: 2,
        accuracy: 0.5,
        faithfulness: 0.7,
        retrieval: 0.8,
        costMicros: 100,
        startedById: admin.user.id,
        results: {
          create: [
            {
              questionId: q1.id,
              questionText: q1.question,
              expectedAnswer: q1.expectedAnswer,
              expectUnanswered: false,
              expectedDocumentIds: [],
              answer: 'A1',
              outcome: AnswerOutcome.ANSWERED,
              retrievedDocumentIds: [],
              accuracyCorrect: true,
              faithfulness: 0.8,
              retrievalHit: true,
              costMicros: 50,
            },
            {
              questionId: q2.id,
              questionText: q2.question,
              expectedAnswer: q2.expectedAnswer,
              expectUnanswered: false,
              expectedDocumentIds: [],
              answer: 'A2',
              outcome: AnswerOutcome.ANSWERED,
              retrievedDocumentIds: [],
              accuracyCorrect: false,
              faithfulness: 0.6,
              retrievalHit: false,
              costMicros: 50,
            },
          ],
        },
      },
    });

    // Create other run in ws1: Q1 correct, Q2 correct => accuracy 1.0
    const otherRun = await prisma.evalRun.create({
      data: {
        workspaceId: ws1.id,
        status: 'COMPLETED',
        modelId: 'model-b',
        judgeModelId: 'judge-model',
        questionCount: 2,
        accuracy: 1.0,
        faithfulness: 0.9,
        retrieval: 1.0,
        costMicros: 120,
        startedById: admin.user.id,
        results: {
          create: [
            {
              questionId: q1.id,
              questionText: q1.question,
              expectedAnswer: q1.expectedAnswer,
              expectUnanswered: false,
              expectedDocumentIds: [],
              answer: 'A1 revised',
              outcome: AnswerOutcome.ANSWERED,
              retrievedDocumentIds: [],
              accuracyCorrect: true,
              faithfulness: 0.9,
              retrievalHit: true,
              costMicros: 60,
            },
            {
              questionId: q2.id,
              questionText: q2.question,
              expectedAnswer: q2.expectedAnswer,
              expectUnanswered: false,
              expectedDocumentIds: [],
              answer: 'A2 revised',
              outcome: AnswerOutcome.ANSWERED,
              retrievedDocumentIds: [],
              accuracyCorrect: true,
              faithfulness: 0.9,
              retrievalHit: true,
              costMicros: 60,
            },
          ],
        },
      },
    });

    // Run in ws2
    const ws2Run = await prisma.evalRun.create({
      data: {
        workspaceId: ws2.id,
        status: 'COMPLETED',
        modelId: 'model-a',
        judgeModelId: 'judge-model',
        questionCount: 1,
        startedById: admin.user.id,
      },
    });

    // 1. Same id twice -> 400
    const sameRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/eval/compare?baseRunId=${baseRun.id}&otherRunId=${baseRun.id}`)
      .set('Cookie', admin.cookies);
    expect(sameRes.status).toBe(400);

    // 2. Run of another workspace -> 404 EVAL_RUN_NOT_FOUND
    const diffWsRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/eval/compare?baseRunId=${baseRun.id}&otherRunId=${ws2Run.id}`)
      .set('Cookie', admin.cookies);
    expect(diffWsRes.status).toBe(404);
    expect(diffWsRes.body.error.code).toBe(ErrorCode.EVAL_RUN_NOT_FOUND);

    // 3. Compare two valid runs -> 200 with summaries, deltas, changed
    const compareRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/eval/compare?baseRunId=${baseRun.id}&otherRunId=${otherRun.id}`)
      .set('Cookie', admin.cookies);
    expect(compareRes.status).toBe(200);

    const body = compareRes.body;
    expect(body.base.id).toBe(baseRun.id);
    expect(body.other.id).toBe(otherRun.id);

    // Deltas: other - base => 1.0 - 0.5 = 0.5
    expect(body.deltas.accuracy).toBe(0.5);
    expect(body.deltas.faithfulness).toBe(0.2);
    expect(body.deltas.retrieval).toBe(0.2);

    expect(body.questions).toHaveLength(2);
    const q1Diff = body.questions.find((q: any) => q.questionId === q1.id);
    expect(q1Diff.baseCorrect).toBe(true);
    expect(q1Diff.otherCorrect).toBe(true);
    expect(q1Diff.changed).toBe(false);

    const q2Diff = body.questions.find((q: any) => q.questionId === q2.id);
    expect(q2Diff.baseCorrect).toBe(false);
    expect(q2Diff.otherCorrect).toBe(true);
    expect(q2Diff.changed).toBe(true);
  });

  it('T-75 AC-75: feedback → eval-question → 201, question equals message question, sourceMessageId set; repeat → 409 EVAL_QUESTION_EXISTS; random id → 404 FEEDBACK_NOT_FOUND; member → 403', async () => {
    const admin = await createUserAndLogin('Admin 75', 'admin75@example.com');
    const member = await createUserAndLogin('Member 75', 'member75@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 75');

    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: member.user.id,
        role: 'MEMBER',
      },
    });

    // Create chat, user message, and assistant message
    const chat = await prisma.chat.create({
      data: {
        workspaceId: ws.id,
        principalType: PrincipalType.USER,
        userId: member.user.id,
        title: 'Policy query',
      },
    });

    const assistantMsg = await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: MessageRole.ASSISTANT,
        content: 'I do not have enough information.',
        status: MessageStatus.COMPLETE,
        outcome: AnswerOutcome.UNANSWERED,
        question: 'What is the remote work policy?',
      },
    });

    // Member rates message
    const feedback = await prisma.feedback.create({
      data: {
        workspaceId: ws.id,
        messageId: assistantMsg.id,
        userId: member.user.id,
        rating: FeedbackRating.DOWN,
        comment: 'Incorrect, we do have a remote work policy.',
      },
    });

    // 1. Member calls -> 403
    const memberRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/feedback/${feedback.id}/eval-question`)
      .set('Cookie', member.cookies)
      .send({
        expectedAnswer: 'Staff can work remotely up to 3 days per week.',
      });
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 2. Random feedback id -> 404 FEEDBACK_NOT_FOUND
    const randomRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/feedback/${randomUUID()}/eval-question`)
      .set('Cookie', admin.cookies)
      .send({
        expectedAnswer: 'Staff can work remotely up to 3 days per week.',
      });
    expect(randomRes.status).toBe(404);
    expect(randomRes.body.error.code).toBe(ErrorCode.FEEDBACK_NOT_FOUND);

    // 3. Admin adds to evaluation set -> 201
    const createRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/feedback/${feedback.id}/eval-question`)
      .set('Cookie', admin.cookies)
      .send({
        expectedAnswer: 'Staff can work remotely up to 3 days per week.',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.question).toBe('What is the remote work policy?');
    expect(createRes.body.expectedAnswer).toBe('Staff can work remotely up to 3 days per week.');
    expect(createRes.body.sourceMessageId).toBe(assistantMsg.id);

    // 4. Repeat call -> 409 EVAL_QUESTION_EXISTS
    const repeatRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/feedback/${feedback.id}/eval-question`)
      .set('Cookie', admin.cookies)
      .send({
        expectedAnswer: 'Staff can work remotely up to 3 days per week.',
      });
    expect(repeatRes.status).toBe(409);
    expect(repeatRes.body.error.code).toBe(ErrorCode.EVAL_QUESTION_EXISTS);
  });
});
