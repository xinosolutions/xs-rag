import { Injectable, HttpStatus } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ErrorCode, Limits, WorkspaceRole } from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { hashToken } from '../common/hash.js';
import { parsePagination, encodeCursor, decodeCursor } from '../common/pagination.js';
import { getModelCatalog } from '../config/ai-models.js';
import { MailService } from '../auth/mail.service.js';
import type {
  CreateWorkspaceDto,
  RenameWorkspaceDto,
  UpdateSettingsDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
} from './workspaces.dto.js';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async createWorkspace(userId: string, dto: CreateWorkspaceDto) {
    const ownedCount = await this.prisma.workspace.count({
      where: { createdById: userId },
    });

    if (ownedCount >= Limits.WORKSPACES_OWNED_PER_USER) {
      throw new ApiException(
        ErrorCode.WORKSPACE_LIMIT,
        'User already owns the maximum number of workspaces',
        HttpStatus.CONFLICT,
      );
    }

    const trimmedName = dto.name.trim();
    let baseSlug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (baseSlug.length < 3) {
      baseSlug = `ws-${baseSlug}`.replace(/^-+|-+$/g, '');
      if (baseSlug.length < 3) {
        baseSlug = 'workspace';
      }
    }

    if (baseSlug.length > 35) {
      baseSlug = baseSlug.substring(0, 35).replace(/-+$/, '');
    }

    let candidateSlug = baseSlug;
    let counter = 1;
    while (await this.prisma.workspace.findUnique({ where: { slug: candidateSlug } })) {
      const suffix = `-${counter++}`;
      const prefix = baseSlug.substring(0, 40 - suffix.length).replace(/-+$/, '');
      candidateSlug = `${prefix}${suffix}`;
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        name: trimmedName,
        slug: candidateSlug,
        modelId: 'claude-sonnet-5-5',
        createdById: userId,
        memberships: {
          create: {
            userId,
            role: WorkspaceRole.ADMIN,
          },
        },
      },
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: WorkspaceRole.ADMIN,
    };
  }

  async listCallerWorkspaces(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role,
      })),
    };
  }

  async getWorkspace(wid: string, role?: WorkspaceRole) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: wid },
    });

    if (!ws) {
      throw new ApiException(
        ErrorCode.WORKSPACE_NOT_FOUND,
        'Workspace not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const res: Record<string, unknown> = {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      role,
      isDemo: ws.isDemo,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    };

    if (role === WorkspaceRole.ADMIN) {
      res.modelId = ws.modelId;
    }

    return res;
  }

  async renameWorkspace(wid: string, dto: RenameWorkspaceDto, role?: WorkspaceRole) {
    const ws = await this.prisma.workspace.update({
      where: { id: wid },
      data: { name: dto.name.trim() },
    });

    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      role,
      modelId: ws.modelId,
    };
  }

  async getSettings(wid: string) {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: wid },
    });

    if (!ws) {
      throw new ApiException(
        ErrorCode.WORKSPACE_NOT_FOUND,
        'Workspace not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return { modelId: ws.modelId };
  }

  async updateSettings(wid: string, dto: UpdateSettingsDto) {
    const catalog = getModelCatalog();
    if (!catalog.some((m) => m.id === dto.modelId)) {
      throw new ApiException(
        ErrorCode.MODEL_NOT_SUPPORTED,
        'Model not supported',
        HttpStatus.BAD_REQUEST,
      );
    }

    const ws = await this.prisma.workspace.update({
      where: { id: wid },
      data: { modelId: dto.modelId },
    });

    return { modelId: ws.modelId };
  }

  async listMembers(wid: string, query: { limit?: string | number; cursor?: string }) {
    const { limit, cursor } = parsePagination(query);
    const decodedUserId = cursor ? decodeCursor<string>(cursor) : null;

    const members = await this.prisma.membership.findMany({
      where: { workspaceId: wid },
      include: { user: true },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
      take: limit + 1,
      ...(decodedUserId
        ? {
            cursor: {
              workspaceId_userId: {
                workspaceId: wid,
                userId: typeof decodedUserId === 'string' ? decodedUserId : (decodedUserId as any).userId,
              },
            },
            skip: 1,
          }
        : {}),
    });

    let nextCursor: string | null = null;
    let data = members;

    if (members.length > limit) {
      data = members.slice(0, limit);
      nextCursor = encodeCursor(data[data.length - 1].userId);
    }

    return {
      data: data.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  async updateMemberRole(wid: string, targetUserId: string, dto: UpdateMemberRoleDto) {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: wid, userId: targetUserId } },
      include: { user: true },
    });

    if (!membership) {
      throw new ApiException(
        ErrorCode.MEMBER_NOT_FOUND,
        'Member not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (membership.role === WorkspaceRole.ADMIN && dto.role === WorkspaceRole.MEMBER) {
      const adminCount = await this.prisma.membership.count({
        where: { workspaceId: wid, role: WorkspaceRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new ApiException(
          ErrorCode.LAST_ADMIN,
          'Cannot demote the only admin',
          HttpStatus.CONFLICT,
        );
      }
    }

    const updated = await this.prisma.membership.update({
      where: { workspaceId_userId: { workspaceId: wid, userId: targetUserId } },
      data: { role: dto.role as WorkspaceRole },
      include: { user: true },
    });

    return {
      userId: updated.userId,
      name: updated.user.name,
      email: updated.user.email,
      role: updated.role,
      joinedAt: updated.createdAt.toISOString(),
    };
  }

  async removeMember(wid: string, targetUserId: string): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId: wid, userId: targetUserId } },
    });

    if (!membership) {
      throw new ApiException(
        ErrorCode.MEMBER_NOT_FOUND,
        'Member not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (membership.role === WorkspaceRole.ADMIN) {
      const adminCount = await this.prisma.membership.count({
        where: { workspaceId: wid, role: WorkspaceRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new ApiException(
          ErrorCode.LAST_ADMIN,
          'Cannot remove the only admin',
          HttpStatus.CONFLICT,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.documentAccess.deleteMany({
        where: {
          userId: targetUserId,
          document: { workspaceId: wid },
        },
      }),
      this.prisma.membership.delete({
        where: { workspaceId_userId: { workspaceId: wid, userId: targetUserId } },
      }),
    ]);
  }

  async listInvitations(wid: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        workspaceId: wid,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
      })),
    };
  }

  async createInvitation(wid: string, callerUserId: string, dto: InviteMemberDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const member = await this.prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: wid, userId: existingUser.id } },
      });
      if (member) {
        throw new ApiException(
          ErrorCode.ALREADY_MEMBER,
          'User is already a member of this workspace',
          HttpStatus.CONFLICT,
        );
      }
    }

    const existingInvite = await this.prisma.invitation.findUnique({
      where: { workspaceId_email: { workspaceId: wid, email } },
    });

    if (existingInvite) {
      if (existingInvite.acceptedAt === null && existingInvite.expiresAt.getTime() > Date.now()) {
        throw new ApiException(
          ErrorCode.INVITE_EXISTS,
          'An active invitation already exists for this email',
          HttpStatus.CONFLICT,
        );
      } else {
        await this.prisma.invitation.delete({ where: { id: existingInvite.id } });
      }
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + Limits.INVITATION_LIFETIME_MS);

    const invite = await this.prisma.invitation.create({
      data: {
        workspaceId: wid,
        email,
        role: dto.role as WorkspaceRole,
        tokenHash,
        expiresAt,
        createdById: callerUserId,
      },
      include: { workspace: true },
    });

    await this.mailService.sendInvitationMail(email, rawToken, invite.workspace.name);

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async cancelInvitation(wid: string, invitationId: string): Promise<void> {
    const invite = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invite || invite.workspaceId !== wid) {
      throw new ApiException(
        ErrorCode.INVITE_NOT_FOUND,
        'Invitation not found',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.invitation.delete({ where: { id: invitationId } });
  }

  async previewInvitation(token: string) {
    const tokenHash = hashToken(token.trim());
    const invite = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: { workspace: true },
    });

    if (!invite || invite.acceptedAt !== null) {
      throw new ApiException(
        ErrorCode.INVITE_NOT_FOUND,
        'Invitation not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      workspaceName: invite.workspace.name,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(token: string, userId: string) {
    const tokenHash = hashToken(token.trim());
    const invite = await this.prisma.invitation.findUnique({
      where: { tokenHash },
    });

    if (!invite || invite.acceptedAt !== null) {
      throw new ApiException(
        ErrorCode.INVITE_NOT_FOUND,
        'Invitation not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ApiException(
        ErrorCode.INVITE_EMAIL_MISMATCH,
        'Signed-in email differs from the invited email',
        HttpStatus.FORBIDDEN,
      );
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new ApiException(
        ErrorCode.INVITE_EXPIRED,
        'Invitation has expired',
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.$transaction([
      this.prisma.membership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId: user.id,
          },
        },
        create: {
          workspaceId: invite.workspaceId,
          userId: user.id,
          role: invite.role,
        },
        update: {
          role: invite.role,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return { workspaceId: invite.workspaceId };
  }
}
