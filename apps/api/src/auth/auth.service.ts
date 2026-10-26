import { Injectable, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCode, Limits } from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { TokenService } from './token.service.js';
import { MailService } from './mail.service.js';
import { hashPassword, verifyPassword, hashToken } from '../common/hash.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './auth.dto.js';

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface MeResult {
  user: {
    id: string;
    email: string;
    name: string;
  };
  memberships: Array<{
    workspaceId: string;
    name: string;
    slug: string;
    role: string;
  }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ApiException(
        ErrorCode.EMAIL_TAKEN,
        'Email already registered',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash,
      },
    });

    const accessToken = this.tokenService.generateAccessToken(user.id);
    const refreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = hashToken(refreshToken);
    const familyId = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + Limits.REFRESH_TOKEN_LIFETIME_MS),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    const isValid = user ? await verifyPassword(user.passwordHash, dto.password) : false;
    if (!user || !isValid) {
      throw new ApiException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Email or password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const accessToken = this.tokenService.generateAccessToken(user.id);
    const refreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = hashToken(refreshToken);
    const familyId = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + Limits.REFRESH_TOKEN_LIFETIME_MS),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshTokenString?: string): Promise<AuthResult> {
    if (!refreshTokenString || refreshTokenString.trim() === '') {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokenHash = hashToken(refreshTokenString.trim());
    const tokenRow = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRow || tokenRow.expiresAt.getTime() < Date.now()) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (tokenRow.revokedAt !== null) {
      // Replay attack: revoke entire family
      await this.prisma.refreshToken.updateMany({
        where: { familyId: tokenRow.familyId },
        data: { revokedAt: new Date() },
      });
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Mark current token as revoked
    await this.prisma.refreshToken.update({
      where: { id: tokenRow.id },
      data: { revokedAt: new Date() },
    });

    // Create new token in the same family
    const newAccessToken = this.tokenService.generateAccessToken(tokenRow.userId);
    const newRefreshToken = this.tokenService.generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: tokenRow.userId,
        familyId: tokenRow.familyId,
        tokenHash: hashToken(newRefreshToken),
        expiresAt: new Date(Date.now() + Limits.REFRESH_TOKEN_LIFETIME_MS),
      },
    });

    return {
      user: {
        id: tokenRow.user.id,
        email: tokenRow.user.email,
        name: tokenRow.user.name,
      },
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshTokenString?: string): Promise<void> {
    if (refreshTokenString && refreshTokenString.trim() !== '') {
      const tokenHash = hashToken(refreshTokenString.trim());
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      const rawToken = this.tokenService.generateResetToken();
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + Limits.RESET_TOKEN_LIFETIME_MS),
        },
      });

      await this.mailService.sendPasswordResetMail(user.email, rawToken);
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token.trim());
    const resetRow = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetRow || resetRow.usedAt !== null || resetRow.expiresAt.getTime() < Date.now()) {
      throw new ApiException(
        ErrorCode.RESET_TOKEN_INVALID,
        'Password reset token unknown, expired or used',
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await hashPassword(dto.password);

    await this.prisma.user.update({
      where: { id: resetRow.userId },
      data: { passwordHash },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: resetRow.id },
      data: { usedAt: new Date() },
    });

    // Revoke all refresh tokens for this user
    await this.prisma.refreshToken.updateMany({
      where: { userId: resetRow.userId },
      data: { revokedAt: new Date() },
    });
  }

  async getMe(userId: string): Promise<MeResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'User not found',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const memberships = user.memberships.map((m) => ({
      workspaceId: m.workspaceId,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
    }));

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      memberships,
    };
  }
}
