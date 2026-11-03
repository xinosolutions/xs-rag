import { Injectable, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DocumentStatus,
  DocumentVisibility,
  ErrorCode,
  PrincipalType,
  WorkspaceRole,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { Principal } from '../common/principal.js';
import { ApiException } from '../common/error-envelope.filter.js';

@Injectable()
export class DocumentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  permittedSql(principal: Principal): Prisma.Sql {
    const ws = principal.workspaceId ?? '';
    const isAdmin = principal.role === WorkspaceRole.ADMIN;
    const allMembersOnly =
      principal.type === PrincipalType.VISITOR ||
      principal.type === PrincipalType.WIDGET ||
      principal.type === PrincipalType.API_KEY;
    const userId = principal.userId ?? '';

    return Prisma.sql`
      d."workspaceId" = ${ws} AND d."status" = 'READY' AND (
        ${isAdmin}
        OR d."visibility" = 'ALL_MEMBERS'
        OR (NOT ${allMembersOnly} AND d."visibility" = 'SELECTED' AND EXISTS (
              SELECT 1 FROM "DocumentAccess" a WHERE a."documentId" = d."id" AND a."userId" = ${userId}))
      )
    `;
  }

  canAccessDocument(
    principal: Principal,
    doc: {
      workspaceId: string;
      status: DocumentStatus | string;
      visibility: DocumentVisibility | string;
      access?: { userId: string }[];
    },
    isAdminView = false,
  ): boolean {
    if (doc.workspaceId !== principal.workspaceId) {
      return false;
    }

    if (principal.role === WorkspaceRole.ADMIN) {
      return isAdminView ? true : doc.status === DocumentStatus.READY;
    }

    if (doc.status !== DocumentStatus.READY) {
      return false;
    }

    if (doc.visibility === DocumentVisibility.ALL_MEMBERS) {
      return true;
    }

    if (doc.visibility === DocumentVisibility.ADMINS_ONLY) {
      return false;
    }

    if (doc.visibility === DocumentVisibility.SELECTED) {
      if (
        principal.type === PrincipalType.VISITOR ||
        principal.type === PrincipalType.WIDGET ||
        principal.type === PrincipalType.API_KEY
      ) {
        return false;
      }
      return (doc.access || []).some((a) => a.userId === principal.userId);
    }

    return false;
  }

  async validateSelectedMembers(wid: string, memberIds?: string[]): Promise<string[]> {
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'SELECTED visibility requires at least one memberId',
        HttpStatus.BAD_REQUEST,
        { fields: [{ field: 'memberIds', issue: 'required' }] },
      );
    }

    const uniqueIds = Array.from(new Set(memberIds));
    const memberships = await this.prisma.membership.findMany({
      where: {
        workspaceId: wid,
        userId: { in: uniqueIds },
      },
    });

    const foundSet = new Set(memberships.map((m) => m.userId));
    for (const uid of uniqueIds) {
      if (!foundSet.has(uid)) {
        throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          `User ${uid} is not a member of this workspace`,
          HttpStatus.BAD_REQUEST,
          { fields: [{ field: 'memberIds', issue: 'not_a_member' }] },
        );
      }
    }

    return uniqueIds;
  }

  async updateAccess(
    wid: string,
    docId: string,
    visibility: DocumentVisibility,
    memberIds?: string[],
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

    if (visibility === DocumentVisibility.SELECTED) {
      const validatedMemberIds = await this.validateSelectedMembers(wid, memberIds);

      return this.prisma.$transaction(async (tx) => {
        await tx.documentAccess.deleteMany({
          where: { documentId: docId },
        });

        await tx.documentAccess.createMany({
          data: validatedMemberIds.map((userId) => ({
            documentId: docId,
            userId,
          })),
        });

        return tx.document.update({
          where: { id: docId },
          data: { visibility },
          include: { access: true },
        });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.documentAccess.deleteMany({
        where: { documentId: docId },
      });

      return tx.document.update({
        where: { id: docId },
        data: { visibility },
        include: { access: true },
      });
    });
  }
}
