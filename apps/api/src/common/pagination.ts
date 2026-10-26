import { Limits } from '@xs-rag/shared';

export interface PaginationQuery {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
}

export function parsePagination(query: { limit?: string | number; cursor?: string }): {
  limit: number;
  cursor?: string;
} {
  let limit = typeof query.limit === 'number' ? query.limit : parseInt(query.limit ?? '', 10);
  if (isNaN(limit) || limit < 1) {
    limit = Limits.DEFAULT_PAGINATION_LIMIT;
  } else if (limit > Limits.MAX_PAGINATION_LIMIT) {
    limit = Limits.MAX_PAGINATION_LIMIT;
  }
  return {
    limit,
    cursor: query.cursor && query.cursor.trim() !== '' ? query.cursor.trim() : undefined,
  };
}

export function encodeCursor(cursorObj: Record<string, unknown> | string): string {
  if (typeof cursorObj === 'string') {
    return Buffer.from(cursorObj).toString('base64url');
  }
  return Buffer.from(JSON.stringify(cursorObj)).toString('base64url');
}

export function decodeCursor<T = Record<string, unknown>>(cursorStr?: string): T | null {
  if (!cursorStr) return null;
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return null;
  }
}
