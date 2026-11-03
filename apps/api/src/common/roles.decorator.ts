import {
  SetMetadata,
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpStatus,
  CustomDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode, PrincipalType, WorkspaceRole } from '@xs-rag/shared';
import { PrismaService } from './prisma.service.js';
import { ApiException } from './error-envelope.filter.js';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (WorkspaceRole | 'ADMIN' | 'MEMBER')[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const principal = request.principal;

    if (!principal || principal.type !== PrincipalType.USER || !principal.userId) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const rawWid = request.params?.wid;
    const wid = Array.isArray(rawWid) ? rawWid[0] : rawWid;
    if (!wid) {
      return true;
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: wid,
          userId: principal.userId,
        },
      },
    });

    if (!membership) {
      throw new ApiException(
        ErrorCode.WORKSPACE_NOT_FOUND,
        'Workspace not found',
        HttpStatus.NOT_FOUND,
      );
    }

    principal.workspaceId = wid;
    principal.role = membership.role as unknown as WorkspaceRole;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(WorkspaceRole | string)[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const principal = request.principal;

    if (!principal || principal.type !== PrincipalType.USER || !principal.userId) {
      throw new ApiException(
        ErrorCode.AUTH_REQUIRED,
        'Authentication required',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const role = principal.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new ApiException(
        ErrorCode.FORBIDDEN,
        'Forbidden',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
