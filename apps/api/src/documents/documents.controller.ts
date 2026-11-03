import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ErrorCode, Limits } from '@xs-rag/shared';
import { PrincipalGuard } from '../common/principal.guard.js';
import { Roles, RolesGuard, WorkspaceMemberGuard } from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { DocumentsService } from './documents.service.js';
import type { UploadedFile as UploadedFilePayload } from './storage.service.js';
import {
  createUrlDocumentSchema,
  listDocumentsQuerySchema,
  updateDocumentAccessSchema,
  uploadDocumentBodySchema,
} from './documents.dto.js';
import type {
  CreateUrlDocumentDto,
  ListDocumentsQueryDto,
  UpdateDocumentAccessDto,
  UploadDocumentBodyDto,
} from './documents.dto.js';

@Controller('workspaces/:wid/documents')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  async listDocuments(
    @Param('wid') wid: string,
    @Req() req: Request,
    @Query(new ZodPipe(listDocumentsQuerySchema)) query: ListDocumentsQueryDto,
  ) {
    return this.documentsService.listDocuments(wid, req.principal!, query);
  }

  @Post()
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: Limits.UPLOAD_MAX_BYTES },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(
    @Param('wid') wid: string,
    @Req() req: Request,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Body(new ZodPipe(uploadDocumentBodySchema)) body: UploadDocumentBodyDto,
  ) {
    if (!file) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'No file part uploaded',
        HttpStatus.BAD_REQUEST,
        { fields: [{ field: 'file', issue: 'required' }] },
      );
    }
    return this.documentsService.uploadDocument(wid, req.principal!, file, body);
  }

  @Post('url')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async createUrlDocument(
    @Param('wid') wid: string,
    @Req() req: Request,
    @Body(new ZodPipe(createUrlDocumentSchema)) body: CreateUrlDocumentDto,
  ) {
    return this.documentsService.createUrlDocument(wid, req.principal!, body);
  }

  @Get(':docId')
  async getDocument(
    @Param('wid') wid: string,
    @Param('docId') docId: string,
    @Req() req: Request,
  ) {
    return this.documentsService.getDocument(wid, docId, req.principal!);
  }

  @Patch(':docId/access')
  @Roles('ADMIN')
  async updateAccess(
    @Param('wid') wid: string,
    @Param('docId') docId: string,
    @Req() req: Request,
    @Body(new ZodPipe(updateDocumentAccessSchema)) body: UpdateDocumentAccessDto,
  ) {
    return this.documentsService.updateDocumentAccess(wid, docId, req.principal!, body);
  }

  @Post(':docId/retry')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async retryDocument(
    @Param('wid') wid: string,
    @Param('docId') docId: string,
    @Req() req: Request,
  ) {
    return this.documentsService.retryDocument(wid, docId, req.principal!);
  }

  @Delete(':docId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @Param('wid') wid: string,
    @Param('docId') docId: string,
  ): Promise<void> {
    return this.documentsService.deleteDocument(wid, docId);
  }

  @Get(':docId/passages')
  @Roles('ADMIN')
  async listPassages(
    @Param('wid') wid: string,
    @Param('docId') docId: string,
    @Query() query: { limit?: string | number; cursor?: string },
  ) {
    return this.documentsService.listPassages(wid, docId, query);
  }
}
