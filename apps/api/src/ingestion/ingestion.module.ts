import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { FakeLlmProvider } from '../rag/llm/fake.provider.js';
import { PdfExtractor } from './extractors/pdf.extractor.js';
import { DocxExtractor } from './extractors/docx.extractor.js';
import { MarkdownExtractor } from './extractors/markdown.extractor.js';
import { WebExtractor } from './extractors/web.extractor.js';
import { Embedder } from './embedder.js';
import { RecoveryService } from './recovery.service.js';
import { IngestionWorker } from './ingestion.worker.js';

@Module({
  imports: [DocumentsModule],
  providers: [
    PrismaService,
    FakeLlmProvider,
    PdfExtractor,
    DocxExtractor,
    MarkdownExtractor,
    WebExtractor,
    Embedder,
    RecoveryService,
    IngestionWorker,
  ],
  exports: [
    RecoveryService,
    IngestionWorker,
    PdfExtractor,
    DocxExtractor,
    MarkdownExtractor,
    WebExtractor,
    Embedder,
  ],
})
export class IngestionModule {}
