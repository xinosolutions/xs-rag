import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getStorageToken, ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { MailService } from '../src/auth/mail.service.js';
import { hashToken } from '../src/common/hash.js';
import { truncateAllTables } from './helpers/db.js';

describe('Phase 3: Workspaces & Members (T-09..T-20)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailService: MailService;
  let throttlerStorage: ThrottlerStorage;

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
    mailService = app.get(MailService);
    throttlerStorage = app.get(getStorageToken());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    mailService.clearRecordedMails();
    await truncateAllTables(prisma);
    (throttlerStorage as any)._storage?.clear?.();
    (throttlerStorage as any).storage?.clear?.();
    (throttlerStorage as any).hitExpirations?.clear?.();
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

  it('T-09 AC-09: create workspace → 201; caller is ADMIN; slug unique across two same-name workspaces; modelId default', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t09@example.com');

    const res1 = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Acme Corp' });

    expect(res1.status).toBe(201);
    expect(res1.body).toMatchObject({
      name: 'Acme Corp',
      slug: 'acme-corp',
      role: 'ADMIN',
    });
    expect(res1.body.id).toBeDefined();

    const ws1 = await prisma.workspace.findUnique({
      where: { id: res1.body.id },
    });
    expect(ws1).toBeDefined();
    expect(ws1?.modelId).toBe('claude-sonnet-5-5');
    expect(ws1?.createdById).toBe(userA.user.id);

    // Create second workspace with the same name
    const res2 = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Acme Corp' });

    expect(res2.status).toBe(201);
    expect(res2.body.name).toBe('Acme Corp');
    expect(res2.body.role).toBe('ADMIN');
    expect(res2.body.slug).not.toBe(res1.body.slug);
    expect(res2.body.slug).toMatch(/^acme-corp-/);
  });

  it('T-10 AC-10: 4th owned workspace → 409 WORKSPACE_LIMIT; empty and 81-char names → 400', async () => {
    const userB = await createUserAndLogin('Bob', 'bob.t10@example.com');

    // Create 3 workspaces (up to limit)
    for (let i = 1; i <= 3; i++) {
      const res = await request(app.getHttpServer())
        .post('/workspaces')
        .set('Cookie', userB.cookies)
        .send({ name: `Workspace ${i}` });
      expect(res.status).toBe(201);
    }

    // 4th owned workspace returns 409 WORKSPACE_LIMIT
    const resLimit = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userB.cookies)
      .send({ name: 'Workspace 4' });
    expect(resLimit.status).toBe(409);
    expect(resLimit.body.error.code).toBe('WORKSPACE_LIMIT');

    // Empty name returns 400
    const resEmpty = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userB.cookies)
      .send({ name: '' });
    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.error.code).toBe('VALIDATION_FAILED');
    expect(resEmpty.body.error.details?.fields?.some((f: any) => f.field === 'name')).toBe(true);

    // 81-char name returns 400
    const resLong = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userB.cookies)
      .send({ name: 'a'.repeat(81) });
    expect(resLong.status).toBe(400);
    expect(resLong.body.error.code).toBe('VALIDATION_FAILED');
    expect(resLong.body.error.details?.fields?.some((f: any) => f.field === 'name')).toBe(true);
  });

  it('T-11 AC-11: list returns only own; stranger GET /workspaces/:wid → 404 WORKSPACE_NOT_FOUND', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t11@example.com');
    const userB = await createUserAndLogin('Bob', 'bob.t11@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Alice Space' });
    const wsAId = resA.body.id;

    const resB = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userB.cookies)
      .send({ name: 'Bob Space' });
    const wsBId = resB.body.id;

    // List for Alice
    const listA = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Cookie', userA.cookies);
    expect(listA.status).toBe(200);
    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0].id).toBe(wsAId);

    // List for Bob
    const listB = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Cookie', userB.cookies);
    expect(listB.status).toBe(200);
    expect(listB.body.data).toHaveLength(1);
    expect(listB.body.data[0].id).toBe(wsBId);

    // Stranger Bob queries Alice's workspace -> 404 WORKSPACE_NOT_FOUND
    const getStranger = await request(app.getHttpServer())
      .get(`/workspaces/${wsAId}`)
      .set('Cookie', userB.cookies);
    expect(getStranger.status).toBe(404);
    expect(getStranger.body.error.code).toBe('WORKSPACE_NOT_FOUND');

    // Admin Alice queries own workspace -> 200, includes modelId
    const getAdmin = await request(app.getHttpServer())
      .get(`/workspaces/${wsAId}`)
      .set('Cookie', userA.cookies);
    expect(getAdmin.status).toBe(200);
    expect(getAdmin.body.id).toBe(wsAId);
    expect(getAdmin.body.modelId).toBeDefined();
  });

  it('T-12 AC-12: admin PATCH name → 200; member → 403 FORBIDDEN; stranger → 404', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t12@example.com');
    const userB = await createUserAndLogin('Bob', 'bob.t12@example.com');
    const userC = await createUserAndLogin('Charlie', 'charlie.t12@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Initial Name' });
    const wid = resA.body.id;

    // Add Bob as MEMBER
    await prisma.membership.create({
      data: {
        workspaceId: wid,
        userId: userB.user.id,
        role: 'MEMBER',
      },
    });

    // Admin Alice renames -> 200
    const renameAdmin = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}`)
      .set('Cookie', userA.cookies)
      .send({ name: 'Renamed Workspace' });
    expect(renameAdmin.status).toBe(200);
    expect(renameAdmin.body.name).toBe('Renamed Workspace');

    // Member Bob renames -> 403 FORBIDDEN
    const renameMember = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}`)
      .set('Cookie', userB.cookies)
      .send({ name: 'Member Hack' });
    expect(renameMember.status).toBe(403);
    expect(renameMember.body.error.code).toBe('FORBIDDEN');

    // Stranger Charlie renames -> 404 WORKSPACE_NOT_FOUND
    const renameStranger = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}`)
      .set('Cookie', userC.cookies)
      .send({ name: 'Stranger Hack' });
    expect(renameStranger.status).toBe(404);
    expect(renameStranger.body.error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('T-13 AC-13: admin invites → 201, mail recorded with /invite/ link, expiresAt +7 days; member → 403; bad email → 400; bad role → 400', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t13@example.com');
    const userB = await createUserAndLogin('Bob', 'bob.t13@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Invite Space' });
    const wid = resA.body.id;

    await prisma.membership.create({
      data: {
        workspaceId: wid,
        userId: userB.user.id,
        role: 'MEMBER',
      },
    });

    // Admin invites -> 201
    const inviteRes = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'newbie@example.com', role: 'MEMBER' });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body).toMatchObject({
      email: 'newbie@example.com',
      role: 'MEMBER',
    });
    expect(inviteRes.body.id).toBeDefined();

    const expiresAt = new Date(inviteRes.body.expiresAt).getTime();
    const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(10000);

    expect(mailService.recordedMails).toHaveLength(1);
    expect(mailService.recordedMails[0].to).toBe('newbie@example.com');
    expect(mailService.recordedMails[0].text).toContain('/invite/');

    // Member Bob invites -> 403
    const memberInvite = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userB.cookies)
      .send({ email: 'other@example.com', role: 'MEMBER' });
    expect(memberInvite.status).toBe(403);
    expect(memberInvite.body.error.code).toBe('FORBIDDEN');

    // Bad email -> 400
    const badEmailInvite = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'not-an-email', role: 'MEMBER' });
    expect(badEmailInvite.status).toBe(400);
    expect(badEmailInvite.body.error.code).toBe('VALIDATION_FAILED');

    // Bad role -> 400
    const badRoleInvite = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'valid@example.com', role: 'SUPERADMIN' });
    expect(badRoleInvite.status).toBe(400);
    expect(badRoleInvite.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('T-14 AC-14: invite existing member → 409 ALREADY_MEMBER; second pending invite → 409 INVITE_EXISTS; after expiry (clock) a new invite → 201 and the old row is gone', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t14@example.com');
    const userB = await createUserAndLogin('Bob', 'bob.t14@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Conflict Space' });
    const wid = resA.body.id;

    await prisma.membership.create({
      data: {
        workspaceId: wid,
        userId: userB.user.id,
        role: 'MEMBER',
      },
    });

    // Inviting existing member returns 409 ALREADY_MEMBER
    const resAlready = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: userB.user.email, role: 'MEMBER' });
    expect(resAlready.status).toBe(409);
    expect(resAlready.body.error.code).toBe('ALREADY_MEMBER');

    // First invite to pending user -> 201
    const resFirst = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'pending@example.com', role: 'MEMBER' });
    expect(resFirst.status).toBe(201);
    const firstInviteId = resFirst.body.id;

    // Second pending invite to same email -> 409 INVITE_EXISTS
    const resSecond = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'pending@example.com', role: 'MEMBER' });
    expect(resSecond.status).toBe(409);
    expect(resSecond.body.error.code).toBe('INVITE_EXISTS');

    // Simulate clock forward by setting expiresAt in past
    await prisma.invitation.update({
      where: { id: firstInviteId },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });

    // New invite after expiry succeeds and replaces old row
    const resAfterExpiry = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'pending@example.com', role: 'ADMIN' });
    expect(resAfterExpiry.status).toBe(201);
    expect(resAfterExpiry.body.role).toBe('ADMIN');

    const count = await prisma.invitation.count({
      where: { workspaceId: wid, email: 'pending@example.com' },
    });
    expect(count).toBe(1);

    const oldRow = await prisma.invitation.findUnique({
      where: { id: firstInviteId },
    });
    expect(oldRow).toBeNull();
  });

  it('T-15 AC-15: preview with no auth → 200; accept as invited user → 200, membership exists; second accept → 404 INVITE_NOT_FOUND; random token → 404', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t15@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Acme Workspace' });
    const wid = resA.body.id;

    await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'joiner@example.com', role: 'MEMBER' });

    expect(mailService.recordedMails).toHaveLength(1);
    const token = mailService.recordedMails[0].token!;

    // Preview with no auth -> 200
    const previewRes = await request(app.getHttpServer()).get(`/invitations/${token}`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.body).toMatchObject({
      workspaceName: 'Acme Workspace',
      email: 'joiner@example.com',
      role: 'MEMBER',
    });
    expect(previewRes.body.expiresAt).toBeDefined();

    // Register and login as invited user
    const joinerUser = await createUserAndLogin('Joiner', 'joiner@example.com');

    // Accept invitation -> 200
    const acceptRes = await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set('Cookie', joinerUser.cookies);
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body).toEqual({ workspaceId: wid });

    // Membership exists in DB
    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: wid,
          userId: joinerUser.user.id,
        },
      },
    });
    expect(membership).toBeDefined();
    expect(membership?.role).toBe('MEMBER');

    // Second accept with same token -> 404 INVITE_NOT_FOUND
    const secondAccept = await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set('Cookie', joinerUser.cookies);
    expect(secondAccept.status).toBe(404);
    expect(secondAccept.body.error.code).toBe('INVITE_NOT_FOUND');

    // Random token -> 404
    const randomAccept = await request(app.getHttpServer())
      .post('/invitations/non-existent-token-xyz/accept')
      .set('Cookie', joinerUser.cookies);
    expect(randomAccept.status).toBe(404);
    expect(randomAccept.body.error.code).toBe('INVITE_NOT_FOUND');
  });

  it('T-16 AC-16: other user accepts → 403 INVITE_EMAIL_MISMATCH; expired → 409 INVITE_EXPIRED; no cookie → 401', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t16@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Secret Space' });
    const wid = resA.body.id;

    await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'intended@example.com', role: 'MEMBER' });

    const token = mailService.recordedMails[0].token!;

    // No cookie -> 401 AUTH_REQUIRED
    const noAuthAccept = await request(app.getHttpServer()).post(`/invitations/${token}/accept`);
    expect(noAuthAccept.status).toBe(401);
    expect(noAuthAccept.body.error.code).toBe('AUTH_REQUIRED');

    // Different user accepts -> 403 INVITE_EMAIL_MISMATCH
    const otherUser = await createUserAndLogin('Impostor', 'impostor@example.com');
    const wrongUserAccept = await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set('Cookie', otherUser.cookies);
    expect(wrongUserAccept.status).toBe(403);
    expect(wrongUserAccept.body.error.code).toBe('INVITE_EMAIL_MISMATCH');

    // Expire the invitation in DB
    await prisma.invitation.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    // Intended user accepts expired -> 409 INVITE_EXPIRED
    const intendedUser = await createUserAndLogin('Intended', 'intended@example.com');
    const expiredAccept = await request(app.getHttpServer())
      .post(`/invitations/${token}/accept`)
      .set('Cookie', intendedUser.cookies);
    expect(expiredAccept.status).toBe(409);
    expect(expiredAccept.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('T-17 AC-17: admin PATCH role → 200; member → 403; random user id → 404 MEMBER_NOT_FOUND; role OWNER → 400', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t17@example.com');
    const userB = await createUserAndLogin('Bob', 'bob.t17@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Role Space' });
    const wid = resA.body.id;

    await prisma.membership.create({
      data: {
        workspaceId: wid,
        userId: userB.user.id,
        role: 'MEMBER',
      },
    });

    // Admin promotes Bob to ADMIN -> 200
    const promoteRes = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/members/${userB.user.id}`)
      .set('Cookie', userA.cookies)
      .send({ role: 'ADMIN' });
    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.role).toBe('ADMIN');

    // Demote Bob back to MEMBER
    await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/members/${userB.user.id}`)
      .set('Cookie', userA.cookies)
      .send({ role: 'MEMBER' });

    // Member Bob tries to change Alice's role -> 403 FORBIDDEN
    const memberTry = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/members/${userA.user.id}`)
      .set('Cookie', userB.cookies)
      .send({ role: 'MEMBER' });
    expect(memberTry.status).toBe(403);
    expect(memberTry.body.error.code).toBe('FORBIDDEN');

    // Random user id -> 404 MEMBER_NOT_FOUND
    const notFoundRes = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/members/00000000-0000-0000-0000-000000000000`)
      .set('Cookie', userA.cookies)
      .send({ role: 'ADMIN' });
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.error.code).toBe('MEMBER_NOT_FOUND');

    // Role OWNER -> 400 VALIDATION_FAILED
    const invalidRoleRes = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/members/${userB.user.id}`)
      .set('Cookie', userA.cookies)
      .send({ role: 'OWNER' });
    expect(invalidRoleRes.status).toBe(400);
    expect(invalidRoleRes.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('T-18 AC-18: DELETE member → 204; removed user GET /workspaces/:wid → 404; their DocumentAccess rows count 0; DELETE invitation → 204', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t18@example.com');
    const userB = await createUserAndLogin('Bob', 'bob.t18@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Delete Space' });
    const wid = resA.body.id;

    await prisma.membership.create({
      data: {
        workspaceId: wid,
        userId: userB.user.id,
        role: 'MEMBER',
      },
    });

    const doc = await prisma.document.create({
      data: {
        workspaceId: wid,
        title: 'Secret Spec',
        sourceType: 'PDF',
        contentHash: 'hash-doc-t18',
        uploadedById: userA.user.id,
      },
    });

    await prisma.documentAccess.create({
      data: {
        documentId: doc.id,
        userId: userB.user.id,
      },
    });

    // Verify DocumentAccess row exists
    const accessCountBefore = await prisma.documentAccess.count({
      where: { userId: userB.user.id, document: { workspaceId: wid } },
    });
    expect(accessCountBefore).toBe(1);

    // Remove member Bob
    const deleteRes = await request(app.getHttpServer())
      .delete(`/workspaces/${wid}/members/${userB.user.id}`)
      .set('Cookie', userA.cookies);
    expect(deleteRes.status).toBe(204);

    // Removed user GET /workspaces/:wid -> 404 WORKSPACE_NOT_FOUND
    const getRes = await request(app.getHttpServer())
      .get(`/workspaces/${wid}`)
      .set('Cookie', userB.cookies);
    expect(getRes.status).toBe(404);
    expect(getRes.body.error.code).toBe('WORKSPACE_NOT_FOUND');

    // DocumentAccess rows count 0
    const accessCountAfter = await prisma.documentAccess.count({
      where: { userId: userB.user.id, document: { workspaceId: wid } },
    });
    expect(accessCountAfter).toBe(0);

    // Admin creates invitation then cancels it
    const inviteRes = await request(app.getHttpServer())
      .post(`/workspaces/${wid}/invitations`)
      .set('Cookie', userA.cookies)
      .send({ email: 'temp@example.com', role: 'MEMBER' });
    expect(inviteRes.status).toBe(201);
    const inviteId = inviteRes.body.id;

    const cancelRes = await request(app.getHttpServer())
      .delete(`/workspaces/${wid}/invitations/${inviteId}`)
      .set('Cookie', userA.cookies);
    expect(cancelRes.status).toBe(204);

    const inviteRow = await prisma.invitation.findUnique({
      where: { id: inviteId },
    });
    expect(inviteRow).toBeNull();
  });

  it('T-19 AC-19: single admin demoted and removed → 409 LAST_ADMIN twice; after promoting a second admin both succeed', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t19@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Sole Admin Space' });
    const wid = resA.body.id;

    // Sole admin demoting self -> 409 LAST_ADMIN
    const demoteRes = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/members/${userA.user.id}`)
      .set('Cookie', userA.cookies)
      .send({ role: 'MEMBER' });
    expect(demoteRes.status).toBe(409);
    expect(demoteRes.body.error.code).toBe('LAST_ADMIN');

    // Sole admin removing self -> 409 LAST_ADMIN
    const removeRes = await request(app.getHttpServer())
      .delete(`/workspaces/${wid}/members/${userA.user.id}`)
      .set('Cookie', userA.cookies);
    expect(removeRes.status).toBe(409);
    expect(removeRes.body.error.code).toBe('LAST_ADMIN');

    // Add and promote a second user to ADMIN
    const userB = await createUserAndLogin('Bob', 'bob.t19@example.com');
    await prisma.membership.create({
      data: {
        workspaceId: wid,
        userId: userB.user.id,
        role: 'ADMIN',
      },
    });

    // Now demoting userA succeeds
    const demoteSuccess = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/members/${userA.user.id}`)
      .set('Cookie', userB.cookies)
      .send({ role: 'MEMBER' });
    expect(demoteSuccess.status).toBe(200);
    expect(demoteSuccess.body.role).toBe('MEMBER');

    // Removing userA succeeds
    const removeSuccess = await request(app.getHttpServer())
      .delete(`/workspaces/${wid}/members/${userA.user.id}`)
      .set('Cookie', userB.cookies);
    expect(removeSuccess.status).toBe(204);

    const deletedMembership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: wid,
          userId: userA.user.id,
        },
      },
    });
    expect(deletedMembership).toBeNull();
  });

  it('T-20 AC-20: GET /ai-models includes fake-model; PATCH settings fake-model → 200; gpt-9 → 400 MODEL_NOT_SUPPORTED; member → 403', async () => {
    const userA = await createUserAndLogin('Alice', 'alice.t20@example.com');
    const userB = await createUserAndLogin('Bob', 'bob.t20@example.com');

    const resA = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', userA.cookies)
      .send({ name: 'Model Space' });
    const wid = resA.body.id;

    await prisma.membership.create({
      data: {
        workspaceId: wid,
        userId: userB.user.id,
        role: 'MEMBER',
      },
    });

    // GET /ai-models includes fake-model
    const catalogRes = await request(app.getHttpServer())
      .get('/ai-models')
      .set('Cookie', userA.cookies);
    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fake-model',
          label: 'Fake Model (Test)',
          provider: 'fake',
        }),
      ]),
    );

    // Admin updates setting to fake-model -> 200
    const patchFakeRes = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/settings`)
      .set('Cookie', userA.cookies)
      .send({ modelId: 'fake-model' });
    expect(patchFakeRes.status).toBe(200);
    expect(patchFakeRes.body).toEqual({ modelId: 'fake-model' });

    // Verify GET settings returns fake-model
    const getSettingsRes = await request(app.getHttpServer())
      .get(`/workspaces/${wid}/settings`)
      .set('Cookie', userA.cookies);
    expect(getSettingsRes.status).toBe(200);
    expect(getSettingsRes.body).toEqual({ modelId: 'fake-model' });

    // Admin updates setting to unsupported model -> 400 MODEL_NOT_SUPPORTED
    const patchUnsupportedRes = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/settings`)
      .set('Cookie', userA.cookies)
      .send({ modelId: 'gpt-9' });
    expect(patchUnsupportedRes.status).toBe(400);
    expect(patchUnsupportedRes.body.error.code).toBe('MODEL_NOT_SUPPORTED');

    // Member updates settings -> 403 FORBIDDEN
    const memberPatchRes = await request(app.getHttpServer())
      .patch(`/workspaces/${wid}/settings`)
      .set('Cookie', userB.cookies)
      .send({ modelId: 'fake-model' });
    expect(memberPatchRes.status).toBe(403);
    expect(memberPatchRes.body.error.code).toBe('FORBIDDEN');
  });
});
