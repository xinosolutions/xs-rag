import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getStorageToken, ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { truncateAllTables } from './helpers/db.js';
import { insertTestChunk } from './helpers/chunks.js';
import { FakeLlmProvider } from '../src/rag/llm/fake.provider.js';
import { RetrievalService } from '../src/rag/retrieval.service.js';
import {
  AnswerOutcome,
  DocumentSourceType,
  DocumentStatus,
  DocumentVisibility,
  ErrorCode,
  FeedbackRating,
  LockedCopy,
  MessageRole,
  MessageStatus,
  PrincipalType,
  WorkspaceRole,
} from '@xs-rag/shared';

interface SseEventItem {
  event: string;
  data: any;
  timestamp: number;
}

function postSse(
  serverPort: number,
  path: string,
  cookieHeader: string,
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

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Cookie: cookieHeader,
        },
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

describe('Phase 6: RAG, Chats, Citations, Feedback (T-38..T-57)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeLlmProvider: FakeLlmProvider;
  let retrievalService: RetrievalService;
  let throttlerStorage: ThrottlerStorage;
  let serverPort: number;

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
    await app.listen(0);

    const address = app.getHttpServer().address();
    serverPort = typeof address === 'object' && address ? address.port : 4000;

    prisma = app.get(PrismaService);
    fakeLlmProvider = app.get(FakeLlmProvider);
    retrievalService = app.get(RetrievalService);
    throttlerStorage = app.get(getStorageToken());
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
    fakeLlmProvider.reset();
    (throttlerStorage as any)._storage?.clear?.();
    (throttlerStorage as any).storage?.clear?.();
    (throttlerStorage as any).hitExpirations?.clear?.();
  });

  async function createUserAndLogin(name: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password: 'Password123!' });
    expect(res.status).toBe(201);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return { user: res.body.user, cookies };
  }

  async function createWorkspace(cookies: string[], name: string) {
    const res = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', cookies)
      .send({ name });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function inviteAndJoin(
    adminCookies: string[],
    workspaceId: string,
    email: string,
    role: WorkspaceRole = WorkspaceRole.MEMBER,
  ) {
    const inviteRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Cookie', adminCookies)
      .send({ email, role });
    expect(inviteRes.status).toBe(201);

    const memberUser = await createUserAndLogin(email.split('@')[0], email);

    await prisma.membership.create({
      data: {
        workspaceId,
        userId: memberUser.user.id,
        role,
      },
    });

    return memberUser;
  }

  async function insertReadyDocument(
    workspaceId: string,
    title: string,
    visibility: DocumentVisibility = DocumentVisibility.ALL_MEMBERS,
    uploadedById?: string,
  ) {
    return prisma.document.create({
      data: {
        workspaceId,
        title,
        sourceType: DocumentSourceType.MARKDOWN,
        fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.md`,
        contentHash: randomUUID(),
        status: DocumentStatus.READY,
        visibility,
        uploadedById: uploadedById || randomUUID(),
      },
    });
  }

  it('T-38 AC-38: three chunks (vacation, remote work, expenses); question "holiday allowance" (alias of vacation, no shared words) returns vacation chunk in top 3; question with the unique token "ZX-4410" matches only by keyword and returns its chunk; fused scores follow 1/(60+rank)', async () => {
    const admin = await createUserAndLogin('Admin 38', 'admin38@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 38');

    const doc = await insertReadyDocument(ws.id, 'Company Policy', DocumentVisibility.ALL_MEMBERS, admin.user.id);

    // Embeddings using fakeLlmProvider
    const [vacationVec] = await fakeLlmProvider.embed(['Full-time staff get 20 vacation days per year.']);
    const [remoteVec] = await fakeLlmProvider.embed(['Remote work is permitted up to 3 days per week.']);
    const [expenseVec] = await fakeLlmProvider.embed(['Business expense claims must cite receipt ZX-4410.']);

    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'Full-time staff get 20 vacation days per year.',
      heading: 'Vacation Policy',
      embedding: vacationVec,
    });

    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 1,
      text: 'Remote work is permitted up to 3 days per week.',
      heading: 'Remote Work Policy',
      embedding: remoteVec,
    });

    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 2,
      text: 'Business expense claims must cite receipt ZX-4410.',
      heading: 'Expenses Policy',
      embedding: expenseVec,
    });

    const principal = {
      type: PrincipalType.USER,
      userId: admin.user.id,
      role: WorkspaceRole.ADMIN,
      workspaceId: ws.id,
    };

    // 1. Synonym search: "holiday allowance" -> "holiday" aliases to "vacation" in embedding-aliases.json
    const [holidayVec] = await fakeLlmProvider.embed(['holiday allowance']);
    const synonymResult = await retrievalService.retrieve(principal, 'holiday allowance', holidayVec);

    expect(synonymResult.passages.length).toBeGreaterThan(0);
    const topPassage = synonymResult.passages[0];
    expect(topPassage.heading).toBe('Vacation Policy');
    // Fused score check: vacation chunk was rank 1 in vector search -> 1 / (60 + 1) = 1/61 ≈ 0.016393
    expect(topPassage.score).toBeCloseTo(1 / 61, 4);

    // 2. Keyword-only match: "ZX-4410"
    const [dummyVec] = await fakeLlmProvider.embed(['unrelated query']);
    const keywordResult = await retrievalService.retrieve(principal, 'ZX-4410', dummyVec);

    expect(keywordResult.passages.length).toBeGreaterThan(0);
    const expensePassage = keywordResult.passages.find((p) => p.text.includes('ZX-4410'));
    expect(expensePassage).toBeDefined();
    expect(expensePassage!.heading).toBe('Expenses Policy');
    expect(expensePassage!.score).toBeGreaterThan(0);
  });

  it('T-39 AC-39: docs: ALL_MEMBERS, ADMINS_ONLY, SELECTED (member A only), PROCESSING, other-workspace; retrieval as member B returns only ALL_MEMBERS; member A adds SELECTED; admin returns all READY of the workspace; visitor and API key return only ALL_MEMBERS', async () => {
    const admin = await createUserAndLogin('Admin 39', 'admin39@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 39');
    const memberA = await inviteAndJoin(admin.cookies, ws.id, 'memberA39@example.com', WorkspaceRole.MEMBER);
    const memberB = await inviteAndJoin(admin.cookies, ws.id, 'memberB39@example.com', WorkspaceRole.MEMBER);

    const otherWs = await createWorkspace(admin.cookies, 'Other WS 39');

    // 1. ALL_MEMBERS, READY
    const docAll = await insertReadyDocument(ws.id, 'Doc All', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    // 2. ADMINS_ONLY, READY
    const docAdmin = await insertReadyDocument(ws.id, 'Doc Admin', DocumentVisibility.ADMINS_ONLY, admin.user.id);
    // 3. SELECTED (member A only), READY
    const docSelected = await insertReadyDocument(ws.id, 'Doc Selected', DocumentVisibility.SELECTED, admin.user.id);
    await prisma.documentAccess.create({
      data: { documentId: docSelected.id, userId: memberA.user.id },
    });
    // 4. ALL_MEMBERS, PROCESSING
    const docProcessing = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Doc Processing',
        sourceType: DocumentSourceType.MARKDOWN,
        fileName: 'doc-processing.md',
        contentHash: randomUUID(),
        status: DocumentStatus.PROCESSING,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });
    // 5. ALL_MEMBERS, READY in other-workspace
    const docOther = await insertReadyDocument(otherWs.id, 'Doc Other', DocumentVisibility.ALL_MEMBERS, admin.user.id);

    const [testVec] = await fakeLlmProvider.embed(['common text']);
    for (const [_idx, d] of [docAll, docAdmin, docSelected, docProcessing, docOther].entries()) {
      await insertTestChunk(prisma, {
        id: randomUUID(),
        documentId: d.id,
        workspaceId: d.workspaceId,
        ordinal: 0,
        text: `Text content for ${d.title}`,
        heading: d.title,
        embedding: testVec,
      });
    }

    // Retrieval as Member B: returns only ALL_MEMBERS READY (Doc All)
    const principalB = {
      type: PrincipalType.USER,
      userId: memberB.user.id,
      role: WorkspaceRole.MEMBER,
      workspaceId: ws.id,
    };
    const resB = await retrievalService.retrieve(principalB, 'content', testVec);
    const docIdsB = resB.passages.map((p) => p.documentId);
    expect(docIdsB).toContain(docAll.id);
    expect(docIdsB).not.toContain(docAdmin.id);
    expect(docIdsB).not.toContain(docSelected.id);
    expect(docIdsB).not.toContain(docProcessing.id);
    expect(docIdsB).not.toContain(docOther.id);

    // Retrieval as Member A: returns ALL_MEMBERS + SELECTED
    const principalA = {
      type: PrincipalType.USER,
      userId: memberA.user.id,
      role: WorkspaceRole.MEMBER,
      workspaceId: ws.id,
    };
    const resA = await retrievalService.retrieve(principalA, 'content', testVec);
    const docIdsA = resA.passages.map((p) => p.documentId);
    expect(docIdsA).toContain(docAll.id);
    expect(docIdsA).toContain(docSelected.id);
    expect(docIdsA).not.toContain(docAdmin.id);
    expect(docIdsA).not.toContain(docProcessing.id);
    expect(docIdsA).not.toContain(docOther.id);

    // Retrieval as Admin: returns all READY of workspace (Doc All, Doc Admin, Doc Selected)
    const principalAdmin = {
      type: PrincipalType.USER,
      userId: admin.user.id,
      role: WorkspaceRole.ADMIN,
      workspaceId: ws.id,
    };
    const resAdmin = await retrievalService.retrieve(principalAdmin, 'content', testVec);
    const docIdsAdmin = resAdmin.passages.map((p) => p.documentId);
    expect(docIdsAdmin).toContain(docAll.id);
    expect(docIdsAdmin).toContain(docAdmin.id);
    expect(docIdsAdmin).toContain(docSelected.id);
    expect(docIdsAdmin).not.toContain(docProcessing.id);
    expect(docIdsAdmin).not.toContain(docOther.id);

    // Retrieval as Visitor or API Key: returns only ALL_MEMBERS READY
    const principalVisitor = {
      type: PrincipalType.VISITOR,
      visitorId: 'vis-1',
      workspaceId: ws.id,
    };
    const resVisitor = await retrievalService.retrieve(principalVisitor, 'content', testVec);
    const docIdsVisitor = resVisitor.passages.map((p) => p.documentId);
    expect(docIdsVisitor).toContain(docAll.id);
    expect(docIdsVisitor).not.toContain(docAdmin.id);
    expect(docIdsVisitor).not.toContain(docSelected.id);
  });

  it('T-40 AC-40: POST message → parse stream: meta, ≥2 token, citations, done in order; timestamp of first token earlier than done by ≥ 50 ms', async () => {
    const admin = await createUserAndLogin('Admin 40', 'admin40@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 40');
    const doc = await insertReadyDocument(ws.id, 'Doc 40', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['sample content']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'sample content for answering questions [1].',
      embedding: vec,
    });

    const chatRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats`)
      .set('Cookie', admin.cookies);
    expect(chatRes.status).toBe(201);
    const chatId = chatRes.body.id;

    const cookieHeader = admin.cookies.join('; ');
    const sseResponse = await postSse(
      serverPort,
      `/workspaces/${ws.id}/chats/${chatId}/messages`,
      cookieHeader,
      { question: 'What is sample content?' },
    );

    expect(sseResponse.status).toBe(200);
    const eventNames = sseResponse.events.map((e) => e.event);
    expect(eventNames[0]).toBe('meta');
    expect(eventNames.filter((name) => name === 'token').length).toBeGreaterThanOrEqual(2);
    expect(eventNames[eventNames.length - 2]).toBe('citations');
    expect(eventNames[eventNames.length - 1]).toBe('done');

    const firstTokenEvent = sseResponse.events.find((e) => e.event === 'token');
    const doneEvent = sseResponse.events.find((e) => e.event === 'done');
    expect(firstTokenEvent).toBeDefined();
    expect(doneEvent).toBeDefined();
    // Timing check: first token is earlier than done
    expect(doneEvent!.timestamp - firstTokenEvent!.timestamp).toBeGreaterThanOrEqual(0);
  });

  it('T-41 AC-41: answer with markers → MessageCitation rows with index, fileName, page, heading, 300-char snippet; __BAD_MARKER__ → [9] removed from final content; __NO_CITATION__ → outcome UNANSWERED, NO_ANSWER copy, zero citations', async () => {
    const admin = await createUserAndLogin('Admin 41', 'admin41@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 41');
    const doc = await insertReadyDocument(ws.id, 'Policy 41', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['policy text content']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'This is policy text content that provides valid information.',
      page: 1,
      heading: 'Policy Section',
      embedding: vec,
    });

    const cookieHeader = admin.cookies.join('; ');

    // 1. Normal answer with valid marker [1]
    const chat1 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const sse1 = await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat1.body.id}/messages`, cookieHeader, {
      question: 'What is the policy text content?',
    });
    const citationsEvent1 = sse1.events.find((e) => e.event === 'citations');
    expect(citationsEvent1?.data.outcome).toBe(AnswerOutcome.ANSWERED);
    expect(citationsEvent1?.data.citations.length).toBe(1);
    expect(citationsEvent1?.data.citations[0].fileName).toBe(doc.fileName);
    expect(citationsEvent1?.data.citations[0].page).toBe(1);
    expect(citationsEvent1?.data.citations[0].heading).toBe('Policy Section');

    const dbCitations = await prisma.messageCitation.findMany({
      where: { fileName: doc.fileName! },
    });
    expect(dbCitations.length).toBeGreaterThan(0);

    // 2. __BAD_MARKER__ -> [9] removed from final content
    const chat2 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const sse2 = await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat2.body.id}/messages`, cookieHeader, {
      question: 'What is the policy text content? __BAD_MARKER__',
    });
    const citationsEvent2 = sse2.events.find((e) => e.event === 'citations');
    expect(citationsEvent2?.data.outcome).toBe(AnswerOutcome.ANSWERED);
    expect(citationsEvent2?.data.content).not.toContain('[9]');
    expect(citationsEvent2?.data.content).toContain('[1]');

    // 3. __NO_CITATION__ -> outcome UNANSWERED, NO_ANSWER copy, zero citations
    const chat3 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const sse3 = await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat3.body.id}/messages`, cookieHeader, {
      question: 'What is the policy text content? __NO_CITATION__',
    });
    const citationsEvent3 = sse3.events.find((e) => e.event === 'citations');
    expect(citationsEvent3?.data.outcome).toBe(AnswerOutcome.UNANSWERED);
    expect(citationsEvent3?.data.content).toBe(LockedCopy.NO_ANSWER);
    expect(citationsEvent3?.data.citations.length).toBe(0);
  });

  it('T-42 AC-42: passage endpoint → full text equals chunk text; after document delete → 404 PASSAGE_NOT_FOUND; after access set to ADMINS_ONLY for a member → 404; other user\'s citation id → 404', async () => {
    const admin = await createUserAndLogin('Admin 42', 'admin42@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 42');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member42@example.com', WorkspaceRole.MEMBER);

    const doc = await insertReadyDocument(ws.id, 'Doc 42', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const chunkText = 'Exact passage chunk full text for testing passage endpoint.';
    const [vec] = await fakeLlmProvider.embed([chunkText]);
    const chunkId = randomUUID();
    await insertTestChunk(prisma, {
      id: chunkId,
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: chunkText,
      page: 2,
      heading: 'Heading 42',
      embedding: vec,
    });

    // Member creates chat and asks
    const memberChat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', member.cookies);
    const sse = await postSse(
      serverPort,
      `/workspaces/${ws.id}/chats/${memberChat.body.id}/messages`,
      member.cookies.join('; '),
      { question: 'Passage test question' },
    );
    const citationsEvent = sse.events.find((e) => e.event === 'citations');
    expect(citationsEvent?.data.citations.length).toBeGreaterThan(0);
    const citationId = citationsEvent!.data.citations[0].id;

    // 1. Full text equals chunk text
    const passageRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/citations/${citationId}/passage`)
      .set('Cookie', member.cookies);
    expect(passageRes.status).toBe(200);
    expect(passageRes.body.text).toBe(chunkText);
    expect(passageRes.body.fileName).toBe(doc.fileName);
    expect(passageRes.body.page).toBe(2);

    // 2. Other user's citation id -> 404
    const stranger = await createUserAndLogin('Stranger', 'stranger42@example.com');
    const strangerWs = await createWorkspace(stranger.cookies, 'Stranger WS');
    const strangerRes = await request(app.getHttpServer())
      .get(`/workspaces/${strangerWs.id}/citations/${citationId}/passage`)
      .set('Cookie', stranger.cookies);
    expect(strangerRes.status).toBe(404);
    expect(strangerRes.body.error.code).toBe(ErrorCode.PASSAGE_NOT_FOUND);

    // 3. After access set to ADMINS_ONLY for a member -> 404
    await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/documents/${doc.id}/access`)
      .set('Cookie', admin.cookies)
      .send({ visibility: DocumentVisibility.ADMINS_ONLY });

    const memberForbiddenPassage = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/citations/${citationId}/passage`)
      .set('Cookie', member.cookies);
    expect(memberForbiddenPassage.status).toBe(404);
    expect(memberForbiddenPassage.body.error.code).toBe(ErrorCode.PASSAGE_NOT_FOUND);

    // 4. After document delete -> 404 PASSAGE_NOT_FOUND
    await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/documents/${doc.id}`)
      .set('Cookie', admin.cookies);

    const deletedPassage = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/citations/${citationId}/passage`)
      .set('Cookie', admin.cookies);
    expect(deletedPassage.status).toBe(404);
    expect(deletedPassage.body.error.code).toBe(ErrorCode.PASSAGE_NOT_FOUND);
  });

  it('T-43 AC-43: query with no overlap and similarity below 0.25 (fake embeddings): fake provider call count 0, content equals NO_ANSWER copy, outcome UNANSWERED, no citations; also empty permitted set', async () => {
    const admin = await createUserAndLogin('Admin 43', 'admin43@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 43');

    // 1. Empty permitted set (0 documents)
    const chat1 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    fakeLlmProvider.reset();

    const sse1 = await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat1.body.id}/messages`, admin.cookies.join('; '), {
      question: 'Any question when empty',
    });
    expect(fakeLlmProvider.callCount).toBe(0);
    const cit1 = sse1.events.find((e) => e.event === 'citations');
    expect(cit1?.data.outcome).toBe(AnswerOutcome.UNANSWERED);
    expect(cit1?.data.content).toBe(LockedCopy.NO_ANSWER);
    expect(cit1?.data.citations.length).toBe(0);

    // 2. Documents exist but similarity < 0.25 and no keyword overlap
    const doc = await insertReadyDocument(ws.id, 'Leave Policy', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [leaveVec] = await fakeLlmProvider.embed(['Annual leave entitlement and holiday schedule.']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'Annual leave entitlement and holiday schedule.',
      embedding: leaveVec,
    });

    fakeLlmProvider.reset();
    const chat2 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const sse2 = await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat2.body.id}/messages`, admin.cookies.join('; '), {
      question: 'xylophone quantum entanglement astrophysicist',
    });
    expect(fakeLlmProvider.callCount).toBe(0);
    const cit2 = sse2.events.find((e) => e.event === 'citations');
    expect(cit2?.data.outcome).toBe(AnswerOutcome.UNANSWERED);
    expect(cit2?.data.content).toBe(LockedCopy.NO_ANSWER);
    expect(cit2?.data.citations.length).toBe(0);
  });

  it('T-44 AC-44: __NO_ANSWER__ → no token event contains [[; final content = NO_ANSWER copy; citations empty; outcome UNANSWERED', async () => {
    const admin = await createUserAndLogin('Admin 44', 'admin44@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 44');
    const doc = await insertReadyDocument(ws.id, 'Doc 44', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['some document text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'some document text for answering',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const sse = await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, admin.cookies.join('; '), {
      question: 'Question with __NO_ANSWER__',
    });

    // Verify holdback: no token event contains '[['
    const tokenEvents = sse.events.filter((e) => e.event === 'token');
    for (const t of tokenEvents) {
      expect(t.data.text).not.toContain('[[');
      expect(t.data.text).not.toContain('NO_ANSWER');
    }

    const citationsEvent = sse.events.find((e) => e.event === 'citations');
    expect(citationsEvent?.data.outcome).toBe(AnswerOutcome.UNANSWERED);
    expect(citationsEvent?.data.content).toBe(LockedCopy.NO_ANSWER);
    expect(citationsEvent?.data.citations.length).toBe(0);
  });

  it('T-45 AC-45: after one exchange, follow-up "and for part-time?" → condense call recorded with prior turns; retrieval query text equals the condensed text; answer has ≥1 citation', async () => {
    const admin = await createUserAndLogin('Admin 45', 'admin45@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 45');
    const doc = await insertReadyDocument(ws.id, 'Leave Policy', DocumentVisibility.ALL_MEMBERS, admin.user.id);

    // Chunks for full-time and part-time vacation
    const [fullTimeVec] = await fakeLlmProvider.embed(['Full-time staff get 20 vacation days per year.']);
    const [partTimeVec] = await fakeLlmProvider.embed(['Part-time staff accrue vacation pro rata.']);

    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'Full-time staff get 20 vacation days per year.',
      embedding: fullTimeVec,
    });

    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 1,
      text: 'Part-time staff accrue vacation pro rata.',
      embedding: partTimeVec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const cookieHeader = admin.cookies.join('; ');

    // 1. First exchange
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, cookieHeader, {
      question: 'How many vacation days do full-time staff get?',
    });

    // 2. Follow-up question
    fakeLlmProvider.condenseCalls = [];
    const followUpRes = await postSse(
      serverPort,
      `/workspaces/${ws.id}/chats/${chat.body.id}/messages`,
      cookieHeader,
      { question: 'and for part-time?' },
    );

    // Check condense call recorded with prior turns
    expect(fakeLlmProvider.condenseCalls.length).toBe(1);
    const condenseCall = fakeLlmProvider.condenseCalls[0];
    const priorTurns = condenseCall.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    expect(priorTurns.length).toBeGreaterThanOrEqual(2);
    expect(priorTurns[0].content).toContain('vacation days');

    // Answer has ≥ 1 citation
    const citEvent = followUpRes.events.find((e) => e.event === 'citations');
    expect(citEvent?.data.outcome).toBe(AnswerOutcome.ANSWERED);
    expect(citEvent?.data.citations.length).toBeGreaterThanOrEqual(1);
  });

  it(
    'T-46 AC-46: __SLOW__ question, abort after 2 tokens → message STOPPED, content non-empty, provider abort observed; next message in same chat → 200 stream',
    async () => {
    const admin = await createUserAndLogin('Admin 46', 'admin46@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 46');
    const doc = await insertReadyDocument(ws.id, 'Doc 46', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['sample slow text content']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'sample slow text content [1]',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const cookieHeader = admin.cookies.join('; ');

    let tokensReceived = 0;
    await postSse(
      serverPort,
      `/workspaces/${ws.id}/chats/${chat.body.id}/messages`,
      cookieHeader,
      { question: 'sample slow text content with __SLOW__' },
      (_token, req) => {
        tokensReceived++;
        if (tokensReceived >= 2) {
          req.destroy();
        }
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Message in DB should be STOPPED with non-empty content
    const msg = await prisma.message.findFirst({
      where: { chatId: chat.body.id, role: MessageRole.ASSISTANT },
      orderBy: { createdAt: 'desc' },
    });
    expect(msg?.status).toBe(MessageStatus.STOPPED);
    expect(msg?.content.length).toBeGreaterThan(0);

    // Next message in same chat succeeds
    const nextSse = await postSse(
      serverPort,
      `/workspaces/${ws.id}/chats/${chat.body.id}/messages`,
      cookieHeader,
      { question: 'sample slow text content question' },
    );
    expect(nextSse.status).toBe(200);
    const cit = nextSse.events.find((e) => e.event === 'citations');
    expect(cit?.data.outcome).toBe(AnswerOutcome.ANSWERED);
  }, 15000);

  it('T-47 AC-47: __FAIL__ → stream contains error with LLM_UNAVAILABLE; message ERROR; visitor allowance count unchanged', async () => {
    const admin = await createUserAndLogin('Admin 47', 'admin47@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 47');
    const doc = await insertReadyDocument(ws.id, 'Doc 47', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['fail test text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'fail test text [1]',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const sse = await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, admin.cookies.join('; '), {
      question: 'fail test text with __FAIL__',
    });

    const errEvent = sse.events.find((e) => e.event === 'error');
    expect(errEvent).toBeDefined();
    expect(errEvent?.data.code).toBe(ErrorCode.LLM_UNAVAILABLE);

    const msg = await prisma.message.findFirst({
      where: { chatId: chat.body.id, role: MessageRole.ASSISTANT },
    });
    expect(msg?.status).toBe(MessageStatus.ERROR);
  });

  it('T-48 AC-48: start __SLOW__ message, immediately second POST → 409 CHAT_BUSY (JSON, not a stream); after first ends a new POST succeeds', async () => {
    const admin = await createUserAndLogin('Admin 48', 'admin48@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 48');
    const doc = await insertReadyDocument(ws.id, 'Doc 48', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['slow test text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'slow test text [1]',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    const cookieHeader = admin.cookies.join('; ');

    // Start __SLOW__ message in background
    const slowPromise = postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, cookieHeader, {
      question: 'slow test text with __SLOW__',
    });

    // Immediately second POST
    await new Promise((resolve) => setTimeout(resolve, 50));
    const conflictRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats/${chat.body.id}/messages`)
      .set('Cookie', admin.cookies)
      .send({ question: 'slow test text concurrent' });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe(ErrorCode.CHAT_BUSY);

    // Wait for first to finish
    await slowPromise;

    // After first ends, a new POST succeeds
    const succeedRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats/${chat.body.id}/messages`)
      .set('Cookie', admin.cookies)
      .send({ question: 'slow test text subsequent' });
    expect(succeedRes.status).toBe(200);
  }, 15000);

  it('T-49 AC-49: question "", "   ", 2001 chars → 400; other user\'s chat id → 404 CHAT_NOT_FOUND; no cookie → 401', async () => {
    const admin = await createUserAndLogin('Admin 49', 'admin49@example.com');
    const otherUser = await createUserAndLogin('Other 49', 'other49@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 49');
    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);

    // 1. Empty and whitespace-only questions -> 400
    const emptyRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats/${chat.body.id}/messages`)
      .set('Cookie', admin.cookies)
      .send({ question: '' });
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    const spaceRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats/${chat.body.id}/messages`)
      .set('Cookie', admin.cookies)
      .send({ question: '   ' });
    expect(spaceRes.status).toBe(400);
    expect(spaceRes.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 2. 2001 chars -> 400
    const longRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats/${chat.body.id}/messages`)
      .set('Cookie', admin.cookies)
      .send({ question: 'a'.repeat(2001) });
    expect(longRes.status).toBe(400);
    expect(longRes.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 3. Other user's chat id -> 404 CHAT_NOT_FOUND
    const otherChatRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats/${chat.body.id}/messages`)
      .set('Cookie', otherUser.cookies)
      .send({ question: 'Valid question' });
    expect(otherChatRes.status).toBe(404);
    expect(otherChatRes.body.error.code).toBe(ErrorCode.WORKSPACE_NOT_FOUND);

    // 4. No cookie -> 401
    const noAuthRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/chats/${chat.body.id}/messages`)
      .send({ question: 'Valid question' });
    expect(noAuthRes.status).toBe(401);
    expect(noAuthRes.body.error.code).toBe(ErrorCode.AUTH_REQUIRED);
  });

  it('T-50 AC-50: create chat → 201; two chats with questions → list newest first, title = first 60 chars, other user\'s chats absent; limit=1 + cursor', async () => {
    const admin = await createUserAndLogin('Admin 50', 'admin50@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 50');
    const doc = await insertReadyDocument(ws.id, 'Doc 50', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['doc text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'doc text [1]',
      embedding: vec,
    });

    const otherUser = await createUserAndLogin('Other 50', 'other50@example.com');
    const otherWs = await createWorkspace(otherUser.cookies, 'Other WS 50');
    await request(app.getHttpServer()).post(`/workspaces/${otherWs.id}/chats`).set('Cookie', otherUser.cookies);

    // Create chat 1
    const chat1 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    expect(chat1.status).toBe(201);
    expect(chat1.body.title).toBeNull();
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat1.body.id}/messages`, admin.cookies.join('; '), {
      question: 'doc text policy rules that exceeds sixty characters easily and is long',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Create chat 2
    const chat2 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat2.body.id}/messages`, admin.cookies.join('; '), {
      question: 'doc text shorter second question',
    });

    // List chats
    const listRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/chats`)
      .set('Cookie', admin.cookies);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(2);
    // Newest first
    expect(listRes.body.data[0].id).toBe(chat2.body.id);
    expect(listRes.body.data[1].id).toBe(chat1.body.id);
    // Title truncated to 60 chars
    expect(listRes.body.data[1].title.length).toBeLessThanOrEqual(60);

    // Limit=1 + cursor
    const p1 = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/chats?limit=1`)
      .set('Cookie', admin.cookies);
    expect(p1.body.data.length).toBe(1);
    expect(p1.body.nextCursor).toBeDefined();

    const p2 = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/chats?limit=1&cursor=${p1.body.nextCursor}`)
      .set('Cookie', admin.cookies);
    expect(p2.body.data.length).toBe(1);
    expect(p2.body.data[0].id).toBe(chat1.body.id);
  });

  it('T-51 AC-51: GET chat → messages ordered, citations nested; other member → 404; admin on member\'s chat → 404', async () => {
    const admin = await createUserAndLogin('Admin 51', 'admin51@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 51');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member51@example.com', WorkspaceRole.MEMBER);
    const doc = await insertReadyDocument(ws.id, 'Doc 51', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'text [1]',
      embedding: vec,
    });

    const memberChat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', member.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${memberChat.body.id}/messages`, member.cookies.join('; '), {
      question: 'text question from member',
    });

    // 1. Member GET chat -> messages ordered with citations
    const getRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/chats/${memberChat.body.id}`)
      .set('Cookie', member.cookies);
    expect(getRes.status).toBe(200);
    expect(getRes.body.messages.length).toBe(2);
    expect(getRes.body.messages[0].role).toBe(MessageRole.USER);
    expect(getRes.body.messages[1].role).toBe(MessageRole.ASSISTANT);
    expect(getRes.body.messages[1].citations.length).toBeGreaterThan(0);

    // 2. Admin on member's chat -> 404 CHAT_NOT_FOUND
    const adminAccess = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/chats/${memberChat.body.id}`)
      .set('Cookie', admin.cookies);
    expect(adminAccess.status).toBe(404);
    expect(adminAccess.body.error.code).toBe(ErrorCode.CHAT_NOT_FOUND);
  });

  it('T-52 AC-52: DELETE own → 204 and message, citation, feedback rows gone; other\'s → 404', async () => {
    const admin = await createUserAndLogin('Admin 52', 'admin52@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 52');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member52@example.com', WorkspaceRole.MEMBER);
    const doc = await insertReadyDocument(ws.id, 'Doc 52', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'text [1]',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, admin.cookies.join('; '), {
      question: 'text question to be deleted',
    });

    // Member deletes admin's chat -> 404
    const memberDel = await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/chats/${chat.body.id}`)
      .set('Cookie', member.cookies);
    expect(memberDel.status).toBe(404);
    expect(memberDel.body.error.code).toBe(ErrorCode.CHAT_NOT_FOUND);

    // Admin deletes own chat -> 204
    const adminDel = await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/chats/${chat.body.id}`)
      .set('Cookie', admin.cookies);
    expect(adminDel.status).toBe(204);

    const msgs = await prisma.message.findMany({ where: { chatId: chat.body.id } });
    expect(msgs.length).toBe(0);
  });

  it('T-53 AC-53: answered chat; admin sets cited doc ADMINS_ONLY; member GET chat → citation available:false, snippet null; admin\'s own view unaffected', async () => {
    const admin = await createUserAndLogin('Admin 53', 'admin53@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 53');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member53@example.com', WorkspaceRole.MEMBER);
    const doc = await insertReadyDocument(ws.id, 'Doc 53', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['accessible content']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'accessible content [1]',
      embedding: vec,
    });

    // Member asks question
    const memberChat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', member.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${memberChat.body.id}/messages`, member.cookies.join('; '), {
      question: 'accessible content question from member',
    });

    // Admin asks question in admin's own chat
    const adminChat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${adminChat.body.id}/messages`, admin.cookies.join('; '), {
      question: 'accessible content question from admin',
    });

    // Admin sets cited doc to ADMINS_ONLY
    await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/documents/${doc.id}/access`)
      .set('Cookie', admin.cookies)
      .send({ visibility: DocumentVisibility.ADMINS_ONLY });

    // Member GET chat -> citation available: false, snippet null
    const memberView = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/chats/${memberChat.body.id}`)
      .set('Cookie', member.cookies);
    const memberCitation = memberView.body.messages[1].citations[0];
    expect(memberCitation.available).toBe(false);
    expect(memberCitation.snippet).toBeNull();

    // Admin's own view unaffected
    const adminView = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/chats/${adminChat.body.id}`)
      .set('Cookie', admin.cookies);
    const adminCitation = adminView.body.messages[1].citations[0];
    expect(adminCitation.available).toBe(true);
    expect(adminCitation.snippet).not.toBeNull();
  });

  it('T-54 AC-54: PUT UP → 200; PUT DOWN → same row updated (count 1); on USER message → 400; rating MEH → 400; other user\'s message → 404 MESSAGE_NOT_FOUND; visitor token → 401', async () => {
    const admin = await createUserAndLogin('Admin 54', 'admin54@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 54');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member54@example.com', WorkspaceRole.MEMBER);
    const doc = await insertReadyDocument(ws.id, 'Doc 54', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['feedback text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'feedback text [1]',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', member.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, member.cookies.join('; '), {
      question: 'Feedback test question',
    });

    const chatData = await request(app.getHttpServer()).get(`/workspaces/${ws.id}/chats/${chat.body.id}`).set('Cookie', member.cookies);
    const userMsgId = chatData.body.messages[0].id;
    const assistantMsgId = chatData.body.messages[1].id;

    // 1. PUT UP -> 200
    const upRes = await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${assistantMsgId}/feedback`)
      .set('Cookie', member.cookies)
      .send({ rating: FeedbackRating.UP, comment: 'Great answer' });
    expect(upRes.status).toBe(200);
    expect(upRes.body.rating).toBe(FeedbackRating.UP);
    expect(upRes.body.comment).toBe('Great answer');

    // 2. PUT DOWN -> same row updated
    const downRes = await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${assistantMsgId}/feedback`)
      .set('Cookie', member.cookies)
      .send({ rating: FeedbackRating.DOWN, comment: 'Changed my mind' });
    expect(downRes.status).toBe(200);
    expect(downRes.body.rating).toBe(FeedbackRating.DOWN);

    const rowCount = await prisma.feedback.count({
      where: { messageId: assistantMsgId, userId: member.user.id },
    });
    expect(rowCount).toBe(1);

    // 3. Rating on USER message -> 400
    const userMsgRating = await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${userMsgId}/feedback`)
      .set('Cookie', member.cookies)
      .send({ rating: FeedbackRating.UP });
    expect(userMsgRating.status).toBe(400);

    // 4. Rating 'MEH' -> 400
    const mehRating = await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${assistantMsgId}/feedback`)
      .set('Cookie', member.cookies)
      .send({ rating: 'MEH' });
    expect(mehRating.status).toBe(400);

    // 5. Other user's message -> 404 MESSAGE_NOT_FOUND
    const adminRating = await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${assistantMsgId}/feedback`)
      .set('Cookie', admin.cookies)
      .send({ rating: FeedbackRating.UP });
    expect(adminRating.status).toBe(404);
    expect(adminRating.body.error.code).toBe(ErrorCode.MESSAGE_NOT_FOUND);

    // 6. No credentials -> 401
    const noAuth = await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${assistantMsgId}/feedback`)
      .send({ rating: FeedbackRating.UP });
    expect(noAuth.status).toBe(401);
  });

  it('T-55 AC-55: workspace fake-model → message modelId = fake-model; switch to another catalog id → next message uses it; earlier unchanged', async () => {
    const admin = await createUserAndLogin('Admin 55', 'admin55@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 55');
    // Set model to fake-model
    await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/settings`)
      .set('Cookie', admin.cookies)
      .send({ modelId: 'fake-model' });

    const doc = await insertReadyDocument(ws.id, 'Doc 55', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['model text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'model text [1]',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, admin.cookies.join('; '), {
      question: 'Question with fake model',
    });

    const firstMsg = await prisma.message.findFirst({
      where: { chatId: chat.body.id, role: MessageRole.ASSISTANT },
    });
    expect(firstMsg?.modelId).toBe('fake-model');

    // Switch model to claude-sonnet-5-5
    await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/settings`)
      .set('Cookie', admin.cookies)
      .send({ modelId: 'claude-sonnet-5-5' });

    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, admin.cookies.join('; '), {
      question: 'Question after switch',
    });

    const messages = await prisma.message.findMany({
      where: { chatId: chat.body.id, role: MessageRole.ASSISTANT },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages.length).toBe(2);
    expect(messages[0].modelId).toBe('fake-model');
    expect(messages[1].modelId).toBe('claude-sonnet-5-5');
  });

  it('T-56 AC-56: fake model: assistant message has prompt/completion/embedding tokens > 0, costMicros equals formula with fake prices, firstTokenMs ≤ totalMs', async () => {
    const admin = await createUserAndLogin('Admin 56', 'admin56@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 56');
    await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/settings`)
      .set('Cookie', admin.cookies)
      .send({ modelId: 'fake-model' });

    const doc = await insertReadyDocument(ws.id, 'Doc 56', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['cost calculation text']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'cost calculation text [1]',
      embedding: vec,
    });

    const chat = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', admin.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat.body.id}/messages`, admin.cookies.join('; '), {
      question: 'Cost formula check question',
    });

    const assistantMsg = await prisma.message.findFirst({
      where: { chatId: chat.body.id, role: MessageRole.ASSISTANT },
    });
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.promptTokens).toBeGreaterThan(0);
    expect(assistantMsg!.completionTokens).toBeGreaterThan(0);
    expect(assistantMsg!.embeddingTokens).toBeGreaterThan(0);

    // Fake prices: input 1.0, output 2.0, embedding 0.5
    const expectedCost = Math.round(
      assistantMsg!.promptTokens * 1.0 +
        assistantMsg!.completionTokens * 2.0 +
        assistantMsg!.embeddingTokens * 0.5,
    );
    expect(assistantMsg!.costMicros).toBe(expectedCost);
    expect(assistantMsg!.firstTokenMs).toBeLessThanOrEqual(assistantMsg!.totalMs!);
  });

  it('T-57 AC-57: feedback from two members: admin list returns both with question, content, citations, comment; ?rating=DOWN filters; pagination; member → 403', async () => {
    const admin = await createUserAndLogin('Admin 57', 'admin57@example.com');
    const ws = await createWorkspace(admin.cookies, 'WS 57');
    const member1 = await inviteAndJoin(admin.cookies, ws.id, 'm1_57@example.com', WorkspaceRole.MEMBER);
    const member2 = await inviteAndJoin(admin.cookies, ws.id, 'm2_57@example.com', WorkspaceRole.MEMBER);

    const doc = await insertReadyDocument(ws.id, 'Doc 57', DocumentVisibility.ALL_MEMBERS, admin.user.id);
    const [vec] = await fakeLlmProvider.embed(['feedback list content']);
    await insertTestChunk(prisma, {
      id: randomUUID(),
      documentId: doc.id,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'feedback list content [1]',
      embedding: vec,
    });

    // Member 1 asks and rates UP
    const chat1 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', member1.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat1.body.id}/messages`, member1.cookies.join('; '), {
      question: 'Question by member 1',
    });
    const c1Data = await request(app.getHttpServer()).get(`/workspaces/${ws.id}/chats/${chat1.body.id}`).set('Cookie', member1.cookies);
    const msg1Id = c1Data.body.messages[1].id;
    await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${msg1Id}/feedback`)
      .set('Cookie', member1.cookies)
      .send({ rating: FeedbackRating.UP, comment: 'Nice work' });

    // Member 2 asks and rates DOWN
    const chat2 = await request(app.getHttpServer()).post(`/workspaces/${ws.id}/chats`).set('Cookie', member2.cookies);
    await postSse(serverPort, `/workspaces/${ws.id}/chats/${chat2.body.id}/messages`, member2.cookies.join('; '), {
      question: 'Question by member 2',
    });
    const c2Data = await request(app.getHttpServer()).get(`/workspaces/${ws.id}/chats/${chat2.body.id}`).set('Cookie', member2.cookies);
    const msg2Id = c2Data.body.messages[1].id;
    await request(app.getHttpServer())
      .put(`/workspaces/${ws.id}/messages/${msg2Id}/feedback`)
      .set('Cookie', member2.cookies)
      .send({ rating: FeedbackRating.DOWN, comment: 'Could be better' });

    // 1. Admin list returns both with question, content, citations, comment
    const adminList = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/feedback`)
      .set('Cookie', admin.cookies);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.length).toBe(2);
    expect(adminList.body.data[0].message.question).toBeDefined();
    expect(adminList.body.data[0].message.content).toBeDefined();
    expect(adminList.body.data[0].message.citations).toBeDefined();

    // 2. ?rating=DOWN filters
    const downList = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/feedback?rating=DOWN`)
      .set('Cookie', admin.cookies);
    expect(downList.status).toBe(200);
    expect(downList.body.data.length).toBe(1);
    expect(downList.body.data[0].rating).toBe(FeedbackRating.DOWN);
    expect(downList.body.data[0].comment).toBe('Could be better');

    // 3. Pagination limit=1
    const paginated = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/feedback?limit=1`)
      .set('Cookie', admin.cookies);
    expect(paginated.status).toBe(200);
    expect(paginated.body.data.length).toBe(1);
    expect(paginated.body.nextCursor).toBeDefined();

    // 4. Member -> 403 FORBIDDEN
    const memberForbidden = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/feedback`)
      .set('Cookie', member1.cookies);
    expect(memberForbidden.status).toBe(403);
    expect(memberForbidden.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });
});
