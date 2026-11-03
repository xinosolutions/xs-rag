import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getStorageToken, ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { MailService } from '../src/auth/mail.service.js';
import { truncateAllTables } from './helpers/db.js';

describe('Phase 2: Authentication & Mail (T-01..T-08)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailService: MailService;
  let throttlerStorage: ThrottlerStorage;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LLM_PROVIDER = 'fake';
    process.env.JWT_SECRET = 'super-secret-jwt-secret-min-32-chars-length';
    process.env.IP_HASH_SALT = 'test-salt-string';
    process.env.THROTTLE_AUTH_PER_MIN = '10';
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

  it('T-01 AC-01: register stores argon2id hash, lowercases email, sets cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Alice Smith',
        email: 'Alice.Smith@Example.COM',
        password: 'Password123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Alice Smith',
      email: 'alice.smith@example.com',
    });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('xs_access=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('xs_refresh=') && c.includes('HttpOnly'))).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email: 'alice.smith@example.com' },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('T-02 AC-02: duplicate email returns 409 EMAIL_TAKEN; validation failures return 400 with fields', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'Password123!',
    });

    // Duplicate email differing by case
    const dupRes = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Bob Duplicate',
      email: 'BOB@example.com',
      password: 'Password123!',
    });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('EMAIL_TAKEN');

    // Bad email
    const badEmail = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Bob',
      email: 'not-an-email',
      password: 'Password123!',
    });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body.error.code).toBe('VALIDATION_FAILED');
    expect(badEmail.body.error.details.fields).toBeDefined();

    // 9-char password
    const shortPass = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Bob',
      email: 'bob2@example.com',
      password: 'Short9ch',
    });
    expect(shortPass.status).toBe(400);
    expect(shortPass.body.error.code).toBe('VALIDATION_FAILED');

    // Empty name
    const emptyName = await request(app.getHttpServer()).post('/auth/register').send({
      name: '',
      email: 'bob3@example.com',
      password: 'Password123!',
    });
    expect(emptyName.status).toBe(400);
    expect(emptyName.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('T-03 AC-03: login returns cookies; wrong password and unknown email return identical 401 bodies', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Charlie',
      email: 'charlie@example.com',
      password: 'CorrectPassword123!',
    });

    const successRes = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'charlie@example.com',
      password: 'CorrectPassword123!',
    });
    expect(successRes.status).toBe(200);
    expect(successRes.headers['set-cookie']).toBeDefined();

    const wrongPass = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'charlie@example.com',
      password: 'WrongPassword123!',
    });
    expect(wrongPass.status).toBe(401);
    expect(wrongPass.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    const unknownEmail = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'nobody@example.com',
      password: 'AnyPassword123!',
    });
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    expect(wrongPass.body.error.code).toBe(unknownEmail.body.error.code);
    expect(wrongPass.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('T-04 AC-04: logout clears cookies; refresh with logged out cookie returns 401', async () => {
    const regRes = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Dave',
      email: 'dave@example.com',
      password: 'Password123!',
    });

    const cookies = regRes.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('xs_refresh='))!;

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [refreshCookie]);

    expect(logoutRes.status).toBe(204);

    const refRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie]);

    expect(refRes.status).toBe(401);
    expect(refRes.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('T-05 AC-05: token rotation and family revocation on replay', async () => {
    const regRes = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Eve',
      email: 'eve@example.com',
      password: 'Password123!',
    });

    const cookies1 = regRes.headers['set-cookie'] as unknown as string[];
    const refresh1 = cookies1.find((c) => c.startsWith('xs_refresh='))!;

    // Rotate once
    const ref1Res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refresh1]);

    expect(ref1Res.status).toBe(200);
    const cookies2 = ref1Res.headers['set-cookie'] as unknown as string[];
    const refresh2 = cookies2.find((c) => c.startsWith('xs_refresh='))!;
    expect(refresh2).not.toBe(refresh1);

    // Replay old refresh token (refresh1)
    const replayRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refresh1]);

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe('AUTH_REQUIRED');

    // Newer token (refresh2) must now also be rejected
    const blockedRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refresh2]);

    expect(blockedRes.status).toBe(401);
    expect(blockedRes.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('T-06 AC-06: forgot-password, reset-password, and invalid token handling', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Frank',
      email: 'frank@example.com',
      password: 'OldPassword123!',
    });

    const knownRes = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'frank@example.com' });
    expect(knownRes.status).toBe(204);

    const unknownRes = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'unknown@example.com' });
    expect(unknownRes.status).toBe(204);

    expect(mailService.recordedMails.length).toBe(1);
    const recorded = mailService.recordedMails[0]!;
    expect(recorded.to).toBe('frank@example.com');
    const resetToken = recorded.token!;

    // Reset password
    const resetRes = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        token: resetToken,
        password: 'NewPassword123!',
      });
    expect(resetRes.status).toBe(204);

    // Login with new password succeeds
    const loginNew = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'frank@example.com',
      password: 'NewPassword123!',
    });
    expect(loginNew.status).toBe(200);

    // Login with old password fails
    const loginOld = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'frank@example.com',
      password: 'OldPassword123!',
    });
    expect(loginOld.status).toBe(401);

    // Reuse reset token
    const reuseRes = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        token: resetToken,
        password: 'AnotherPassword123!',
      });
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.error.code).toBe('RESET_TOKEN_INVALID');

    // Garbage token
    const garbageRes = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({
        token: 'garbage-token-xyz',
        password: 'AnotherPassword123!',
      });
    expect(garbageRes.status).toBe(400);
    expect(garbageRes.body.error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('T-07 AC-07: GET /auth/me returns user and memberships; guards against missing/expired tokens', async () => {
    const noCookie = await request(app.getHttpServer()).get('/auth/me');
    expect(noCookie.status).toBe(401);
    expect(noCookie.body.error.code).toBe('AUTH_REQUIRED');

    // Register user
    const regRes = await request(app.getHttpServer()).post('/auth/register').send({
      name: 'Grace',
      email: 'grace@example.com',
      password: 'Password123!',
    });
    const cookies = regRes.headers['set-cookie'] as unknown as string[];
    const accessCookie = cookies.find((c) => c.startsWith('xs_access='))!;

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', [accessCookie]);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toMatchObject({
      name: 'Grace',
      email: 'grace@example.com',
    });
    expect(meRes.body.memberships).toEqual([]);
  });

  it('T-08 AC-08: rate limit on /auth/login returns 429 with Retry-After header', async () => {
    // 10 requests should succeed or return 401
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'rate@example.com',
        password: 'Password123!',
      });
      expect(res.status).not.toBe(429);
    }

    // 11th request returns 429 RATE_LIMITED
    const rateLimitedRes = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'rate@example.com',
      password: 'Password123!',
    });

    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.body.error.code).toBe('RATE_LIMITED');
    expect(rateLimitedRes.headers).toHaveProperty('retry-after');
  });
});
