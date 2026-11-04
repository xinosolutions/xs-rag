import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiKeyKind, WorkspaceRole } from '@xs-rag/shared';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard, Roles } from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ApiKeysService } from './api-keys.service.js';

const createApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  kind: z.nativeEnum(ApiKeyKind),
  allowedOrigins: z.array(z.string().trim()).optional(),
});

@Controller('workspaces/:wid/api-keys')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
@Roles(WorkspaceRole.ADMIN)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  async list(@Param('wid') wid: string) {
    return this.apiKeysService.listApiKeys(wid);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('wid') wid: string,
    @Body(new ZodPipe(createApiKeySchema)) body: z.infer<typeof createApiKeySchema>,
    @Req() req: Request,
  ) {
    return this.apiKeysService.createApiKey(req.principal!, wid, body);
  }

  @Delete(':keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('wid') wid: string,
    @Param('keyId') keyId: string,
  ): Promise<void> {
    await this.apiKeysService.deleteApiKey(wid, keyId);
  }
}
