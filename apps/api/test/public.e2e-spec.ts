import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  ApiKeyKind,
  AnswerOutcome,
  DocumentStatus,
  DocumentVisibility,
  ErrorCode,
  LockedCopy,
  MessageRole,
  MessageStatus,
  WorkspaceRole,
} from '@xs-rag/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { FakeLlmProvider } from '../src/rag/llm/fake.provider.js';
import { truncateAllTables } from './helpers/db.js';
import { insertTestChunk } from './helpers/chunks.js';

interface SseEventItem {
  event: string;
  data: any;
  timestamp: number;
}

function postSse(
  serverPort: number,
  path: string,
  authOrCookie: string,
  body: object,
  onTokenCallback?: (token: string, req: http.ClientRequest) => void,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; events: SseEventItem[] }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    let isSettled = false;
    const events: SseEventItem[] = [];

    const settle = (status: number, headers: http.IncomingHttpHeaders) => {
      if (!isSettled) {
        isSettled = true;
        resolve({
          status,
          headers,
          events,
        });
      }
    };

    const headers: http.OutgoingHttpHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      Accept: 'text/event-stream',
    };

    if (authOrCookie.startsWith('Bearer ')) {
      headers.Authorization = authOrCookie;
    } else {
      headers.Cookie = authOrCookie;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method: 'POST',
        headers,
      },
      (res) => {
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            if (!block.trim() || block.startsWith(':')) continue;
            let eventName = 'message';
            let dataStr = '';

            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) {
                eventName = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                dataStr = line.slice(6).trim();
              }
            }

            try {
              const parsed = JSON.parse(dataStr);
              events.push({
                event: eventName,
                data: parsed,
                timestamp: Date.now(),
              });

              if (eventName === 'token' && onTokenCallback) {
                onTokenCallback(parsed.text, req);
              }
            } catch {
              events.push({
                event: eventName,
                data: dataStr,
                timestamp: Date.now(),
              });
            }
          }
        });

        res.on('end', () => {
          settle(res.statusCode || 200, res.headers);
        });

        res.on('close', () => {
          settle(res.statusCode || 200, res.headers);
        });
      },
    );

    req.on('close', () => {
      settle(200, {});
    });

    req.on('error', (err: any) => {
      if (
        err.code === 'ECONNRESET' ||
        err.message?.includes('socket hang up') ||
        err.message?.includes('destroyed')
      ) {
        settle(200, {});
        return;
      }
      if (!isSettled) {
        isSettled = true;
        reject(err);
      }
    });

    req.write(postData);
    req.end();
  });
}

describe('Phase 7: API Keys, /v1/ask, Public Demo & Sessions (T-58..T-68)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeLlmProvider: FakeLlmProvider;
  let serverPort: number;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LLM_PROVIDER = 'fake';
    process.env.JWT_SECRET = 'super-secret-jwt-secret-min-32-chars-length';
    process.env.IP_HASH_SALT = 'test-salt-string';
    process.env.V1_RATE_PER_MIN = '60';
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    serverPort = typeof address === 'object' && address ? address.port : 4000;

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
    visibility: DocumentVisibility,
    uploadedById?: string,
  ) {
    return prisma.document.create({
      data: {
        workspaceId,
        title,
        sourceType: 'MARKDOWN',
        visibility,
        status: DocumentStatus.READY,
        contentHash: randomUUID(),
        uploadedById: uploadedById || randomUUID(),
        fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.md`,
        mimeType: 'text/markdown',
        sizeBytes: 500,
        chunkCount: 1,
      },
    });
  }

  it('T-58 AC-58: create SERVER key → 201 with secret starting xsrag_sk_; DB has no plaintext, keyPrefix length 12; list has no secret; member → 403; 11th → 409 API_KEY_LIMIT', async () => {
    const admin = await createUserAndLogin('Admin 58', 'admin58@example.com');
    const member = await createUserAndLogin('Member 58', 'member58@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 58');

    // Add member
    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: member.user.id,
        role: WorkspaceRole.MEMBER,
      },
    });

    // 1. Create SERVER key as admin
    const createRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Backend Key', kind: ApiKeyKind.SERVER });

    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe('Backend Key');
    expect(createRes.body.kind).toBe(ApiKeyKind.SERVER);
    expect(createRes.body.secret).toMatch(/^xsrag_sk_[0-9a-zA-Z]{32}$/);
    expect(createRes.body.keyPrefix.length).toBe(12);
    expect(createRes.body.keyPrefix).toBe(createRes.body.secret.slice(0, 12));

    // 2. Check DB does not store plaintext
    const dbKey = await prisma.apiKey.findUnique({
      where: { id: createRes.body.id },
    });
    expect(dbKey).toBeTruthy();
    expect((dbKey as any).secret).toBeUndefined();
    expect(dbKey?.keyPrefix).toBe(createRes.body.keyPrefix);
    expect(dbKey?.keyHash).toBeDefined();

    // 3. List keys has no secret
    const listRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].id).toBe(createRes.body.id);
    expect(listRes.body.data[0].keyPrefix).toBe(createRes.body.keyPrefix);
    expect(listRes.body.data[0].secret).toBeUndefined();

    // 4. Member gets 403
    const memberRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', member.cookies)
      .send({ name: 'Member Key', kind: ApiKeyKind.SERVER });
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 5. Create up to 10 keys
    for (let i = 2; i <= 10; i++) {
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${ws.id}/api-keys`)
        .set('Cookie', admin.cookies)
        .send({ name: `Key ${i}`, kind: ApiKeyKind.SERVER });
      expect(res.status).toBe(201);
    }

    // 11th key returns 409 API_KEY_LIMIT
    const limitRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Key 11', kind: ApiKeyKind.SERVER });
    expect(limitRes.status).toBe(409);
    expect(limitRes.body.error.code).toBe(ErrorCode.API_KEY_LIMIT);
  });

  it('T-59 AC-59: WIDGET key without origins → 400; origin ftp://x, https://x/path, 6 origins → 400; https://site.example → 201; SERVER key with no origins → 201', async () => {
    const admin = await createUserAndLogin('Admin 59', 'admin59@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 59');

    // 1. WIDGET key without origins → 400
    const noOrigins = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Widget Key', kind: ApiKeyKind.WIDGET });
    expect(noOrigins.status).toBe(400);
    expect(noOrigins.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 2. ftp://x → 400
    const ftpRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({
        name: 'Widget Key',
        kind: ApiKeyKind.WIDGET,
        allowedOrigins: ['ftp://x'],
      });
    expect(ftpRes.status).toBe(400);

    // 3. https://x/path → 400
    const pathRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({
        name: 'Widget Key',
        kind: ApiKeyKind.WIDGET,
        allowedOrigins: ['https://x/path'],
      });
    expect(pathRes.status).toBe(400);

    // 4. 6 origins → 400
    const sixOrigins = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({
        name: 'Widget Key',
        kind: ApiKeyKind.WIDGET,
        allowedOrigins: [
          'https://a.com',
          'https://b.com',
          'https://c.com',
          'https://d.com',
          'https://e.com',
          'https://f.com',
        ],
      });
    expect(sixOrigins.status).toBe(400);

    // 5. https://site.example → 201
    const validWidget = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({
        name: 'Widget Key',
        kind: ApiKeyKind.WIDGET,
        allowedOrigins: ['https://site.example'],
      });
    expect(validWidget.status).toBe(201);
    expect(validWidget.body.secret).toMatch(/^xsrag_pk_[0-9a-zA-Z]{32}$/);
    expect(validWidget.body.allowedOrigins).toEqual(['https://site.example']);

    // 6. SERVER key with no origins → 201
    const serverKey = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Server Key', kind: ApiKeyKind.SERVER });
    expect(serverKey.status).toBe(201);
    expect(serverKey.body.allowedOrigins).toEqual([]);
  });

  it('T-60 AC-60: DELETE → 204; /v1/ask with that key → 401 API_KEY_INVALID; unknown id → 404 API_KEY_NOT_FOUND', async () => {
    const admin = await createUserAndLogin('Admin 60', 'admin60@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 60');

    const keyRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'To Delete', kind: ApiKeyKind.SERVER });
    expect(keyRes.status).toBe(201);
    const { id, secret } = keyRes.body;

    // DELETE key → 204
    const delRes = await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/api-keys/${id}`)
      .set('Cookie', admin.cookies);
    expect(delRes.status).toBe(204);

    // /v1/ask with deleted key → 401 API_KEY_INVALID
    const askRes = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${secret}`)
      .send({ question: 'Are you there?' });
    expect(askRes.status).toBe(401);
    expect(askRes.body.error.code).toBe(ErrorCode.API_KEY_INVALID);

    // Unknown id → 404 API_KEY_NOT_FOUND
    const unknownDel = await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/api-keys/${randomUUID()}`)
      .set('Cookie', admin.cookies);
    expect(unknownDel.status).toBe(404);
    expect(unknownDel.body.error.code).toBe(ErrorCode.API_KEY_NOT_FOUND);
  });

  it('T-61 AC-61: /v1/ask → 200 {chatId,messageId,content,outcome,citations}; cites only ALL_MEMBERS docs (ADMINS_ONLY doc never cited); second call with chatId appends; garbage key and WIDGET key → 401 API_KEY_INVALID', async () => {
    const admin = await createUserAndLogin('Admin 61', 'admin61@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 61');

    // Doc 1: ALL_MEMBERS
    const doc1 = await insertReadyDocument(ws.id, 'Vacation Policy', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec1] = await fakeLlmProvider.embed(['Full-time vacation allowance is 25 days.']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc1.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'Full-time vacation allowance is 25 days.',
      embedding: vec1,
    });

    // Doc 2: ADMINS_ONLY
    const doc2 = await insertReadyDocument(ws.id, 'Secret Salaries', DocumentVisibility.ADMINS_ONLY, admin.user.id);
    const [vec2] = await fakeLlmProvider.embed(['Secret CEO bonus is 1000000.']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc2.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'Secret CEO bonus is 1000000.',
      embedding: vec2,
    });

    const serverKey = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Server Key', kind: ApiKeyKind.SERVER });

    const widgetKey = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Widget Key', kind: ApiKeyKind.WIDGET, allowedOrigins: ['https://example.com'] });

    // 1. /v1/ask returns 200 with JSON envelope shape
    const askRes = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${serverKey.body.secret}`)
      .send({ question: 'How much vacation allowance?' });

    expect(askRes.status).toBe(200);
    expect(askRes.body.chatId).toBeDefined();
    expect(askRes.body.messageId).toBeDefined();
    expect(askRes.body.content.length).toBeGreaterThan(0);
    expect(askRes.body.outcome).toBe(AnswerOutcome.ANSWERED);
    expect(askRes.body.citations.length).toBeGreaterThanOrEqual(1);
    expect(askRes.body.citations[0].fileName).toBe('vacation-policy.md');

    // Query targeting ADMINS_ONLY doc never cites it (returns UNANSWERED or no citation from doc2)
    const secretAsk = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${serverKey.body.secret}`)
      .send({ question: 'Secret CEO bonus 1000000' });
    const citedDocNames = secretAsk.body.citations.map((c: any) => c.fileName);
    expect(citedDocNames).not.toContain('secret-salaries.md');

    // 2. Second call with chatId appends to same chat
    const followUpRes = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${serverKey.body.secret}`)
      .send({
        chatId: askRes.body.chatId,
        question: 'vacation allowance follow up',
      });
    expect(followUpRes.status).toBe(200);
    expect(followUpRes.body.chatId).toBe(askRes.body.chatId);

    const messagesCount = await prisma.message.count({
      where: { chatId: askRes.body.chatId },
    });
    expect(messagesCount).toBe(4); // user, assistant, user, assistant

    // 3. Garbage key → 401 API_KEY_INVALID
    const garbageRes = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', 'Bearer invalid-garbage-key')
      .send({ question: 'Hello' });
    expect(garbageRes.status).toBe(401);
    expect(garbageRes.body.error.code).toBe(ErrorCode.API_KEY_INVALID);

    // 4. WIDGET key on /v1/ask → 401 API_KEY_INVALID
    const widgetAsk = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${widgetKey.body.secret}`)
      .send({ question: 'Hello' });
    expect(widgetAsk.status).toBe(401);
    expect(widgetAsk.body.error.code).toBe(ErrorCode.API_KEY_INVALID);
  });

  it(
    'T-62 AC-62: missing question → 400; chatId from another key → 404 CHAT_NOT_FOUND; with V1_RATE_PER_MIN=60, 61st call in a minute → 429 RATE_LIMITED',
    async () => {
    const admin = await createUserAndLogin('Admin 62', 'admin62@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 62');
    const doc = await insertReadyDocument(ws.id, 'Doc 62', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['sample text 62']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'sample text 62',
      embedding: vec,
    });

    const key1 = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Key 1', kind: ApiKeyKind.SERVER });

    const key2 = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({ name: 'Key 2', kind: ApiKeyKind.SERVER });

    // 1. Missing question → 400
    const badBody = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${key1.body.secret}`)
      .send({});
    expect(badBody.status).toBe(400);
    expect(badBody.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 2. Chat from another key → 404 CHAT_NOT_FOUND
    const chat1Res = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${key1.body.secret}`)
      .send({ question: 'sample text 62' });
    expect(chat1Res.status).toBe(200);

    const crossKeyRes = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${key2.body.secret}`)
      .send({ chatId: chat1Res.body.chatId, question: 'sample text 62' });
    expect(crossKeyRes.status).toBe(404);
    expect(crossKeyRes.body.error.code).toBe(ErrorCode.CHAT_NOT_FOUND);

    // 3. 61st call in a minute → 429 RATE_LIMITED
    process.env.V1_RATE_PER_MIN = '60';
    // We already made 1 call with key1. Make 59 more calls.
    for (let i = 0; i < 59; i++) {
      const res = await request(app.getHttpServer())
        .post('/v1/ask')
        .set('Authorization', `Bearer ${key1.body.secret}`)
        .send({ question: 'sample text 62' });
      expect(res.status).toBe(200);
    }

    // 61st call returns 429
    const rateRes = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${key1.body.secret}`)
      .send({ question: 'sample text 62' });
    expect(rateRes.status).toBe(429);
    expect(rateRes.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(rateRes.headers).toHaveProperty('retry-after');
  }, 30000);

  it('T-63 AC-63: GET /public/demo without auth → name, only ALL_MEMBERS READY documents, 4 suggested questions, limit; no demo workspace → 404 WORKSPACE_NOT_FOUND', async () => {
    // 1. No demo workspace → 404 WORKSPACE_NOT_FOUND
    const noDemoRes = await request(app.getHttpServer()).get('/public/demo');
    expect(noDemoRes.status).toBe(404);
    expect(noDemoRes.body.error.code).toBe(ErrorCode.WORKSPACE_NOT_FOUND);

    // 2. Create demo workspace
    const admin = await createUserAndLogin('Demo Admin', 'demoadmin@example.com');
    const demoWs = await prisma.workspace.create({
      data: {
        name: 'Acme Demo',
        slug: 'acme-demo',
        isDemo: true,
        suggestedQuestions: [
          'What is the vacation policy?',
          'How do expense reports work?',
          'Can I work remotely?',
          'What are the core hours?',
        ],
        createdById: admin.user.id,
      },
    });

    // Create docs: ALL_MEMBERS READY, ADMINS_ONLY READY, ALL_MEMBERS PROCESSING
    const docReady = await insertReadyDocument(demoWs.id, 'Leave Policy', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    await insertReadyDocument(demoWs.id, 'Admin Only Doc', DocumentVisibility.ADMINS_ONLY, admin.user.id);
    await prisma.document.create({
      data: {
        workspaceId: demoWs.id,
        title: 'Processing Doc',
        sourceType: 'MARKDOWN',
        visibility: DocumentVisibility.ALL_MEMBERS,
        status: DocumentStatus.PROCESSING,
        contentHash: randomUUID(),
        uploadedById: admin.user.id,
        fileName: 'processing.md',
        mimeType: 'text/markdown',
        sizeBytes: 100,
        chunkCount: 0,
      },
    });

    const demoRes = await request(app.getHttpServer()).get('/public/demo');
    expect(demoRes.status).toBe(200);
    expect(demoRes.body.workspaceName).toBe('Acme Demo');
    expect(demoRes.body.suggestedQuestions.length).toBe(4);
    expect(demoRes.body.limit).toEqual({ perSession: 10, windowHours: 24 });
    expect(demoRes.body.documents).toHaveLength(1);
    expect(demoRes.body.documents[0].id).toBe(docReady.id);
    expect(demoRes.body.documents[0].title).toBe('Leave Policy');
  });

  it('T-64 AC-64: POST /public/sessions → token; with valid widgetKey → token with pt=WIDGET; random widgetKey → 404 WIDGET_NOT_FOUND', async () => {
    const admin = await createUserAndLogin('Admin 64', 'admin64@example.com');
    await prisma.workspace.create({
      data: {
        name: 'Acme Demo',
        slug: 'acme-demo',
        isDemo: true,
        createdById: admin.user.id,
      },
    });

    const customWs = await createWorkspace(admin.cookies, 'Custom WS 64');
    const widgetKeyRes = await request(app.getHttpServer())
      .post(`/workspaces/${customWs.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({
        name: 'Widget 64',
        kind: ApiKeyKind.WIDGET,
        allowedOrigins: ['https://widget.example'],
      });

    // 1. POST /public/sessions without widgetKey → demo session (pt=VISITOR)
    const demoSession = await request(app.getHttpServer())
      .post('/public/sessions')
      .send({});
    expect(demoSession.status).toBe(201);
    expect(demoSession.body.sessionToken).toBeDefined();
    expect(demoSession.body.expiresAt).toBeDefined();
    expect(demoSession.body.questionsRemaining).toBe(10);

    // 2. With valid widgetKey → widget session (pt=WIDGET)
    const widgetSession = await request(app.getHttpServer())
      .post('/public/sessions')
      .send({ widgetKey: widgetKeyRes.body.secret });
    expect(widgetSession.status).toBe(201);
    expect(widgetSession.body.questionsRemaining).toBe(20);

    // 3. Random widgetKey → 404 WIDGET_NOT_FOUND
    const badWidget = await request(app.getHttpServer())
      .post('/public/sessions')
      .send({ widgetKey: 'xsrag_pk_invalidrandom1234567890123456' });
    expect(badWidget.status).toBe(404);
    expect(badWidget.body.error.code).toBe(ErrorCode.WIDGET_NOT_FOUND);
  });

  it('T-65 AC-65: visitor: create chat, stream answer with citations, GET chat, open passage → all 200; second session GET same chat → 404 CHAT_NOT_FOUND; widget session does the same on its workspace', async () => {
    const admin = await createUserAndLogin('Admin 65', 'admin65@example.com');
    const demoWs = await prisma.workspace.create({
      data: {
        name: 'Acme Demo',
        slug: 'acme-demo',
        isDemo: true,
        createdById: admin.user.id,
      },
    });

    const demoDoc = await insertReadyDocument(demoWs.id, 'Demo Handbook', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [demoVec] = await fakeLlmProvider.embed(['Demo handbook content with instructions.']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: demoDoc.id,
      workspaceId: demoWs.id,
      ordinal: 0,
      text: 'Demo handbook content with instructions.',
      embedding: demoVec,
    });

    // 1. Visitor session
    const session1 = await request(app.getHttpServer())
      .post('/public/sessions')
      .send({});
    const token1 = session1.body.sessionToken;

    // Create chat
    const chatRes1 = await request(app.getHttpServer())
      .post('/public/chats')
      .set('Authorization', `Bearer ${token1}`);
    expect(chatRes1.status).toBe(201);
    const chatId1 = chatRes1.body.id;

    // Stream message
    const sseRes1 = await postSse(
      serverPort,
      `/public/chats/${chatId1}/messages`,
      `Bearer ${token1}`,
      { question: 'Demo handbook content question' },
    );
    expect(sseRes1.status).toBe(200);

    const metaEvt = sseRes1.events.find((e) => e.event === 'meta');
    expect(metaEvt?.data.questionsRemaining).toBe(9);
    const citEvt = sseRes1.events.find((e) => e.event === 'citations');
    expect(citEvt?.data.citations.length).toBeGreaterThanOrEqual(1);
    const citationId = citEvt?.data.citations[0].id;

    // GET chat
    const getChat1 = await request(app.getHttpServer())
      .get(`/public/chats/${chatId1}`)
      .set('Authorization', `Bearer ${token1}`);
    expect(getChat1.status).toBe(200);
    expect(getChat1.body.messages.length).toBe(2);

    // Open citation passage
    const passageRes = await request(app.getHttpServer())
      .get(`/public/citations/${citationId}/passage`)
      .set('Authorization', `Bearer ${token1}`);
    expect(passageRes.status).toBe(200);
    expect(passageRes.body.text).toContain('Demo handbook content');

    // Second visitor session GET same chat → 404 CHAT_NOT_FOUND
    const session2 = await request(app.getHttpServer())
      .post('/public/sessions')
      .send({});
    const strangerGet = await request(app.getHttpServer())
      .get(`/public/chats/${chatId1}`)
      .set('Authorization', `Bearer ${session2.body.sessionToken}`);
    expect(strangerGet.status).toBe(404);
    expect(strangerGet.body.error.code).toBe(ErrorCode.CHAT_NOT_FOUND);

    // 2. Widget session does the same on its workspace
    const customWs = await createWorkspace(admin.cookies, 'Custom WS 65');
    const customDoc = await insertReadyDocument(customWs.id, 'Custom Guide', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [cVec] = await fakeLlmProvider.embed(['Custom widget guide text.']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: customDoc.id,
      workspaceId: customWs.id,
      ordinal: 0,
      text: 'Custom widget guide text.',
      embedding: cVec,
    });

    const widgetKey = await request(app.getHttpServer())
      .post(`/workspaces/${customWs.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({
        name: 'Widget Key 65',
        kind: ApiKeyKind.WIDGET,
        allowedOrigins: ['https://custom.site'],
      });

    const widgetSession = await request(app.getHttpServer())
      .post('/public/sessions')
      .send({ widgetKey: widgetKey.body.secret });

    const wToken = widgetSession.body.sessionToken;
    const wChat = await request(app.getHttpServer())
      .post('/public/chats')
      .set('Authorization', `Bearer ${wToken}`);
    expect(wChat.status).toBe(201);

    const wSse = await postSse(
      serverPort,
      `/public/chats/${wChat.body.id}/messages`,
      `Bearer ${wToken}`,
      { question: 'Custom widget guide question' },
    );
    expect(wSse.status).toBe(200);
    const wMeta = wSse.events.find((e) => e.event === 'meta');
    expect(wMeta?.data.questionsRemaining).toBe(19);

    const wGetChat = await request(app.getHttpServer())
      .get(`/public/chats/${wChat.body.id}`)
      .set('Authorization', `Bearer ${wToken}`);
    expect(wGetChat.status).toBe(200);
  });

  it(
    'T-66 AC-66: 10 questions OK, 11th → 429 DEMO_LIMIT_REACHED (JSON before stream) with details.limit=10, message = DEMO_LIMIT; fresh sessions from one IP stop at 30; widget allows 20; an ERROR message does not count',
    async () => {
      const admin = await createUserAndLogin('Admin 66', 'admin66@example.com');
      const demoWs = await prisma.workspace.create({
        data: {
          name: 'Acme Demo',
          slug: 'acme-demo',
          isDemo: true,
          createdById: admin.user.id,
        },
      });

      const doc = await insertReadyDocument(demoWs.id, 'Doc 66', DocumentVisibility.ALL_MEMBERS, admin.user.id);
      const [vec] = await fakeLlmProvider.embed(['sample text 66 for limits']);
      await insertTestChunk(prisma, {
        id: randomUUID(),
        documentId: doc.id,
        workspaceId: demoWs.id,
        ordinal: 0,
        text: 'sample text 66 for limits',
        embedding: vec,
      });

      // 1. Session 1: insert 8 COMPLETE messages, 1 ERROR message
      const session1 = await request(app.getHttpServer())
        .post('/public/sessions')
        .send({});
      const token1 = session1.body.sessionToken;

      const chat1 = await request(app.getHttpServer())
        .post('/public/chats')
        .set('Authorization', `Bearer ${token1}`);

      for (let i = 0; i < 8; i++) {
        await prisma.message.create({
          data: {
            chatId: chat1.body.id,
            workspaceId: demoWs.id,
            role: MessageRole.ASSISTANT,
            content: `simulated answer ${i}`,
            status: MessageStatus.COMPLETE,
          },
        });
      }

      // Add 1 ERROR message (must NOT count towards the limit)
      await prisma.message.create({
        data: {
          chatId: chat1.body.id,
          workspaceId: demoWs.id,
          role: MessageRole.ASSISTANT,
          content: 'Error content',
          status: MessageStatus.ERROR,
        },
      });

      // 9th question (counted as 9th because ERROR does not count)
      const sse9 = await postSse(
        serverPort,
        `/public/chats/${chat1.body.id}/messages`,
        `Bearer ${token1}`,
        { question: 'sample text 66 for limits' },
      );
      expect(sse9.status).toBe(200);

      // 10th question succeeds
      const sse10 = await postSse(
        serverPort,
        `/public/chats/${chat1.body.id}/messages`,
        `Bearer ${token1}`,
        { question: 'sample text 66 for limits' },
      );
      expect(sse10.status).toBe(200);

      // 11th question returns 429 DEMO_LIMIT_REACHED JSON before stream
      const limitRes = await request(app.getHttpServer())
        .post(`/public/chats/${chat1.body.id}/messages`)
        .set('Authorization', `Bearer ${token1}`)
        .send({ question: 'sample text 66 for limits' });

      expect(limitRes.status).toBe(429);
      expect(limitRes.body.error.code).toBe(ErrorCode.DEMO_LIMIT_REACHED);
      expect(limitRes.body.error.message).toBe(LockedCopy.DEMO_LIMIT);
      expect(limitRes.body.error.details.limit).toBe(10);
      expect(limitRes.body.error.details.scope).toBe('session');
      expect(limitRes.body.error.details.resetsAt).toBeDefined();

      // 2. Fresh sessions from one IP stop at 30:
      // Session 1 already has 10 COMPLETE messages for this IP.
      // Create Session 2 and insert 10 messages:
      const session2 = await request(app.getHttpServer())
        .post('/public/sessions')
        .send({});
      const token2 = session2.body.sessionToken;
      const chat2 = await request(app.getHttpServer())
        .post('/public/chats')
        .set('Authorization', `Bearer ${token2}`);

      for (let i = 0; i < 10; i++) {
        await prisma.message.create({
          data: {
            chatId: chat2.body.id,
            workspaceId: demoWs.id,
            role: MessageRole.ASSISTANT,
            content: `simulated answer s2 ${i}`,
            status: MessageStatus.COMPLETE,
          },
        });
      }

      // Create Session 3 and insert 10 messages: (Total for IP is now 10 + 10 + 10 = 30)
      const session3 = await request(app.getHttpServer())
        .post('/public/sessions')
        .send({});
      const token3 = session3.body.sessionToken;
      const chat3 = await request(app.getHttpServer())
        .post('/public/chats')
        .set('Authorization', `Bearer ${token3}`);

      for (let i = 0; i < 10; i++) {
        await prisma.message.create({
          data: {
            chatId: chat3.body.id,
            workspaceId: demoWs.id,
            role: MessageRole.ASSISTANT,
            content: `simulated answer s3 ${i}`,
            status: MessageStatus.COMPLETE,
          },
        });
      }

      // Create Session 4 (fresh session from same IP with 0 session messages):
      // 31st request for this IP returns 429 with scope='ip'
      const session4 = await request(app.getHttpServer())
        .post('/public/sessions')
        .send({});
      const token4 = session4.body.sessionToken;
      const chat4 = await request(app.getHttpServer())
        .post('/public/chats')
        .set('Authorization', `Bearer ${token4}`);

      const ipLimitRes = await request(app.getHttpServer())
        .post(`/public/chats/${chat4.body.id}/messages`)
        .set('Authorization', `Bearer ${token4}`)
        .send({ question: 'sample text 66 for limits' });

      expect(ipLimitRes.status).toBe(429);
      expect(ipLimitRes.body.error.code).toBe(ErrorCode.DEMO_LIMIT_REACHED);
      expect(ipLimitRes.body.error.details.limit).toBe(30);
      expect(ipLimitRes.body.error.details.scope).toBe('ip');

      // 3. Widget session allows 20
      const customWs = await createWorkspace(admin.cookies, 'WS Widget 66');
      const wDoc = await insertReadyDocument(customWs.id, 'Widget Doc 66', DocumentVisibility.ALL_MEMBERS, admin.user.id);
      const [wVec] = await fakeLlmProvider.embed(['widget text 66']);
      await insertTestChunk(prisma, {
        id: randomUUID(),
        documentId: wDoc.id,
        workspaceId: customWs.id,
        ordinal: 0,
        text: 'widget text 66',
        embedding: wVec,
      });

      const wKey = await request(app.getHttpServer())
        .post(`/workspaces/${customWs.id}/api-keys`)
        .set('Cookie', admin.cookies)
        .send({
          name: 'W66',
          kind: ApiKeyKind.WIDGET,
          allowedOrigins: ['https://widget66.example'],
        });

      const wSession = await request(app.getHttpServer())
        .post('/public/sessions')
        .send({ widgetKey: wKey.body.secret });
      const wToken = wSession.body.sessionToken;

      const wChat = await request(app.getHttpServer())
        .post('/public/chats')
        .set('Authorization', `Bearer ${wToken}`);

      // Insert 19 messages in wChat
      for (let i = 0; i < 19; i++) {
        await prisma.message.create({
          data: {
            chatId: wChat.body.id,
            workspaceId: customWs.id,
            role: MessageRole.ASSISTANT,
            content: 'widget answer',
            status: MessageStatus.COMPLETE,
          },
        });
      }

      // 20th message succeeds
      const wSse20 = await postSse(
        serverPort,
        `/public/chats/${wChat.body.id}/messages`,
        `Bearer ${wToken}`,
        { question: 'widget text 66' },
      );
      expect(wSse20.status).toBe(200);

      // 21st message returns 429 with widget limit
      const wLimitRes = await request(app.getHttpServer())
        .post(`/public/chats/${wChat.body.id}/messages`)
        .set('Authorization', `Bearer ${wToken}`)
        .send({ question: 'widget text 66' });

      expect(wLimitRes.status).toBe(429);
      expect(wLimitRes.body.error.code).toBe(ErrorCode.DEMO_LIMIT_REACHED);
      expect(wLimitRes.body.error.message).toBe(LockedCopy.WIDGET_LIMIT);
      expect(wLimitRes.body.error.details.limit).toBe(20);
      expect(wLimitRes.body.error.details.scope).toBe('session');
    },
    30000,
  );

  it('T-67 AC-67: session token on /workspaces/:wid/chats and /v1/ask → 401; cookie on /public/chats → 401; feedback with session token → 401', async () => {
    const admin = await createUserAndLogin('Admin 67', 'admin67@example.com');
    const demoWs = await prisma.workspace.create({
      data: {
        name: 'Acme Demo',
        slug: 'acme-demo',
        isDemo: true,
        createdById: admin.user.id,
      },
    });

    const session = await request(app.getHttpServer())
      .post('/public/sessions')
      .send({});
    const token = session.body.sessionToken;

    // 1. Session token on /workspaces/:wid/chats → 401
    const wsChatsRes = await request(app.getHttpServer())
      .post(`/workspaces/${demoWs.id}/chats`)
      .set('Authorization', `Bearer ${token}`);
    expect(wsChatsRes.status).toBe(401);
    expect(wsChatsRes.body.error.code).toBe(ErrorCode.AUTH_REQUIRED);

    // 2. Session token on /v1/ask → 401
    const v1Res = await request(app.getHttpServer())
      .post('/v1/ask')
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Hello' });
    expect(v1Res.status).toBe(401);
    expect(v1Res.body.error.code).toBe(ErrorCode.API_KEY_INVALID);

    // 3. Cookie on /public/chats without session token → 401
    const cookiePublic = await request(app.getHttpServer())
      .post('/public/chats')
      .set('Cookie', admin.cookies);
    expect(cookiePublic.status).toBe(401);
    expect(cookiePublic.body.error.code).toBe(ErrorCode.AUTH_REQUIRED);

    // 4. Feedback with session token → 401
    const feedbackRes = await request(app.getHttpServer())
      .put(`/workspaces/${demoWs.id}/messages/${randomUUID()}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 'UP' });
    expect(feedbackRes.status).toBe(401);
    expect(feedbackRes.body.error.code).toBe(ErrorCode.AUTH_REQUIRED);
  });

  it('T-68 AC-68: api: config returns name, welcome text and origins; unknown key 404', async () => {
    const admin = await createUserAndLogin('Admin 68', 'admin68@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 68');

    const keyRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/api-keys`)
      .set('Cookie', admin.cookies)
      .send({
        name: 'Website Widget',
        kind: ApiKeyKind.WIDGET,
        allowedOrigins: ['https://site.example', 'http://localhost:3000'],
      });
    expect(keyRes.status).toBe(201);
    const widgetSecret = keyRes.body.secret;

    // 1. GET /public/widget/:widgetKey/config returns workspaceName, welcomeText and allowedOrigins
    const configRes = await request(app.getHttpServer()).get(
      `/public/widget/${widgetSecret}/config`,
    );
    expect(configRes.status).toBe(200);
    expect(configRes.body.workspaceName).toBe('WS 68');
    expect(configRes.body.welcomeText).toBe(LockedCopy.CHAT_EMPTY);
    expect(configRes.body.allowedOrigins).toEqual([
      'https://site.example',
      'http://localhost:3000',
    ]);

    // 2. Unknown key → 404 WIDGET_NOT_FOUND
    const unknownRes = await request(app.getHttpServer()).get(
      '/public/widget/xsrag_pk_unknownkey123456789012345678/config',
    );
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.body.error.code).toBe(ErrorCode.WIDGET_NOT_FOUND);
  });
});
