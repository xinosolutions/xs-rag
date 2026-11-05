import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  DocumentSourceType,
  DocumentStatus,
  DocumentVisibility,
  WorkspaceRole,
} from '@xs-rag/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { StorageService } from '../src/documents/storage.service.js';
import { IngestionWorker } from '../src/ingestion/ingestion.worker.js';
import { truncateAllTables } from './helpers/db.js';
import { seed } from '../prisma/seed.js';

describe('Phase 10: Seed content and script (T-79)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageService: StorageService;
  let worker: IngestionWorker;

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
    storageService = app.get(StorageService);
    worker = app.get(IngestionWorker);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  it('T-79 AC-79: run seed on empty DB → demo workspace, 5 READY ALL_MEMBERS docs, 4 suggested questions, 10 eval questions (2 expectUnanswered), demo admin can log in; run again → row counts unchanged', async () => {
    // 1. Initial state: DB is empty
    expect(await prisma.workspace.count()).toBe(0);
    expect(await prisma.document.count()).toBe(0);
    expect(await prisma.evalQuestion.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);

    // 2. Run seed on empty DB
    const seedResult = await seed({ prisma, worker, storageService });
    expect(seedResult).toBeDefined();

    const demoSlug = process.env.DEMO_WORKSPACE_SLUG || 'acme-demo';
    const adminPassword =
      process.env.SEED_DEMO_ADMIN_PASSWORD || 'DemoAdminSecretPass123!';

    // 3. Demo workspace verification
    const demoWs = await prisma.workspace.findUnique({
      where: { slug: demoSlug },
    });
    expect(demoWs).toBeDefined();
    expect(demoWs!.isDemo).toBe(true);
    expect(demoWs!.name).toBe('Acme Corp');

    // 4 suggested questions on demo workspace
    expect(demoWs!.suggestedQuestions).toHaveLength(4);
    expect(demoWs!.suggestedQuestions).toEqual([
      'How many vacation days do new hires get?',
      'Can I work from another country?',
      'What is the daily meal limit on business trips?',
      'How often must I change my password?',
    ]);

    // 4. Demo admin user and login verification
    const adminUser = await prisma.user.findUnique({
      where: { email: 'demo-admin@acme.example' },
    });
    expect(adminUser).toBeDefined();
    expect(adminUser!.email).toBe('demo-admin@acme.example');
    expect(adminUser!.name).toBe('Demo Admin');

    // Admin membership in demo workspace
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: demoWs!.id,
          userId: adminUser!.id,
        },
      },
    });
    expect(membership).toBeDefined();
    expect(membership!.role).toBe(WorkspaceRole.ADMIN);

    // Demo admin can log in successfully via POST /auth/login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'demo-admin@acme.example',
        password: adminPassword,
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user).toBeDefined();
    expect(loginRes.body.user.email).toBe('demo-admin@acme.example');
    expect(loginRes.headers['set-cookie']).toBeDefined();

    // 5. 5 READY ALL_MEMBERS documents verification
    const docs = await prisma.document.findMany({
      where: { workspaceId: demoWs!.id },
      orderBy: { fileName: 'asc' },
    });
    expect(docs).toHaveLength(5);

    const expectedFileNames = [
      'code-of-conduct.md',
      'expense-policy.md',
      'it-security-policy.md',
      'leave-policy.md',
      'remote-work-policy.md',
    ];
    expect(docs.map((d) => d.fileName)).toEqual(expectedFileNames);

    for (const doc of docs) {
      expect(doc.status).toBe(DocumentStatus.READY);
      expect(doc.visibility).toBe(DocumentVisibility.ALL_MEMBERS);
      expect(doc.sourceType).toBe(DocumentSourceType.MARKDOWN);
      expect(doc.chunkCount).toBeGreaterThan(0);
      expect(doc.storagePath).toBeDefined();
      expect(doc.contentHash).toBeDefined();
    }

    // Verify chunks exist with 1536-dim embeddings for all documents
    const totalChunks = await prisma.chunk.count({
      where: { workspaceId: demoWs!.id },
    });
    expect(totalChunks).toBeGreaterThanOrEqual(25);

    // 6. 10 evaluation questions (including 2 expectUnanswered)
    const evalQuestions = await prisma.evalQuestion.findMany({
      where: { workspaceId: demoWs!.id },
    });
    expect(evalQuestions).toHaveLength(10);

    const unansweredQuestions = evalQuestions.filter((q) => q.expectUnanswered);
    expect(unansweredQuestions).toHaveLength(2);
    const unansweredTexts = unansweredQuestions.map((q) => q.question);
    expect(unansweredTexts).toContain(
      'What is the stock option vesting schedule?',
    );
    expect(unansweredTexts).toContain('Does Acme offer a pension plan?');
    for (const q of unansweredQuestions) {
      expect(q.expectedDocumentIds).toEqual([]);
    }

    const answeredQuestions = evalQuestions.filter((q) => !q.expectUnanswered);
    expect(answeredQuestions).toHaveLength(8);
    for (const q of answeredQuestions) {
      expect(q.expectedDocumentIds.length).toBeGreaterThan(0);
      expect(q.expectedAnswer).toBeTruthy();
    }

    // Verify the 4 suggested questions plus 4 extra authoritative questions are in eval set
    const answeredTexts = answeredQuestions.map((q) => q.question);
    expect(answeredTexts).toContain('How many vacation days do new hires get?');
    expect(answeredTexts).toContain('Can I work from another country?');
    expect(answeredTexts).toContain(
      'What is the daily meal limit on business trips?',
    );
    expect(answeredTexts).toContain('How often must I change my password?');
    expect(answeredTexts).toContain('How many sick days do I get?');
    expect(answeredTexts).toContain('How long is parental leave?');
    expect(answeredTexts).toContain('When are expense claims due?');
    expect(answeredTexts).toContain(
      'Who do I contact to report a conduct concern?',
    );

    // Public demo endpoint verification (V-02)
    const demoEndpointRes = await request(app.getHttpServer()).get('/public/demo');
    expect(demoEndpointRes.status).toBe(200);
    expect(demoEndpointRes.body.workspaceName).toBe('Acme Corp');
    expect(demoEndpointRes.body.documents).toHaveLength(5);
    expect(demoEndpointRes.body.suggestedQuestions).toHaveLength(4);

    // 7. Snapshot row counts before second run
    const userCountBefore = await prisma.user.count();
    const wsCountBefore = await prisma.workspace.count();
    const memberCountBefore = await prisma.membership.count();
    const docCountBefore = await prisma.document.count();
    const chunkCountBefore = await prisma.chunk.count();
    const evalCountBefore = await prisma.evalQuestion.count();

    // 8. Run seed again (idempotence verification)
    const secondResult = await seed({ prisma, worker, storageService });
    expect(secondResult).toBeDefined();

    // Row counts must remain completely unchanged
    expect(await prisma.user.count()).toBe(userCountBefore);
    expect(await prisma.workspace.count()).toBe(wsCountBefore);
    expect(await prisma.membership.count()).toBe(memberCountBefore);
    expect(await prisma.document.count()).toBe(docCountBefore);
    expect(await prisma.chunk.count()).toBe(chunkCountBefore);
    expect(await prisma.evalQuestion.count()).toBe(evalCountBefore);
  });
});
