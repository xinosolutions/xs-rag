import { Injectable, Logger } from '@nestjs/common';
import { DocumentFailureCode, DocumentStatus } from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { DocumentEventsService } from '../documents/document-events.service.js';

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: DocumentEventsService,
  ) {}

  async runRecovery(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // 1. Stale PROCESSING documents -> FAILED with TIMEOUT
    const stuckDocs = await this.prisma.document.findMany({
      where: {
        status: DocumentStatus.PROCESSING,
        updatedAt: { lt: fiveMinutesAgo },
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    for (const doc of stuckDocs) {
      this.logger.warn(`Document ${doc.id} timed out in PROCESSING, marking FAILED/TIMEOUT`);
      await this.prisma.$transaction(async (tx) => {
        await tx.chunk.deleteMany({ where: { documentId: doc.id } });
        await tx.document.update({
          where: { id: doc.id },
          data: {
            status: DocumentStatus.FAILED,
            failureCode: DocumentFailureCode.TIMEOUT,
            failureMessage: 'Processing exceeded 5 minutes timeout.',
          },
        });
      });

      this.eventsService.emit(doc.workspaceId, {
        documentId: doc.id,
        status: DocumentStatus.FAILED,
        failureCode: DocumentFailureCode.TIMEOUT,
        failureMessage: 'Processing exceeded 5 minutes timeout.',
      });
    }

    // 2. On boot, any STREAMING message becomes ERROR (CONTRACTS section 6 / 145)
    await this.prisma.message.updateMany({
      where: { status: 'STREAMING' },
      data: { status: 'ERROR' },
    });

    // 3. On boot, any RUNNING eval runs become FAILED
    await this.prisma.evalRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        failureMessage: 'Process restarted mid-run.',
      },
    });
  }
}
