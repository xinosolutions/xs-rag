import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import * as fs from 'node:fs/promises';
import {
  DocumentFailureCode,
  DocumentSourceType,
  DocumentStatus,
} from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { DocumentEventsService } from '../documents/document-events.service.js';
import { getEnv } from '../config/env.js';
import { PdfExtractor } from './extractors/pdf.extractor.js';
import { DocxExtractor } from './extractors/docx.extractor.js';
import { MarkdownExtractor } from './extractors/markdown.extractor.js';
import { WebExtractor, IngestionError } from './extractors/web.extractor.js';
import { Chunker } from './chunker.js';
import { Embedder } from './embedder.js';
import { RecoveryService } from './recovery.service.js';

interface ClaimedDocument {
  id: string;
  workspaceId: string;
  title: string;
  sourceType: DocumentSourceType;
  fileName: string | null;
  sourceUrl: string | null;
  storagePath: string | null;
  attempts: number;
}

@Injectable()
export class IngestionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IngestionWorker.name);
  private running = false;
  private workerPromises: Promise<void>[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: DocumentEventsService,
    private readonly pdfExtractor: PdfExtractor,
    private readonly docxExtractor: DocxExtractor,
    private readonly markdownExtractor: MarkdownExtractor,
    private readonly webExtractor: WebExtractor,
    private readonly embedder: Embedder,
    private readonly recoveryService: RecoveryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.running = true;
    // Run recovery on startup
    await this.recoveryService.runRecovery();

    const env = getEnv();
    const workerCount = env.INGESTION_WORKERS || 1;
    this.logger.log(`Starting ${workerCount} ingestion worker loops`);

    for (let i = 0; i < workerCount; i++) {
      this.workerPromises.push(this.runWorkerLoop(i));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Stopping ingestion worker loops');
    this.running = false;
    await Promise.allSettled(this.workerPromises);
  }

  private async runWorkerLoop(workerId: number): Promise<void> {
    while (this.running) {
      try {
        const worked = await this.claimAndProcess();
        if (!worked && this.running) {
          // Idle polling every 2s (TR 7.4)
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (err: unknown) {
        this.logger.error(`Error in ingestion worker loop ${workerId}:`, err);
        if (this.running) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
  }

  async claimAndProcess(): Promise<boolean> {
    // DOC-T2 Claim with FOR UPDATE SKIP LOCKED
    const claimedRows = await this.prisma.$queryRaw<ClaimedDocument[]>`
      UPDATE "Document"
      SET status = 'PROCESSING',
          attempts = attempts + 1,
          "updatedAt" = NOW()
      WHERE id = (
        SELECT id FROM "Document"
        WHERE status = 'QUEUED'
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, "workspaceId", title, "sourceType", "fileName", "sourceUrl", "storagePath", attempts;
    `;

    if (!claimedRows || claimedRows.length === 0) {
      return false;
    }

    const doc = claimedRows[0]!;
    this.logger.log(`Claimed document ${doc.id} (${doc.title}), attempt ${doc.attempts}`);

    // Emit PROCESSING event
    this.eventsService.emit(doc.workspaceId, {
      documentId: doc.id,
      status: DocumentStatus.PROCESSING,
      failureCode: null,
      failureMessage: null,
    });

    try {
      await this.processDocument(doc);
      return true;
    } catch (err: unknown) {
      await this.handleProcessingFailure(doc, err);
      return true;
    }
  }

  private async processDocument(doc: ClaimedDocument): Promise<void> {
    let extractedDoc: {
      title?: string;
      pageCount?: number;
      sections: Array<{
        page: number | null;
        heading: string | null;
        headingPath?: string | null;
        text: string;
      }>;
    };

    switch (doc.sourceType) {
      case DocumentSourceType.PDF: {
        if (!doc.storagePath) {
          throw new IngestionError(DocumentFailureCode.EXTRACT_FAILED, 'Document storage path is missing.');
        }
        let buffer: Buffer;
        try {
          buffer = await fs.readFile(doc.storagePath);
        } catch {
          throw new IngestionError(DocumentFailureCode.EXTRACT_FAILED, 'Could not read PDF storage file.');
        }
        extractedDoc = await this.pdfExtractor.extract(buffer);
        break;
      }

      case DocumentSourceType.DOCX: {
        if (!doc.storagePath) {
          throw new IngestionError(DocumentFailureCode.EXTRACT_FAILED, 'Document storage path is missing.');
        }
        let buffer: Buffer;
        try {
          buffer = await fs.readFile(doc.storagePath);
        } catch {
          throw new IngestionError(DocumentFailureCode.EXTRACT_FAILED, 'Could not read DOCX storage file.');
        }
        extractedDoc = await this.docxExtractor.extract(buffer);
        break;
      }

      case DocumentSourceType.MARKDOWN: {
        if (!doc.storagePath) {
          throw new IngestionError(DocumentFailureCode.EXTRACT_FAILED, 'Document storage path is missing.');
        }
        let text: string;
        try {
          text = await fs.readFile(doc.storagePath, 'utf-8');
        } catch {
          throw new IngestionError(DocumentFailureCode.EXTRACT_FAILED, 'Could not read Markdown storage file.');
        }
        extractedDoc = this.markdownExtractor.extract(text);
        break;
      }

      case DocumentSourceType.WEB: {
        if (!doc.sourceUrl) {
          throw new IngestionError(DocumentFailureCode.FETCH_FAILED, 'Document source URL is missing.');
        }
        extractedDoc = await this.webExtractor.extract(doc.sourceUrl);
        break;
      }

      default:
        throw new IngestionError(DocumentFailureCode.EXTRACT_FAILED, `Unsupported source type: ${doc.sourceType}`);
    }

    const totalText = extractedDoc.sections.map((s) => s.text).join(' ').trim();
    if (totalText.length === 0) {
      throw new IngestionError(DocumentFailureCode.EMPTY_DOCUMENT, 'Document contains no readable text.');
    }

    // Chunking
    const titleForChunking = extractedDoc.title || doc.title;
    const chunks = Chunker.chunkSections(titleForChunking, extractedDoc.sections);

    if (chunks.length === 0) {
      throw new IngestionError(DocumentFailureCode.EMPTY_DOCUMENT, 'Document contains no usable text chunks.');
    }

    // Embeddings
    const embeddings = await this.embedder.embedChunks(chunks);

    // Atomic completion (DOC-T3 / DOC-T4)
    let completed = false;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.document.updateMany({
        where: {
          id: doc.id,
          status: DocumentStatus.PROCESSING,
        },
        data: {
          status: DocumentStatus.READY,
          chunkCount: chunks.length,
          pageCount: extractedDoc.pageCount ?? null,
          title: extractedDoc.title || doc.title,
          processedAt: new Date(),
          updatedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });

      if (updated.count === 0) {
        // Deleted meanwhile (DOC-T6)
        await tx.chunk.deleteMany({ where: { documentId: doc.id } });
        return;
      }

      completed = true;
      // Clean up previous chunks
      await tx.chunk.deleteMany({ where: { documentId: doc.id } });

      // Insert new chunks
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]!;
        const emb = embeddings[i]!;
        await tx.$executeRawUnsafe(
          `INSERT INTO "Chunk" ("id", "documentId", "workspaceId", "ordinal", "text", "page", "heading", "headingPath", "tokenCount", "embedding")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)`,
          c.id,
          doc.id,
          doc.workspaceId,
          c.ordinal,
          c.text,
          c.page ?? null,
          c.heading ?? null,
          c.headingPath ?? null,
          c.tokenCount,
          `[${emb.join(',')}]`,
        );
      }
    });

    if (completed) {
      this.logger.log(`Document ${doc.id} processed successfully with ${chunks.length} chunks`);
      this.eventsService.emit(doc.workspaceId, {
        documentId: doc.id,
        status: DocumentStatus.READY,
        failureCode: null,
        failureMessage: null,
      });
    }
  }

  private async handleProcessingFailure(doc: ClaimedDocument, err: unknown): Promise<void> {
    this.logger.error(`Document ${doc.id} processing failed:`, err);

    let failureCode: DocumentFailureCode = DocumentFailureCode.EXTRACT_FAILED;
    let failureMessage = 'Failed to extract document contents.';

    if (err instanceof IngestionError) {
      failureCode = err.failureCode;
      failureMessage = err.message;
    } else if (doc.sourceType === DocumentSourceType.WEB) {
      failureCode = DocumentFailureCode.FETCH_FAILED;
      failureMessage = (err as Error)?.message || 'Web page fetch failed.';
    } else {
      const msg = (err as Error)?.message || '';
      if (msg.includes('embed') || msg.includes('Embed')) {
        failureCode = DocumentFailureCode.EMBED_FAILED;
        failureMessage = 'Embedding provider failed after retries.';
      } else {
        failureCode = DocumentFailureCode.EXTRACT_FAILED;
        failureMessage = msg || 'Failed to extract document contents.';
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chunk.deleteMany({ where: { documentId: doc.id } });
      await tx.document.updateMany({
        where: { id: doc.id, status: DocumentStatus.PROCESSING },
        data: {
          status: DocumentStatus.FAILED,
          failureCode,
          failureMessage,
          updatedAt: new Date(),
        },
      });
    });

    this.eventsService.emit(doc.workspaceId, {
      documentId: doc.id,
      status: DocumentStatus.FAILED,
      failureCode,
      failureMessage,
    });
  }
}
