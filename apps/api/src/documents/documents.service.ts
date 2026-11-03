import { Injectable, HttpStatus } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Document, Prisma } from '@prisma/client';
import {
  DocumentSourceType,
  DocumentStatus,
  DocumentVisibility,
  ErrorCode,
  Limits,
  WorkspaceRole,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { Principal } from '../common/principal.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { parsePagination, encodeCursor, decodeCursor } from '../common/pagination.js';
import { StorageService, UploadedFile } from './storage.service.js';
import { DocumentAccessService } from './document-access.service.js';
import { DocumentEventsService } from './document-events.service.js';
import { UrlGuard } from './url-guard.js';
import {
  CreateUrlDocumentDto,
  ListDocumentsQueryDto,
  UpdateDocumentAccessDto,
  UploadDocumentBodyDto,
} from './documents.dto.js';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly accessService: DocumentAccessService,
    private readonly eventsService: DocumentEventsService,
  ) {}

  formatDocument(
    doc: Document & { access?: { userId: string }[] },
    principal: Principal,
  ) {
    const isAdmin = principal.role === WorkspaceRole.ADMIN;
    return {
      id: doc.id,
      title: doc.title,
      sourceType: doc.sourceType,
      fileName: doc.fileName,
      sourceUrl: doc.sourceUrl,
      sizeBytes: doc.sizeBytes,
      status: doc.status,
      failureCode: doc.failureCode,
      failureMessage: doc.failureMessage,
      attempts: doc.attempts,
      pageCount: doc.pageCount,
      chunkCount: doc.chunkCount,
      visibility: doc.visibility,
      ...(isAdmin ? { memberIds: (doc.access || []).map((a) => a.userId) } : {}),
      createdAt: doc.createdAt.toISOString(),
      processedAt: doc.processedAt ? doc.processedAt.toISOString() : null,
    };
  }

  async uploadDocument(
    wid: string,
    principal: Principal,
    file: UploadedFile | undefined,
    dto: UploadDocumentBodyDto,
  ) {
    const verified = await this.storageService.verifyFile(file);

    const docCount = await this.prisma.document.count({
      where: { workspaceId: wid },
    });
    if (docCount >= Limits.DOCUMENTS_PER_WORKSPACE) {
      throw new ApiException(
        ErrorCode.DOC_LIMIT,
        `Workspace document limit of ${Limits.DOCUMENTS_PER_WORKSPACE} reached`,
        HttpStatus.CONFLICT,
      );
    }

    const contentHash = createHash('sha256').update(verified.buffer).digest('hex');

    const existing = await this.prisma.document.findUnique({
      where: {
        workspaceId_contentHash: {
          workspaceId: wid,
          contentHash,
        },
      },
    });

    if (existing) {
      throw new ApiException(
        ErrorCode.DOC_DUPLICATE,
        'A document with identical content already exists in this workspace',
        HttpStatus.CONFLICT,
      );
    }

    let validatedMemberIds: string[] = [];
    const visibility = dto.visibility ?? DocumentVisibility.ALL_MEMBERS;
    if (visibility === DocumentVisibility.SELECTED) {
      validatedMemberIds = await this.accessService.validateSelectedMembers(
        wid,
        dto.memberIds,
      );
    }

    const storagePath = await this.storageService.saveFile(
      verified.buffer,
      verified.extension,
    );

    try {
      const doc = await this.prisma.document.create({
        data: {
          workspaceId: wid,
          title: verified.originalFileName,
          sourceType: verified.sourceType,
          fileName: verified.originalFileName,
          storagePath,
          mimeType: verified.mimeType,
          sizeBytes: verified.sizeBytes,
          contentHash,
          status: DocumentStatus.QUEUED,
          attempts: 0,
          chunkCount: 0,
          visibility,
          uploadedById: principal.userId!,
          ...(visibility === DocumentVisibility.SELECTED && validatedMemberIds.length > 0
            ? {
                access: {
                  createMany: {
                    data: validatedMemberIds.map((userId) => ({ userId })),
                  },
                },
              }
            : {}),
        },
        include: { access: true },
      });

      this.eventsService.emit(wid, {
        documentId: doc.id,
        status: DocumentStatus.QUEUED,
        failureCode: null,
        failureMessage: null,
      });

      return this.formatDocument(doc, principal);
    } catch (err: unknown) {
      await this.storageService.deleteFile(storagePath);
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ApiException(
          ErrorCode.DOC_DUPLICATE,
          'A document with identical content already exists in this workspace',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  async createUrlDocument(
    wid: string,
    principal: Principal,
    dto: CreateUrlDocumentDto,
  ) {
    await UrlGuard.validateUrl(dto.url);
    const normalizedUrl = UrlGuard.normalizeUrl(dto.url);

    const docCount = await this.prisma.document.count({
      where: { workspaceId: wid },
    });
    if (docCount >= Limits.DOCUMENTS_PER_WORKSPACE) {
      throw new ApiException(
        ErrorCode.DOC_LIMIT,
        `Workspace document limit of ${Limits.DOCUMENTS_PER_WORKSPACE} reached`,
        HttpStatus.CONFLICT,
      );
    }

    const contentHash = createHash('sha256').update(normalizedUrl).digest('hex');

    const existing = await this.prisma.document.findUnique({
      where: {
        workspaceId_contentHash: {
          workspaceId: wid,
          contentHash,
        },
      },
    });

    if (existing) {
      throw new ApiException(
        ErrorCode.DOC_DUPLICATE,
        'A document with identical content already exists in this workspace',
        HttpStatus.CONFLICT,
      );
    }

    let validatedMemberIds: string[] = [];
    const visibility = dto.visibility ?? DocumentVisibility.ALL_MEMBERS;
    if (visibility === DocumentVisibility.SELECTED) {
      validatedMemberIds = await this.accessService.validateSelectedMembers(
        wid,
        dto.memberIds,
      );
    }

    const title = dto.title?.trim() || normalizedUrl;

    try {
      const doc = await this.prisma.document.create({
        data: {
          workspaceId: wid,
          title,
          sourceType: DocumentSourceType.WEB,
          sourceUrl: normalizedUrl,
          contentHash,
          status: DocumentStatus.QUEUED,
          attempts: 0,
          chunkCount: 0,
          visibility,
          uploadedById: principal.userId!,
          ...(visibility === DocumentVisibility.SELECTED && validatedMemberIds.length > 0
            ? {
                access: {
                  createMany: {
                    data: validatedMemberIds.map((userId) => ({ userId })),
                  },
                },
              }
            : {}),
        },
        include: { access: true },
      });

      this.eventsService.emit(wid, {
        documentId: doc.id,
        status: DocumentStatus.QUEUED,
        failureCode: null,
        failureMessage: null,
      });

      return this.formatDocument(doc, principal);
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ApiException(
          ErrorCode.DOC_DUPLICATE,
          'A document with identical content already exists in this workspace',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  async listDocuments(
    wid: string,
    principal: Principal,
    query: ListDocumentsQueryDto,
  ) {
    const { limit, cursor } = parsePagination(query);
    const isAdmin = principal.role === WorkspaceRole.ADMIN;

    const where: Prisma.DocumentWhereInput = {
      workspaceId: wid,
    };

    if (isAdmin) {
      if (query.status) {
        where.status = query.status;
      }
    } else {
      where.status = DocumentStatus.READY;
      where.OR = [
        { visibility: DocumentVisibility.ALL_MEMBERS },
        {
          visibility: DocumentVisibility.SELECTED,
          access: { some: { userId: principal.userId } },
        },
      ];
    }

    const decodedCursor = cursor ? decodeCursor<string>(cursor) : null;

    const docs = await this.prisma.document.findMany({
      where,
      include: { access: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(decodedCursor
        ? {
            cursor: { id: decodedCursor },
            skip: 1,
          }
        : {}),
    });

    let nextCursor: string | null = null;
    let data = docs;
    if (docs.length > limit) {
      data = docs.slice(0, limit);
      nextCursor = encodeCursor(data[data.length - 1].id);
    }

    return {
      data: data.map((d) => this.formatDocument(d, principal)),
      nextCursor,
    };
  }

  async getDocument(wid: string, docId: string, principal: Principal) {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      include: { access: true },
    });

    if (!doc || doc.workspaceId !== wid) {
      throw new ApiException(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const canAccess = this.accessService.canAccessDocument(
      principal,
      doc,
      principal.role === WorkspaceRole.ADMIN,
    );

    if (!canAccess) {
      throw new ApiException(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.formatDocument(doc, principal);
  }

  async updateDocumentAccess(
    wid: string,
    docId: string,
    principal: Principal,
    dto: UpdateDocumentAccessDto,
  ) {
    const updated = await this.accessService.updateAccess(
      wid,
      docId,
      dto.visibility,
      dto.memberIds,
    );

    return this.formatDocument(updated, principal);
  }

  async retryDocument(wid: string, docId: string, principal: Principal) {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
      include: { access: true },
    });

    if (!doc || doc.workspaceId !== wid) {
      throw new ApiException(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (doc.status !== DocumentStatus.FAILED) {
      throw new ApiException(
        ErrorCode.DOC_INVALID_TRANSITION,
        'Only failed documents can be retried.',
        HttpStatus.CONFLICT,
        { status: doc.status },
      );
    }

    const updated = await this.prisma.document.update({
      where: { id: docId },
      data: {
        status: DocumentStatus.QUEUED,
        attempts: { increment: 1 },
        failureCode: null,
        failureMessage: null,
      },
      include: { access: true },
    });

    this.eventsService.emit(wid, {
      documentId: updated.id,
      status: DocumentStatus.QUEUED,
      failureCode: null,
      failureMessage: null,
    });

    return this.formatDocument(updated, principal);
  }

  async deleteDocument(wid: string, docId: string): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
    });

    if (!doc || doc.workspaceId !== wid) {
      throw new ApiException(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.messageCitation.updateMany({
      where: { documentId: docId },
      data: {
        chunkId: null,
        documentId: null,
      },
    });

    await this.prisma.document.delete({
      where: { id: docId },
    });

    if (doc.storagePath) {
      await this.storageService.deleteFile(doc.storagePath);
    }
  }

  async listPassages(
    wid: string,
    docId: string,
    query: { limit?: string | number; cursor?: string },
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: docId },
    });

    if (!doc || doc.workspaceId !== wid) {
      throw new ApiException(
        ErrorCode.DOCUMENT_NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const { limit, cursor } = parsePagination(query);
    const decodedCursor = cursor
      ? decodeCursor<{ ordinal: number; id: string } | string>(cursor)
      : null;
    const cursorId =
      typeof decodedCursor === 'string'
        ? decodedCursor
        : decodedCursor?.id ?? undefined;

    const chunks = await this.prisma.chunk.findMany({
      where: { documentId: docId },
      select: {
        id: true,
        ordinal: true,
        page: true,
        heading: true,
        text: true,
      },
      orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
    });

    let nextCursor: string | null = null;
    let data = chunks;
    if (chunks.length > limit) {
      data = chunks.slice(0, limit);
      nextCursor = encodeCursor({
        ordinal: data[data.length - 1].ordinal,
        id: data[data.length - 1].id,
      });
    }

    return {
      data,
      nextCursor,
    };
  }
}
