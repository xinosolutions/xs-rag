import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { Limits } from '@xs-rag/shared';
import { getEnv } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

export interface SessionTokenPayload {
  sub?: string;
  typ: 'session';
  pt: 'VISITOR' | 'WIDGET';
  wid: string;
  vid: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessToken(userId: string): string {
    const payload: AccessTokenPayload = {
      sub: userId,
      typ: 'access',
    };
    return this.jwtService.sign(payload, {
      expiresIn: '15m',
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwtService.verify<AccessTokenPayload>(token);
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('hex');
  }

  generateResetToken(): string {
    return randomBytes(32).toString('base64url');
  }

  generateSessionToken(params: { pt: 'VISITOR' | 'WIDGET'; wid: string; vid: string }): string {
    const payload: SessionTokenPayload = {
      typ: 'session',
      pt: params.pt,
      wid: params.wid,
      vid: params.vid,
    };
    return this.jwtService.sign(payload, {
      expiresIn: '24h',
    });
  }

  verifySessionToken(token: string): SessionTokenPayload {
    return this.jwtService.verify<SessionTokenPayload>(token);
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const env = getEnv();
    const isProduction = env.NODE_ENV === 'production';
    const domain = env.COOKIE_DOMAIN ? env.COOKIE_DOMAIN : undefined;

    res.cookie('xs_access', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isProduction,
      domain,
      maxAge: Limits.ACCESS_TOKEN_LIFETIME_MS,
    });

    res.cookie('xs_refresh', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isProduction,
      domain,
      maxAge: Limits.REFRESH_TOKEN_LIFETIME_MS,
    });
  }

  clearAuthCookies(res: Response): void {
    const env = getEnv();
    const domain = env.COOKIE_DOMAIN ? env.COOKIE_DOMAIN : undefined;

    res.clearCookie('xs_access', {
      path: '/',
      domain,
    });
    res.clearCookie('xs_refresh', {
      path: '/',
      domain,
    });
  }
}
