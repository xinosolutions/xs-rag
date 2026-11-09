import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  DocumentFailureCode,
  DocumentSourceType,
  DocumentStatus,
} from '@xs-rag/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma.service.js';
import { StorageService } from '../src/documents/storage.service.js';
import { IngestionWorker } from '../src/ingestion/ingestion.worker.js';
import { RecoveryService } from '../src/ingestion/recovery.service.js';
import { Embedder } from '../src/ingestion/embedder.js';
import { Chunker } from '../src/ingestion/chunker.js';
import { UrlGuard } from '../src/documents/url-guard.js';
import { truncateAllTables } from './helpers/db.js';
import {
  createValidDocxBuffer,
  createValidTwoPagePdfBuffer,
  createTruncatedPdfBuffer,
} from './helpers/fixtures.js';

describe('Phase 5: Ingestion Pipeline (T-32..T-37)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageService: StorageService;
  let worker: IngestionWorker;
  let recoveryService: RecoveryService;
  let embedder: Embedder;

  let testServer: http.Server;
  let testServerPort: number;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    }

    testServer = http.createServer((req, res) => {
      if (req.url === '/page') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!DOCTYPE html><html><head><title>Web Policy Title</title></head><body>' +
            '<h1>Web Policy Main Heading</h1>' +
            '<p>This is the main readable content paragraph of the web page for testing.</p>' +
            '<h2>Sub Heading</h2>' +
            '<p>This is the secondary content paragraph under the sub heading.</p>' +
            '</body></html>',
        );
      } else if (req.url === '/404') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>Not Found</h1>');
      } else if (req.url === '/text') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Plain text content not html');
      } else if (req.url === '/large') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const largeBody = '<html><body>' + 'a'.repeat(6 * 1024 * 1024) + '</body></html>';
        res.end(largeBody);
      } else {
        res.writeHead(400);
        res.end('Bad Request');
      }
    });

    await new Promise<void>((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address() as any;
        testServerPort = addr.port;
        resolve();
      });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    storageService = app.get(StorageService);
    worker = app.get(IngestionWorker);
    recoveryService = app.get(RecoveryService);
    embedder = app.get(Embedder);
  });

  afterAll(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  async function createTestWorkspace(name = 'Ingestion WS'): Promise<{ id: string; userId: string }> {
    const user = await prisma.user.create({
      data: {
        email: `admin-${randomUUID()}@example.com`,
        name: 'Admin User',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy',
      },
    });

    const ws = await prisma.workspace.create({
      data: {
        name,
        slug: `ws-${randomUUID().slice(0, 8)}`,
        createdById: user.id,
      },
    });

    await prisma.membership.create({
      data: {
        workspaceId: ws.id,
        userId: user.id,
        role: 'ADMIN',
      },
    });

    return { id: ws.id, userId: user.id };
  }

  async function waitForDocument(docId: string, timeoutMs = 8000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const doc = await prisma.document.findUnique({
        where: { id: docId },
        include: { chunks: { orderBy: { ordinal: 'asc' } } },
      });
      if (doc && (doc.status === DocumentStatus.READY || doc.status === DocumentStatus.FAILED)) {
        return doc;
      }
      await worker.claimAndProcess();
      await new Promise((r) => setTimeout(r, 60));
    }
    return await prisma.document.findUniqueOrThrow({
      where: { id: docId },
      include: { chunks: { orderBy: { ordinal: 'asc' } } },
    });
  }

  it('T-32 AC-32: one fixture per type through the worker: PDF, DOCX, MD, and a local HTTP test server page → all READY, chunkCount>0, every chunk has non-empty text and an embedding of length 1536', async () => {
    const ws = await createTestWorkspace('WS 32');

    // 1. PDF document
    const pdfBuf = createValidTwoPagePdfBuffer();
    const pdfPath = await storageService.saveFile(pdfBuf, '.pdf');
    const pdfDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Sample PDF',
        sourceType: DocumentSourceType.PDF,
        fileName: 'sample.pdf',
        storagePath: pdfPath,
        contentHash: 'hash-pdf-32',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    // 2. DOCX document
    const docxBuf = createValidDocxBuffer();
    const docxPath = await storageService.saveFile(docxBuf, '.docx');
    const docxDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Sample DOCX',
        sourceType: DocumentSourceType.DOCX,
        fileName: 'sample.docx',
        storagePath: docxPath,
        contentHash: 'hash-docx-32',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    // 3. Markdown document
    const mdContent = '# MD Main Title\n\n## Section One\nThis is paragraph one in markdown.\n\n## Section Two\nThis is paragraph two in markdown.';
    const mdPath = await storageService.saveFile(Buffer.from(mdContent, 'utf-8'), '.md');
    const mdDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Sample MD',
        sourceType: DocumentSourceType.MARKDOWN,
        fileName: 'sample.md',
        storagePath: mdPath,
        contentHash: 'hash-md-32',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    // 4. Web page document
    const webUrl = `http://127.0.0.1:${testServerPort}/page`;
    const webDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Web Document',
        sourceType: DocumentSourceType.WEB,
        sourceUrl: webUrl,
        contentHash: 'hash-web-32',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    // Temporarily allow local test server URL in UrlGuard
    const origValidate = UrlGuard.validateUrl;
    UrlGuard.validateUrl = async (urlStr: string) => {
      if (urlStr.startsWith(`http://127.0.0.1:${testServerPort}`)) {
        return new URL(urlStr);
      }
      return origValidate.call(UrlGuard, urlStr);
    };

    let docs: any[];
    try {
      const d1 = await waitForDocument(pdfDoc.id);
      const d2 = await waitForDocument(docxDoc.id);
      const d3 = await waitForDocument(mdDoc.id);
      const d4 = await waitForDocument(webDoc.id);
      docs = [d1, d2, d3, d4];
    } finally {
      UrlGuard.validateUrl = origValidate;
    }

    expect(docs.length).toBe(4);
    for (const d of docs) {
      expect(d.status).toBe(DocumentStatus.READY);
      expect(d.chunkCount).toBeGreaterThan(0);
      expect(d.chunks.length).toBe(d.chunkCount);

      for (const chunk of d.chunks) {
        expect(chunk.text.trim().length).toBeGreaterThan(0);

        const vectorResult = await prisma.$queryRaw<Array<{ dim: number; vec: string }>>`
          SELECT vector_dims(embedding) as dim, embedding::text as vec FROM "Chunk" WHERE id = ${chunk.id}
        `;
        expect(vectorResult[0]?.dim).toBe(1536);
      }
    }
  });

  it('T-33 AC-33: PDF fixture (2 pages, heading lines): chunk pages are 1 and 2, headings match; MD fixture: page null, heading = nearest ##; no chunk text contains text from two sections', async () => {
    const ws = await createTestWorkspace('WS 33');

    // PDF with 2 pages and distinct headings
    const pdfBuf = createValidTwoPagePdfBuffer();
    const pdfPath = await storageService.saveFile(pdfBuf, '.pdf');
    const pdfDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Two Page PDF',
        sourceType: DocumentSourceType.PDF,
        fileName: 'twopage.pdf',
        storagePath: pdfPath,
        contentHash: 'hash-pdf-33',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    // MD with two distinct sections
    const mdContent = `# Document Title\n\n## First Policy Section\nUnique text for section one only.\n\n## Second Policy Section\nUnique text for section two only.`;
    const mdPath = await storageService.saveFile(Buffer.from(mdContent, 'utf-8'), '.md');
    const mdDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Two Section MD',
        sourceType: DocumentSourceType.MARKDOWN,
        fileName: 'twosection.md',
        storagePath: mdPath,
        contentHash: 'hash-md-33',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    const pdfUpdated = await waitForDocument(pdfDoc.id);
    const mdUpdated = await waitForDocument(mdDoc.id);

    // Verify PDF chunks
    expect(pdfUpdated.status).toBe(DocumentStatus.READY);
    const pdfChunks = pdfUpdated.chunks;
    const pages = pdfChunks.map((c: any) => c.page);
    expect(pages).toContain(1);
    expect(pages).toContain(2);

    const chunkPage1 = pdfChunks.find((c: any) => c.page === 1);
    expect(chunkPage1?.heading).toBe('Page One Policy');

    const chunkPage2 = pdfChunks.find((c: any) => c.page === 2);
    expect(chunkPage2?.heading).toBe('Page Two Guidelines');

    // Verify MD chunks
    expect(mdUpdated.status).toBe(DocumentStatus.READY);
    const mdChunks = mdUpdated.chunks;

    for (const c of mdChunks) {
      expect(c.page).toBeNull();
    }

    const chunkSec1 = mdChunks.find((c: any) => c.heading === 'First Policy Section');
    expect(chunkSec1).toBeDefined();
    expect(chunkSec1?.text).toContain('Unique text for section one only');
    expect(chunkSec1?.text).not.toContain('Unique text for section two only');

    const chunkSec2 = mdChunks.find((c: any) => c.heading === 'Second Policy Section');
    expect(chunkSec2).toBeDefined();
    expect(chunkSec2?.text).toContain('Unique text for section two only');
    expect(chunkSec2?.text).not.toContain('Unique text for section one only');
  });

  it('T-34 AC-34: fixed 4,000-char text: every chunk ≤ 1400, ≥ 40, consecutive chunks in one section overlap by up to 150 chars, no chunk crosses a heading', () => {
    const paragraphA = 'Alpha paragraph text content. '.repeat(40);
    const paragraphB = 'Beta paragraph text content. '.repeat(35);
    const paragraphC = 'Gamma paragraph text content. '.repeat(30);
    const paragraphD = 'Delta paragraph text content. '.repeat(35);

    const sections = [
      {
        page: null,
        heading: 'Heading Alpha',
        headingPath: 'Heading Alpha',
        text: `${paragraphA}\n\n${paragraphB}`,
      },
      {
        page: null,
        heading: 'Heading Beta',
        headingPath: 'Heading Beta',
        text: `${paragraphC}\n\n${paragraphD}`,
      },
    ];

    const totalChars = sections.reduce((sum, s) => sum + s.text.length, 0);
    expect(totalChars).toBeGreaterThanOrEqual(4000);

    const chunks = Chunker.chunkSections('Test 4000 Doc', sections);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1400);
      expect(chunk.text.length).toBeGreaterThanOrEqual(40);
    }

    for (let i = 0; i < chunks.length - 1; i++) {
      const cur = chunks[i]!;
      const next = chunks[i + 1]!;

      if (cur.heading === next.heading) {
        let overlapFound = false;
        for (let len = 150; len >= 10; len--) {
          const sliceCur = cur.text.slice(-len);
          if (next.text.startsWith(sliceCur)) {
            expect(len).toBeLessThanOrEqual(150);
            overlapFound = true;
            break;
          }
        }
        expect(overlapFound).toBe(true);
      }
    }

    const alphaChunks = chunks.filter((c) => c.heading === 'Heading Alpha');
    for (const c of alphaChunks) {
      expect(c.text).not.toContain('Gamma');
      expect(c.text).not.toContain('Delta');
    }

    const betaChunks = chunks.filter((c) => c.heading === 'Heading Beta');
    for (const c of betaChunks) {
      expect(c.text).not.toContain('Alpha');
      expect(c.text).not.toContain('Beta');
    }
  });

  it('T-35 AC-35: truncated PDF → EXTRACT_FAILED; empty .md → EMPTY_DOCUMENT; web server returning 404, text/plain, and 6 MB page → FETCH_FAILED; embedder stub throwing → EMBED_FAILED; each has 0 chunks and a failureMessage', async () => {
    const ws = await createTestWorkspace('WS 35');

    // 1. Truncated PDF
    const truncBuf = createTruncatedPdfBuffer();
    const truncPath = await storageService.saveFile(truncBuf, '.pdf');
    const docTrunc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Truncated PDF',
        sourceType: DocumentSourceType.PDF,
        fileName: 'trunc.pdf',
        storagePath: truncPath,
        contentHash: 'hash-trunc-35',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    const resTrunc = await waitForDocument(docTrunc.id);
    expect(resTrunc.status).toBe(DocumentStatus.FAILED);
    expect(resTrunc.failureCode).toBe(DocumentFailureCode.EXTRACT_FAILED);
    expect(resTrunc.failureMessage).toBeDefined();
    expect(resTrunc.failureMessage.length).toBeGreaterThan(0);
    expect(resTrunc.chunks.length).toBe(0);

    // 2. Empty .md
    const emptyPath = await storageService.saveFile(Buffer.from('', 'utf-8'), '.md');
    const docEmpty = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Empty MD',
        sourceType: DocumentSourceType.MARKDOWN,
        fileName: 'empty.md',
        storagePath: emptyPath,
        contentHash: 'hash-empty-35',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    const resEmpty = await waitForDocument(docEmpty.id);
    expect(resEmpty.status).toBe(DocumentStatus.FAILED);
    expect(resEmpty.failureCode).toBe(DocumentFailureCode.EMPTY_DOCUMENT);
    expect(resEmpty.failureMessage).toBeDefined();
    expect(resEmpty.chunks.length).toBe(0);

    // Web server test setup
    const origValidate = UrlGuard.validateUrl;
    UrlGuard.validateUrl = async (urlStr: string) => {
      if (urlStr.startsWith(`http://127.0.0.1:${testServerPort}`)) {
        return new URL(urlStr);
      }
      return origValidate.call(UrlGuard, urlStr);
    };

    try {
      // 3. Web server returning 404
      const doc404 = await prisma.document.create({
        data: {
          workspaceId: ws.id,
          title: 'Web 404',
          sourceType: DocumentSourceType.WEB,
          sourceUrl: `http://127.0.0.1:${testServerPort}/404`,
          contentHash: 'hash-404-35',
          status: DocumentStatus.QUEUED,
          uploadedById: ws.userId,
        },
      });
      const res404 = await waitForDocument(doc404.id);
      expect(res404.status).toBe(DocumentStatus.FAILED);
      expect(res404.failureCode).toBe(DocumentFailureCode.FETCH_FAILED);
      expect(res404.chunks.length).toBe(0);
      expect(res404.failureMessage).toBeDefined();

      // 4. Web server returning text/plain
      const docText = await prisma.document.create({
        data: {
          workspaceId: ws.id,
          title: 'Web Text Plain',
          sourceType: DocumentSourceType.WEB,
          sourceUrl: `http://127.0.0.1:${testServerPort}/text`,
          contentHash: 'hash-text-35',
          status: DocumentStatus.QUEUED,
          uploadedById: ws.userId,
        },
      });
      const resText = await waitForDocument(docText.id);
      expect(resText.status).toBe(DocumentStatus.FAILED);
      expect(resText.failureCode).toBe(DocumentFailureCode.FETCH_FAILED);
      expect(resText.chunks.length).toBe(0);
      expect(resText.failureMessage).toBeDefined();

      // 5. Web server returning 6 MB page
      const docLarge = await prisma.document.create({
        data: {
          workspaceId: ws.id,
          title: 'Web 6MB',
          sourceType: DocumentSourceType.WEB,
          sourceUrl: `http://127.0.0.1:${testServerPort}/large`,
          contentHash: 'hash-large-35',
          status: DocumentStatus.QUEUED,
          uploadedById: ws.userId,
        },
      });
      const resLarge = await waitForDocument(docLarge.id);
      expect(resLarge.status).toBe(DocumentStatus.FAILED);
      expect(resLarge.failureCode).toBe(DocumentFailureCode.FETCH_FAILED);
      expect(resLarge.chunks.length).toBe(0);
      expect(resLarge.failureMessage).toBeDefined();
    } finally {
      UrlGuard.validateUrl = origValidate;
    }

    // 6. Embedder stub throwing -> EMBED_FAILED
    const validMdPath = await storageService.saveFile(
      Buffer.from('# Title\n\nValid text paragraph here for embedding testing.', 'utf-8'),
      '.md',
    );
    const docEmbedFail = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Embed Fail Doc',
        sourceType: DocumentSourceType.MARKDOWN,
        fileName: 'embedfail.md',
        storagePath: validMdPath,
        contentHash: 'hash-embed-fail-35',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    const origEmbed = embedder.embedChunks;
    embedder.embedChunks = async () => {
      throw new Error('Simulated embedder API failure');
    };

    let resEmbedFail: any;
    try {
      resEmbedFail = await waitForDocument(docEmbedFail.id);
    } finally {
      embedder.embedChunks = origEmbed;
    }

    expect(resEmbedFail.status).toBe(DocumentStatus.FAILED);
    expect(resEmbedFail.failureCode).toBe(DocumentFailureCode.EMBED_FAILED);
    expect(resEmbedFail.chunks.length).toBe(0);
    expect(resEmbedFail.failureMessage).toBeDefined();
  });

  it('T-36 AC-36: row PROCESSING with updatedAt 6 min old, run recovery → FAILED/TIMEOUT; delete a document while the worker is mid-embedding → no chunk rows remain', async () => {
    const ws = await createTestWorkspace('WS 36');

    // Case 1: row PROCESSING with updatedAt 6 min old -> FAILED/TIMEOUT
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    const staleDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Stale Processing Doc',
        sourceType: DocumentSourceType.MARKDOWN,
        contentHash: 'hash-stale-36',
        status: DocumentStatus.PROCESSING,
        uploadedById: ws.userId,
        updatedAt: sixMinutesAgo,
      },
    });

    await recoveryService.runRecovery();

    const recoveredDoc = await prisma.document.findUniqueOrThrow({
      where: { id: staleDoc.id },
      include: { chunks: true },
    });
    expect(recoveredDoc.status).toBe(DocumentStatus.FAILED);
    expect(recoveredDoc.failureCode).toBe(DocumentFailureCode.TIMEOUT);
    expect(recoveredDoc.chunks.length).toBe(0);

    // Case 2: delete a document while the worker is mid-embedding -> no chunk rows remain
    const mdContent = '# Mid-Embedding Delete Test\n\nSome body text for document deletion test.';
    const mdPath = await storageService.saveFile(Buffer.from(mdContent, 'utf-8'), '.md');
    const midDeleteDoc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title: 'Mid-Delete Doc',
        sourceType: DocumentSourceType.MARKDOWN,
        fileName: 'middelete.md',
        storagePath: mdPath,
        contentHash: 'hash-mid-delete-36',
        status: DocumentStatus.QUEUED,
        uploadedById: ws.userId,
      },
    });

    const origEmbed = embedder.embedChunks;
    embedder.embedChunks = async (chunks) => {
      await prisma.document.delete({ where: { id: midDeleteDoc.id } });
      return origEmbed.call(embedder, chunks);
    };

    try {
      await worker.claimAndProcess();
    } finally {
      embedder.embedChunks = origEmbed;
    }

    const orphanChunks = await prisma.chunk.findMany({
      where: { documentId: midDeleteDoc.id },
    });
    expect(orphanChunks.length).toBe(0);
  });

  it('T-37 AC-37: five QUEUED docs, INGESTION_WORKERS=2; each document\'s attempts is exactly 1 and ends READY', async () => {
    const ws = await createTestWorkspace('WS 37');

    const docIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const mdContent = `# Document ${i}\n\n## Section ${i}\nParagraph content for document ${i} with enough length.`;
      const mdPath = await storageService.saveFile(Buffer.from(mdContent, 'utf-8'), `.md`);
      const doc = await prisma.document.create({
        data: {
          workspaceId: ws.id,
          title: `Concurrent Doc ${i}`,
          sourceType: DocumentSourceType.MARKDOWN,
          fileName: `doc-${i}.md`,
          storagePath: mdPath,
          contentHash: `hash-concurrent-37-${i}`,
          status: DocumentStatus.QUEUED,
          uploadedById: ws.userId,
        },
      });
      docIds.push(doc.id);
    }

    // Wait for all 5 to be READY
    const results = await Promise.all(docIds.map((id) => waitForDocument(id)));

    expect(results.length).toBe(5);
    for (const doc of results) {
      expect(doc.status).toBe(DocumentStatus.READY);
      expect(doc.attempts).toBe(1);
      expect(doc.chunkCount).toBeGreaterThan(0);
    }
  });
});
