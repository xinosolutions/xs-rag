import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getStorageToken, ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { truncateAllTables } from './helpers/db.js';
import { insertTestChunk } from './helpers/chunks.js';
import { DocumentEventsService } from '../src/documents/document-events.service.js';
import { UrlGuard } from '../src/documents/url-guard.js';
import {
  DocumentSourceType,
  DocumentStatus,
  DocumentVisibility,
  ErrorCode,
  PrincipalType,
} from '@xs-rag/shared';

describe('Phase 4: Documents API (T-21..T-31)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventsService: DocumentEventsService;
  let throttlerStorage: ThrottlerStorage;
  let serverPort: number;

  const TEST_STORAGE_DIR = './test-storage';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LLM_PROVIDER = 'fake';
    process.env.JWT_SECRET = 'super-secret-jwt-secret-min-32-chars-length';
    process.env.IP_HASH_SALT = 'test-salt-string';
    process.env.STORAGE_DIR = TEST_STORAGE_DIR;
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
    eventsService = app.get(DocumentEventsService);
    throttlerStorage = app.get(getStorageToken());
  });

  afterAll(async () => {
    await app.close();
    try {
      await fs.rm(path.resolve(TEST_STORAGE_DIR), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
    (throttlerStorage as any)._storage?.clear?.();
    (throttlerStorage as any).storage?.clear?.();
    (throttlerStorage as any).hitExpirations?.clear?.();

    try {
      await fs.rm(path.resolve(TEST_STORAGE_DIR), { recursive: true, force: true });
      await fs.mkdir(path.resolve(TEST_STORAGE_DIR), { recursive: true });
    } catch {
      // ignore
    }
  });

  async function createUserAndLogin(name: string, email: string) {
    const password = 'Password123!';
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name, email, password });
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return {
      user: res.body.user as { id: string; email: string; name: string },
      cookies,
    };
  }

  async function createWorkspace(cookies: string[], name: string) {
    const res = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', cookies)
      .send({ name });
    return res.body as { id: string; name: string; slug: string; role: string };
  }

  async function inviteAndJoin(
    adminCookies: string[],
    workspaceId: string,
    email: string,
    role: 'ADMIN' | 'MEMBER' = 'MEMBER',
  ) {
    const inviteRes = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Cookie', adminCookies)
      .send({ email, role });
    expect(inviteRes.status).toBe(201);

    const inv = await prisma.invitation.findUnique({
      where: { id: inviteRes.body.id },
    });
    expect(inv).toBeDefined();

    const member = await createUserAndLogin(email.split('@')[0], email);

    await prisma.membership.create({
      data: {
        workspaceId,
        userId: member.user.id,
        role,
      },
    });

    return member;
  }

  it('T-21 AC-21: upload one fixture each of .pdf, .docx, .md → 201 QUEUED, correct sourceType, ALL_MEMBERS; file exists in STORAGE_DIR', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-21@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 21');

    const pdfPath = path.resolve('test/fixtures/files/sample.pdf');
    const docxPath = path.resolve('test/fixtures/files/sample.docx');
    const mdPath = path.resolve('test/fixtures/files/sample.md');

    // 1. Upload PDF
    const pdfRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', pdfPath);

    expect(pdfRes.status).toBe(201);
    expect(pdfRes.body.status).toBe(DocumentStatus.QUEUED);
    expect(pdfRes.body.sourceType).toBe(DocumentSourceType.PDF);
    expect(pdfRes.body.visibility).toBe(DocumentVisibility.ALL_MEMBERS);
    expect(pdfRes.body.fileName).toBe('sample.pdf');
    expect(pdfRes.body.memberIds).toBeDefined();

    // Verify file exists on disk
    const pdfDoc = await prisma.document.findUnique({ where: { id: pdfRes.body.id } });
    expect(pdfDoc?.storagePath).toBeDefined();
    const pdfStat = await fs.stat(pdfDoc!.storagePath!);
    expect(pdfStat.size).toBeGreaterThan(0);

    // 2. Upload DOCX
    const docxRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', docxPath);

    expect(docxRes.status).toBe(201);
    expect(docxRes.body.status).toBe(DocumentStatus.QUEUED);
    expect(docxRes.body.sourceType).toBe(DocumentSourceType.DOCX);
    expect(docxRes.body.visibility).toBe(DocumentVisibility.ALL_MEMBERS);

    const docxDoc = await prisma.document.findUnique({ where: { id: docxRes.body.id } });
    expect(docxDoc?.storagePath).toBeDefined();
    const docxStat = await fs.stat(docxDoc!.storagePath!);
    expect(docxStat.size).toBeGreaterThan(0);

    // 3. Upload Markdown
    const mdRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', mdPath);

    expect(mdRes.status).toBe(201);
    expect(mdRes.body.status).toBe(DocumentStatus.QUEUED);
    expect(mdRes.body.sourceType).toBe(DocumentSourceType.MARKDOWN);
    expect(mdRes.body.visibility).toBe(DocumentVisibility.ALL_MEMBERS);

    const mdDoc = await prisma.document.findUnique({ where: { id: mdRes.body.id } });
    expect(mdDoc?.storagePath).toBeDefined();
    const mdStat = await fs.stat(mdDoc!.storagePath!);
    expect(mdStat.size).toBeGreaterThan(0);
  });

  it('T-22 AC-22: .exe → 415; .pdf extension with PNG bytes → 415; 21 MB file → 413 FILE_TOO_LARGE; no file part → 400', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-22@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 22');

    // 1. .exe -> 415
    const exeRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', Buffer.from('MZ\x90\x00'), 'program.exe');

    expect(exeRes.status).toBe(415);
    expect(exeRes.body.error.code).toBe(ErrorCode.FILE_TYPE_NOT_SUPPORTED);

    // 2. .pdf extension with PNG bytes -> 415
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const fakePdfRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', pngBytes, 'fake.pdf');

    expect(fakePdfRes.status).toBe(415);
    expect(fakePdfRes.body.error.code).toBe(ErrorCode.FILE_TYPE_NOT_SUPPORTED);

    // 3. 21 MB file -> 413 FILE_TOO_LARGE
    const largeBuffer = Buffer.alloc(21 * 1024 * 1024);
    const largeRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', largeBuffer, 'large.pdf');

    expect(largeRes.status).toBe(413);
    expect(largeRes.body.error.code).toBe(ErrorCode.FILE_TOO_LARGE);

    // 4. no file part -> 400
    const noFileRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .send({});

    expect(noFileRes.status).toBe(400);
    expect(noFileRes.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('T-23 AC-23: same bytes twice → 409 DOC_DUPLICATE; with 50 docs inserted, the 51st → 409 DOC_LIMIT; member upload → 403', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-23@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 23');
    const mdPath = path.resolve('test/fixtures/files/sample.md');

    // 1. Upload once -> 201
    const upload1 = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', mdPath);
    expect(upload1.status).toBe(201);

    // Upload same bytes twice -> 409 DOC_DUPLICATE
    const upload2 = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', mdPath);
    expect(upload2.status).toBe(409);
    expect(upload2.body.error.code).toBe(ErrorCode.DOC_DUPLICATE);

    // 2. Insert up to 50 docs
    const currentCount = await prisma.document.count({ where: { workspaceId: ws.id } });
    for (let i = currentCount; i < 50; i++) {
      await prisma.document.create({
        data: {
          workspaceId: ws.id,
          title: `Bulk Doc ${i}`,
          sourceType: DocumentSourceType.MARKDOWN,
          contentHash: `hash-${i}-${randomUUID()}`,
          status: DocumentStatus.QUEUED,
          visibility: DocumentVisibility.ALL_MEMBERS,
          uploadedById: admin.user.id,
        },
      });
    }

    // 51st upload -> 409 DOC_LIMIT
    const upload51 = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', Buffer.from('# Different text for doc 51'), 'doc51.md');
    expect(upload51.status).toBe(409);
    expect(upload51.body.error.code).toBe(ErrorCode.DOC_LIMIT);

    // 3. Member upload -> 403
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member-23@example.com', 'MEMBER');
    const memberUpload = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', member.cookies)
      .attach('file', Buffer.from('# Member text'), 'member.md');
    expect(memberUpload.status).toBe(403);
    expect(memberUpload.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('T-24 AC-24: https://example.com/a → 201 WEB; ftp://, http://u:p@host, http://localhost, http://127.0.0.1, http://10.0.0.5, http://169.254.169.254, host resolving to private IP (stubbed DNS) → 400 URL_NOT_ALLOWED', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-24@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 24');

    // 1. Valid https -> 201 WEB
    const validRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents/url`)
      .set('Cookie', admin.cookies)
      .send({ url: 'https://example.com/a' });

    expect(validRes.status).toBe(201);
    expect(validRes.body.sourceType).toBe(DocumentSourceType.WEB);
    expect(validRes.body.status).toBe(DocumentStatus.QUEUED);
    expect(validRes.body.sourceUrl).toBe('https://example.com/a');

    // 2. Disallowed schemes and targets -> 400 URL_NOT_ALLOWED
    const disallowedUrls = [
      'ftp://example.com/file',
      'http://u:p@example.com',
      'http://localhost',
      'http://127.0.0.1',
      'http://10.0.0.5',
      'http://169.254.169.254',
    ];

    for (const url of disallowedUrls) {
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${ws.id}/documents/url`)
        .set('Cookie', admin.cookies)
        .send({ url });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.URL_NOT_ALLOWED);
    }

    // 3. Host resolving to private IP (stubbed DNS) -> 400 URL_NOT_ALLOWED
    const originalLookup = UrlGuard.dnsLookup;
    UrlGuard.dnsLookup = ((
      hostname: string,
      options: any,
      callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void,
    ) => {
      const cb = typeof options === 'function' ? options : callback;
      cb(null, [{ address: '192.168.1.100', family: 4 }]);
    }) as any;

    try {
      const stubbedRes = await request(app.getHttpServer())
        .post(`/workspaces/${ws.id}/documents/url`)
        .set('Cookie', admin.cookies)
        .send({ url: 'https://internal-domain.org/doc' });

      expect(stubbedRes.status).toBe(400);
      expect(stubbedRes.body.error.code).toBe(ErrorCode.URL_NOT_ALLOWED);
    } finally {
      UrlGuard.dnsLookup = originalLookup;
    }
  });

  it('T-25 AC-25: 3 docs in mixed statuses/visibilities: admin sees 3 and ?status=FAILED filters; member sees only permitted READY; limit=1 returns nextCursor and walks all', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-25@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 25');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member-25@example.com', 'MEMBER');

    // Doc 1: READY, ALL_MEMBERS
    await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Doc 1 READY ALL',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-25-1',
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    });

    // Doc 2: FAILED, ALL_MEMBERS
    await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Doc 2 FAILED',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-25-2',
        status: DocumentStatus.FAILED,
        failureCode: 'EXTRACT_FAILED',
        failureMessage: 'Extraction failed',
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
        createdAt: new Date('2026-10-01T11:00:00Z'),
      },
    });

    // Doc 3: READY, ADMINS_ONLY
    await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Doc 3 READY ADMINS_ONLY',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-25-3',
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.ADMINS_ONLY,
        uploadedById: admin.user.id,
        createdAt: new Date('2026-10-01T12:00:00Z'),
      },
    });

    // Admin sees all 3
    const adminList = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.length).toBe(3);

    // Admin filters ?status=FAILED -> sees 1
    const adminFailedList = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents?status=FAILED`)
      .set('Cookie', admin.cookies);
    expect(adminFailedList.status).toBe(200);
    expect(adminFailedList.body.data.length).toBe(1);
    expect(adminFailedList.body.data[0].status).toBe(DocumentStatus.FAILED);

    // Member sees only permitted READY -> Doc 1 only
    const memberList = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents`)
      .set('Cookie', member.cookies);
    expect(memberList.status).toBe(200);
    expect(memberList.body.data.length).toBe(1);
    expect(memberList.body.data[0].title).toBe('Doc 1 READY ALL');

    // limit=1 returns nextCursor and walks all
    const p1 = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents?limit=1`)
      .set('Cookie', admin.cookies);
    expect(p1.status).toBe(200);
    expect(p1.body.data.length).toBe(1);
    expect(p1.body.nextCursor).toBeDefined();

    const p2 = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents?limit=1&cursor=${p1.body.nextCursor}`)
      .set('Cookie', admin.cookies);
    expect(p2.status).toBe(200);
    expect(p2.body.data.length).toBe(1);
    expect(p2.body.nextCursor).toBeDefined();

    const p3 = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents?limit=1&cursor=${p2.body.nextCursor}`)
      .set('Cookie', admin.cookies);
    expect(p3.status).toBe(200);
    expect(p3.body.data.length).toBe(1);
    expect(p3.body.nextCursor).toBeNull();
  });

  it('T-26 AC-26: admin 200; member on permitted 200; member on ADMINS_ONLY, on unselected SELECTED, on PROCESSING → 404 DOCUMENT_NOT_FOUND; id from other workspace → 404', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-26@example.com');
    const ws1 = await createWorkspace(admin.cookies, 'Doc WS 26 A');
    const ws2 = await createWorkspace(admin.cookies, 'Doc WS 26 B');

    const memberA = await inviteAndJoin(admin.cookies, ws1.id, 'memberA-26@example.com', 'MEMBER');
    const memberB = await inviteAndJoin(admin.cookies, ws1.id, 'memberB-26@example.com', 'MEMBER');

    // Doc 1: READY, ALL_MEMBERS
    const doc1 = await prisma.document.create({
      data: {
        workspaceId: ws1.id,
        title: 'Doc 1 READY ALL',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-26-1',
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    // Doc 2: READY, ADMINS_ONLY
    const doc2 = await prisma.document.create({
      data: {
        workspaceId: ws1.id,
        title: 'Doc 2 ADMINS_ONLY',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-26-2',
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.ADMINS_ONLY,
        uploadedById: admin.user.id,
      },
    });

    // Doc 3: READY, SELECTED (memberA only)
    const doc3 = await prisma.document.create({
      data: {
        workspaceId: ws1.id,
        title: 'Doc 3 SELECTED memberA',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-26-3',
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.SELECTED,
        uploadedById: admin.user.id,
        access: {
          create: [{ userId: memberA.user.id }],
        },
      },
    });

    // Doc 4: PROCESSING, ALL_MEMBERS
    const doc4 = await prisma.document.create({
      data: {
        workspaceId: ws1.id,
        title: 'Doc 4 PROCESSING',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-26-4',
        status: DocumentStatus.PROCESSING,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    // Doc 5: In other workspace (ws2)
    const doc5 = await prisma.document.create({
      data: {
        workspaceId: ws2.id,
        title: 'Doc 5 WS2',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-26-5',
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    // Admin sees all 200
    const adminDoc2 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc2.id}`)
      .set('Cookie', admin.cookies);
    expect(adminDoc2.status).toBe(200);

    // Member A sees permitted Doc 1 -> 200
    const memberADoc1 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc1.id}`)
      .set('Cookie', memberA.cookies);
    expect(memberADoc1.status).toBe(200);

    // Member A sees permitted Doc 3 (SELECTED for memberA) -> 200
    const memberADoc3 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc3.id}`)
      .set('Cookie', memberA.cookies);
    expect(memberADoc3.status).toBe(200);

    // Member A on ADMINS_ONLY -> 404 DOCUMENT_NOT_FOUND
    const memberADoc2 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc2.id}`)
      .set('Cookie', memberA.cookies);
    expect(memberADoc2.status).toBe(404);
    expect(memberADoc2.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);

    // Member B on unselected SELECTED (Doc 3) -> 404 DOCUMENT_NOT_FOUND
    const memberBDoc3 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc3.id}`)
      .set('Cookie', memberB.cookies);
    expect(memberBDoc3.status).toBe(404);
    expect(memberBDoc3.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);

    // Member A on PROCESSING (Doc 4) -> 404 DOCUMENT_NOT_FOUND
    const memberADoc4 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc4.id}`)
      .set('Cookie', memberA.cookies);
    expect(memberADoc4.status).toBe(404);
    expect(memberADoc4.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);

    // ID from other workspace (Doc 5 queried in ws1) -> 404
    const memberADoc5 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc5.id}`)
      .set('Cookie', memberA.cookies);
    expect(memberADoc5.status).toBe(404);
    expect(memberADoc5.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
  });

  it('T-27 AC-27: PATCH SELECTED with a member id → 200 and that member now sees it; SELECTED with [] → 400; non-member id → 400; member caller → 403', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-27@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 27');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member-27@example.com', 'MEMBER');

    // Create ADMINS_ONLY document
    const doc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Doc 27 Restricted',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-27',
        status: DocumentStatus.READY,
        visibility: DocumentVisibility.ADMINS_ONLY,
        uploadedById: admin.user.id,
      },
    });

    // Member cannot see it initially
    const initialGet = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents/${doc.id}`)
      .set('Cookie', member.cookies);
    expect(initialGet.status).toBe(404);

    // 1. Member caller -> 403
    const memberPatch = await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/documents/${doc.id}/access`)
      .set('Cookie', member.cookies)
      .send({ visibility: DocumentVisibility.ALL_MEMBERS });
    expect(memberPatch.status).toBe(403);
    expect(memberPatch.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 2. SELECTED with [] -> 400
    const emptySelected = await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/documents/${doc.id}/access`)
      .set('Cookie', admin.cookies)
      .send({ visibility: DocumentVisibility.SELECTED, memberIds: [] });
    expect(emptySelected.status).toBe(400);
    expect(emptySelected.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 3. non-member id -> 400
    const nonMemberSelected = await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/documents/${doc.id}/access`)
      .set('Cookie', admin.cookies)
      .send({ visibility: DocumentVisibility.SELECTED, memberIds: [randomUUID()] });
    expect(nonMemberSelected.status).toBe(400);
    expect(nonMemberSelected.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    // 4. Admin PATCH SELECTED with valid member id -> 200
    const validPatch = await request(app.getHttpServer())
      .patch(`/workspaces/${ws.id}/documents/${doc.id}/access`)
      .set('Cookie', admin.cookies)
      .send({ visibility: DocumentVisibility.SELECTED, memberIds: [member.user.id] });
    expect(validPatch.status).toBe(200);
    expect(validPatch.body.visibility).toBe(DocumentVisibility.SELECTED);
    expect(validPatch.body.memberIds).toContain(member.user.id);

    // Member now sees it immediately -> 200 (VIS-7)
    const afterGet = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents/${doc.id}`)
      .set('Cookie', member.cookies);
    expect(afterGet.status).toBe(200);
    expect(afterGet.body.id).toBe(doc.id);
  });

  it('T-28 AC-28: delete doc with chunks and a citation → 204; chunks 0, file gone, citation row remains with chunkId/documentId null; member → 403; unknown → 404', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-28@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 28');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member-28@example.com', 'MEMBER');

    // Upload file
    const mdPath = path.resolve('test/fixtures/files/sample.md');
    const uploadRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', mdPath);
    expect(uploadRes.status).toBe(201);
    const docId = uploadRes.body.id;

    const docRow = await prisma.document.findUnique({ where: { id: docId } });
    expect(docRow?.storagePath).toBeDefined();
    await expect(fs.stat(docRow!.storagePath!)).resolves.toBeDefined();

    // Insert chunk
    const chunkId = randomUUID();
    await insertTestChunk(prisma, {
      id: chunkId,
      documentId: docId,
      workspaceId: ws.id,
      ordinal: 0,
      text: 'Sample chunk text for citation test',
    });

    // Create Chat, Message, and MessageCitation
    const chat = await prisma.chat.create({
      data: {
        workspaceId: ws.id,
        principalType: PrincipalType.USER,
        userId: member.user.id,
        title: 'Test Chat',
      },
    });

    const message = await prisma.message.create({
      data: {
        chatId: chat.id,
        workspaceId: ws.id,
        role: 'ASSISTANT',
        content: 'Answer referencing doc [1].',
      },
    });

    const citation = await prisma.messageCitation.create({
      data: {
        messageId: message.id,
        index: 1,
        chunkId,
        documentId: docId,
        fileName: 'sample.md',
        snippet: 'Sample snippet snapshot',
      },
    });

    // 1. Member DELETE -> 403
    const memberDelete = await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/documents/${docId}`)
      .set('Cookie', member.cookies);
    expect(memberDelete.status).toBe(403);
    expect(memberDelete.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 2. Unknown ID -> 404
    const unknownDelete = await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/documents/${randomUUID()}`)
      .set('Cookie', admin.cookies);
    expect(unknownDelete.status).toBe(404);
    expect(unknownDelete.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);

    // 3. Admin DELETE valid doc -> 204
    const deleteRes = await request(app.getHttpServer())
      .delete(`/workspaces/${ws.id}/documents/${docId}`)
      .set('Cookie', admin.cookies);
    expect(deleteRes.status).toBe(204);

    // Verify Document row deleted
    const deletedDoc = await prisma.document.findUnique({ where: { id: docId } });
    expect(deletedDoc).toBeNull();

    // Verify chunks 0
    const chunks = await prisma.chunk.findMany({ where: { documentId: docId } });
    expect(chunks.length).toBe(0);

    // Verify file gone from disk
    await expect(fs.stat(docRow!.storagePath!)).rejects.toThrow();

    // Verify citation row remains with chunkId and documentId null
    const updatedCitation = await prisma.messageCitation.findUnique({
      where: { id: citation.id },
    });
    expect(updatedCitation).toBeDefined();
    expect(updatedCitation?.chunkId).toBeNull();
    expect(updatedCitation?.documentId).toBeNull();
    expect(updatedCitation?.fileName).toBe('sample.md');
    expect(updatedCitation?.snippet).toBe('Sample snippet snapshot');
  });

  it('T-29 AC-29: FAILED retry → 200 QUEUED, attempts +1, failure fields cleared; retry on READY/QUEUED/PROCESSING → 409 DOC_INVALID_TRANSITION; member → 403', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-29@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 29');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member-29@example.com', 'MEMBER');

    const failedDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Failed Doc',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-29-failed',
        status: DocumentStatus.FAILED,
        failureCode: 'EXTRACT_FAILED',
        failureMessage: 'Extraction failed test message',
        attempts: 1,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    const readyDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Ready Doc',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-29-ready',
        status: DocumentStatus.READY,
        attempts: 1,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    const queuedDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Queued Doc',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-29-queued',
        status: DocumentStatus.QUEUED,
        attempts: 0,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    const processingDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Processing Doc',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-29-processing',
        status: DocumentStatus.PROCESSING,
        attempts: 1,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    // 1. Member retry -> 403
    const memberRetry = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents/${failedDoc.id}/retry`)
      .set('Cookie', member.cookies);
    expect(memberRetry.status).toBe(403);
    expect(memberRetry.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 2. Retry on READY / QUEUED / PROCESSING -> 409 DOC_INVALID_TRANSITION
    for (const d of [readyDoc, queuedDoc, processingDoc]) {
      const res = await request(app.getHttpServer())
        .post(`/workspaces/${ws.id}/documents/${d.id}/retry`)
        .set('Cookie', admin.cookies);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.DOC_INVALID_TRANSITION);
    }

    // 3. FAILED retry -> 200 QUEUED, attempts +1, failure fields cleared
    const retryRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents/${failedDoc.id}/retry`)
      .set('Cookie', admin.cookies);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.status).toBe(DocumentStatus.QUEUED);
    expect(retryRes.body.attempts).toBe(2);
    expect(retryRes.body.failureCode).toBeNull();
    expect(retryRes.body.failureMessage).toBeNull();

    const inDb = await prisma.document.findUnique({ where: { id: failedDoc.id } });
    expect(inDb?.status).toBe(DocumentStatus.QUEUED);
    expect(inDb?.attempts).toBe(2);
    expect(inDb?.failureCode).toBeNull();
    expect(inDb?.failureMessage).toBeNull();
  });

  it('T-30 AC-30: open SSE as admin, upload, drive worker: events QUEUED→PROCESSING→READY received in order; member → 403; no cookie → 401', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-30@example.com');
    const ws = await createWorkspace(admin.cookies, 'Doc WS 30');
    const member = await inviteAndJoin(admin.cookies, ws.id, 'member-30@example.com', 'MEMBER');

    // 1. No cookie -> 401
    const noCookie = await request(app.getHttpServer()).get(`/workspaces/${ws.id}/documents/events`);
    expect(noCookie.status).toBe(401);
    expect(noCookie.body.error.code).toBe(ErrorCode.AUTH_REQUIRED);

    // 2. Member -> 403
    const memberEvents = await request(app.getHttpServer())
      .get(`/workspaces/${ws.id}/documents/events`)
      .set('Cookie', member.cookies);
    expect(memberEvents.status).toBe(403);
    expect(memberEvents.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 3. Open SSE as admin using http.request to live server port
    const eventsReceived: Array<{ documentId: string; status: string }> = [];

    const cookieHeader = admin.cookies.join('; ');
    const sseReq = http.request({
      hostname: '127.0.0.1',
      port: serverPort,
      path: `/workspaces/${ws.id}/documents/events`,
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
      },
    });

    const sseConnected = new Promise<void>((resolve) => {
      sseReq.on('response', (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        resolve();

        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            let event = '';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) event = line.substring(7).trim();
              if (line.startsWith('data: ')) data = line.substring(6).trim();
            }
            if (event === 'document.status' && data) {
              try {
                eventsReceived.push(JSON.parse(data));
              } catch {
                // ignore
              }
            }
          }
        });
      });
    });

    sseReq.end();
    await sseConnected;

    // Small delay to ensure SSE listener registered
    await new Promise((r) => setTimeout(r, 50));

    // Upload file -> triggers QUEUED
    const mdPath = path.resolve('test/fixtures/files/sample.md');
    const uploadRes = await request(app.getHttpServer())
      .post(`/workspaces/${ws.id}/documents`)
      .set('Cookie', admin.cookies)
      .attach('file', mdPath);
    expect(uploadRes.status).toBe(201);
    const docId = uploadRes.body.id;

    // Drive worker: transition QUEUED -> PROCESSING -> READY
    await prisma.document.update({
      where: { id: docId },
      data: { status: DocumentStatus.PROCESSING },
    });
    eventsService.emit(ws.id, {
      documentId: docId,
      status: DocumentStatus.PROCESSING,
      failureCode: null,
      failureMessage: null,
    });

    await prisma.document.update({
      where: { id: docId },
      data: { status: DocumentStatus.READY },
    });
    eventsService.emit(ws.id, {
      documentId: docId,
      status: DocumentStatus.READY,
      failureCode: null,
      failureMessage: null,
    });

    // Wait for events to arrive
    for (let i = 0; i < 20; i++) {
      if (eventsReceived.length >= 3) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    sseReq.destroy();

    expect(eventsReceived.length).toBeGreaterThanOrEqual(3);
    const relevantEvents = eventsReceived.filter((e) => e.documentId === docId);
    expect(relevantEvents.map((e) => e.status)).toEqual([
      DocumentStatus.QUEUED,
      DocumentStatus.PROCESSING,
      DocumentStatus.READY,
    ]);
  });

  it('T-31 AC-31: 25 chunks inserted; page through with limit=10 in ordinal order; fields present; member → 403; other workspace doc → 404', async () => {
    const admin = await createUserAndLogin('Admin User', 'admin-31@example.com');
    const ws1 = await createWorkspace(admin.cookies, 'Doc WS 31 A');
    const ws2 = await createWorkspace(admin.cookies, 'Doc WS 31 B');
    const member = await inviteAndJoin(admin.cookies, ws1.id, 'member-31@example.com', 'MEMBER');

    const doc = await prisma.document.create({
      data: {
        workspaceId: ws1.id,
        title: 'Doc with Chunks',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-31',
        status: DocumentStatus.READY,
        chunkCount: 25,
        visibility: DocumentVisibility.ALL_MEMBERS,
        uploadedById: admin.user.id,
      },
    });

    // Insert 25 chunks
    for (let i = 0; i < 25; i++) {
      await insertTestChunk(prisma, {
        id: randomUUID(),
        documentId: doc.id,
        workspaceId: ws1.id,
        ordinal: i,
        text: `Chunk passage text ${i}`,
        page: i % 2 === 0 ? Math.floor(i / 2) + 1 : null,
        heading: `Heading ${Math.floor(i / 5)}`,
      });
    }

    // 1. Member -> 403
    const memberRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc.id}/passages`)
      .set('Cookie', member.cookies);
    expect(memberRes.status).toBe(403);
    expect(memberRes.body.error.code).toBe(ErrorCode.FORBIDDEN);

    // 2. Other workspace doc -> 404
    const otherWsRes = await request(app.getHttpServer())
      .get(`/workspaces/${ws2.id}/documents/${doc.id}/passages`)
      .set('Cookie', admin.cookies);
    expect(otherWsRes.status).toBe(404);
    expect(otherWsRes.body.error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);

    // 3. Page through with limit=10 in ordinal order
    // Page 1: ordinals 0..9
    const page1 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc.id}/passages?limit=10`)
      .set('Cookie', admin.cookies);
    expect(page1.status).toBe(200);
    expect(page1.body.data.length).toBe(10);
    expect(page1.body.nextCursor).toBeDefined();

    for (let i = 0; i < 10; i++) {
      const chunk = page1.body.data[i];
      expect(chunk.ordinal).toBe(i);
      expect(chunk.text).toBe(`Chunk passage text ${i}`);
      expect(chunk.heading).toBeDefined();
      expect(chunk.id).toBeDefined();
    }

    // Page 2: ordinals 10..19
    const page2 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc.id}/passages?limit=10&cursor=${page1.body.nextCursor}`)
      .set('Cookie', admin.cookies);
    expect(page2.status).toBe(200);
    expect(page2.body.data.length).toBe(10);
    expect(page2.body.nextCursor).toBeDefined();
    for (let i = 0; i < 10; i++) {
      expect(page2.body.data[i].ordinal).toBe(10 + i);
    }

    // Page 3: ordinals 20..24
    const page3 = await request(app.getHttpServer())
      .get(`/workspaces/${ws1.id}/documents/${doc.id}/passages?limit=10&cursor=${page2.body.nextCursor}`)
      .set('Cookie', admin.cookies);
    expect(page3.status).toBe(200);
    expect(page3.body.data.length).toBe(5);
    expect(page3.body.nextCursor).toBeNull();
    for (let i = 0; i < 5; i++) {
      expect(page3.body.data[i].ordinal).toBe(20 + i);
    }
  });
});
