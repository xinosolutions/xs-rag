import { Injectable, HttpStatus } from '@nestjs/common';
import crypto from 'node:crypto';
import { ApiKeyKind, ErrorCode, Limits } from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { Principal } from '../common/principal.js';
import { ApiException } from '../common/error-envelope.filter.js';

export interface CreateApiKeyDto {
  name: string;
  kind: ApiKeyKind;
  allowedOrigins?: string[];
}

function generateRandomBase62(length = 32): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function validateOrigin(originStr: string): string {
  let url: URL;
  try {
    url = new URL(originStr);
  } catch {
    throw new ApiException(
      ErrorCode.VALIDATION_FAILED,
      `Invalid origin URL: ${originStr}`,
      HttpStatus.BAD_REQUEST,
      { fields: [{ field: 'allowedOrigins', issue: 'invalid_origin' }] },
    );
  }

  const isHttps = url.protocol === 'https:';
  const isLocalHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (!isHttps && !isLocalHttp) {
    throw new ApiException(
      ErrorCode.VALIDATION_FAILED,
      `Origin must be https:// or http://localhost: ${originStr}`,
      HttpStatus.BAD_REQUEST,
      { fields: [{ field: 'allowedOrigins', issue: 'invalid_protocol' }] },
    );
  }

  if (url.pathname !== '/' && url.pathname !== '') {
    throw new ApiException(
      ErrorCode.VALIDATION_FAILED,
      `Origin must not contain a path: ${originStr}`,
      HttpStatus.BAD_REQUEST,
      { fields: [{ field: 'allowedOrigins', issue: 'path_not_allowed' }] },
    );
  }

  if (originStr.endsWith('/') && !originStr.endsWith('://')) {
    throw new ApiException(
      ErrorCode.VALIDATION_FAILED,
      `Origin must not end with a trailing slash: ${originStr}`,
      HttpStatus.BAD_REQUEST,
      { fields: [{ field: 'allowedOrigins', issue: 'trailing_slash' }] },
    );
  }

  if (url.search || url.hash) {
    throw new ApiException(
      ErrorCode.VALIDATION_FAILED,
      `Origin must not contain query parameters or fragments: ${originStr}`,
      HttpStatus.BAD_REQUEST,
      { fields: [{ field: 'allowedOrigins', issue: 'query_not_allowed' }] },
    );
  }

  return url.origin;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async listApiKeys(wid: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { workspaceId: wid },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        kind: true,
        keyPrefix: true,
        allowedOrigins: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return { data: keys };
  }

  async createApiKey(principal: Principal, wid: string, dto: CreateApiKeyDto) {
    const count = await this.prisma.apiKey.count({
      where: { workspaceId: wid },
    });

    if (count >= Limits.API_KEYS_PER_WORKSPACE) {
      throw new ApiException(
        ErrorCode.API_KEY_LIMIT,
        'Workspace API key limit reached',
        HttpStatus.CONFLICT,
      );
    }

    let cleanedOrigins: string[] = [];
    if (dto.kind === ApiKeyKind.WIDGET) {
      if (!dto.allowedOrigins || !Array.isArray(dto.allowedOrigins) || dto.allowedOrigins.length === 0) {
        throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          'Widget key requires 1 to 5 allowedOrigins',
          HttpStatus.BAD_REQUEST,
          { fields: [{ field: 'allowedOrigins', issue: 'required' }] },
        );
      }

      if (dto.allowedOrigins.length > 5) {
        throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          'Widget key cannot have more than 5 allowedOrigins',
          HttpStatus.BAD_REQUEST,
          { fields: [{ field: 'allowedOrigins', issue: 'max_5' }] },
        );
      }

      cleanedOrigins = dto.allowedOrigins.map((orig) => validateOrigin(orig));
    } else {
      if (dto.allowedOrigins && dto.allowedOrigins.length > 0) {
        cleanedOrigins = dto.allowedOrigins.map((orig) => validateOrigin(orig));
      }
    }

    const randomSecret = generateRandomBase62(32);
    const prefix = dto.kind === ApiKeyKind.SERVER ? 'xsrag_sk_' : 'xsrag_pk_';
    const secret = prefix + randomSecret;
    const keyPrefix = secret.slice(0, 12);
    const keyHash = crypto.createHash('sha256').update(secret).digest('hex');

    const apiKey = await this.prisma.apiKey.create({
      data: {
        workspaceId: wid,
        name: dto.name.trim(),
        kind: dto.kind,
        keyPrefix,
        keyHash,
        allowedOrigins: cleanedOrigins,
        createdById: principal.userId!,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        keyPrefix: true,
        allowedOrigins: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return {
      ...apiKey,
      secret,
    };
  }

  async deleteApiKey(wid: string, keyId: string): Promise<void> {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!key || key.workspaceId !== wid) {
      throw new ApiException(
        ErrorCode.API_KEY_NOT_FOUND,
        'API key not found',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.apiKey.delete({
      where: { id: keyId },
    });
  }
}
