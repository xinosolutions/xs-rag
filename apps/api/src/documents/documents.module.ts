import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../common/prisma.service.js';
import { PrincipalGuard } from '../common/principal.guard.js';
import { WorkspaceMemberGuard, RolesGuard } from '../common/roles.decorator.js';
import { DocumentEventsController } from './document-events.controller.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DocumentAccessService } from './document-access.service.js';
import { DocumentEventsService } from './document-events.service.js';
import { StorageService } from './storage.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    DocumentEventsController,
    DocumentsController,
  ],
  providers: [
    DocumentsService,
    DocumentAccessService,
    DocumentEventsService,
    StorageService,
    PrismaService,
    WorkspaceMemberGuard,
    RolesGuard,
    PrincipalGuard,
  ],
  exports: [
    DocumentsService,
    DocumentAccessService,
    DocumentEventsService,
    StorageService,
  ],
})
export class DocumentsModule {}
