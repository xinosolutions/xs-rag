import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  DocumentSourceType,
  DocumentStatus,
  DocumentVisibility,
  WorkspaceRole,
} from '@xs-rag/shared';
import { PrismaService } from '../src/common/prisma.service.js';
import { StorageService } from '../src/documents/storage.service.js';
import { IngestionWorker } from '../src/ingestion/ingestion.worker.js';
import { DocumentEventsService } from '../src/documents/document-events.service.js';
import { PdfExtractor } from '../src/ingestion/extractors/pdf.extractor.js';
import { DocxExtractor } from '../src/ingestion/extractors/docx.extractor.js';
import { MarkdownExtractor } from '../src/ingestion/extractors/markdown.extractor.js';
import { WebExtractor } from '../src/ingestion/extractors/web.extractor.js';
import { Embedder } from '../src/ingestion/embedder.js';
import { RecoveryService } from '../src/ingestion/recovery.service.js';
import { FakeLlmProvider } from '../src/rag/llm/fake.provider.js';
import { hashPassword } from '../src/common/hash.js';
import { getEnv } from '../src/config/env.js';

export interface SeedOptions {
  prisma?: PrismaService;
  worker?: IngestionWorker;
  storageService?: StorageService;
}

export interface SeedResult {
  adminUser: { id: string; email: string; name: string };
  workspace: { id: string; name: string; slug: string; isDemo: boolean };
  documentsCount: number;
  evalQuestionsCount: number;
}

export async function seed(options?: SeedOptions): Promise<SeedResult> {
  const prisma = options?.prisma || new PrismaService();
  const storageService = options?.storageService || new StorageService();
  const events = new DocumentEventsService();
  const fakeLlm = new FakeLlmProvider();
  const worker =
    options?.worker ||
    new IngestionWorker(
      prisma,
      events,
      new PdfExtractor(),
      new DocxExtractor(),
      new MarkdownExtractor(),
      new WebExtractor(),
      new Embedder(fakeLlm),
      new RecoveryService(prisma, events),
    );

  try {
    const env = getEnv();
    const demoSlug = env.DEMO_WORKSPACE_SLUG || 'acme-demo';
    const adminEmail = 'demo-admin@acme.example';
    const adminPassword = env.SEED_DEMO_ADMIN_PASSWORD || 'DemoAdminSecretPass123!';

    // 1. Create or find demo admin user
    let adminUser = await prisma!.user.findUnique({
      where: { email: adminEmail },
    });

    if (!adminUser) {
      const passwordHash = await hashPassword(adminPassword);
      adminUser = await prisma!.user.create({
        data: {
          email: adminEmail,
          name: 'Demo Admin',
          passwordHash,
        },
      });
    }

    // 2. Create or find demo workspace
    const suggestedQuestions = [
      'How many vacation days do new hires get?',
      'Can I work from another country?',
      'What is the daily meal limit on business trips?',
      'How often must I change my password?',
    ];

    let workspace = await prisma!.workspace.findUnique({
      where: { slug: demoSlug },
    });

    if (!workspace) {
      workspace = await prisma!.workspace.create({
        data: {
          name: 'Acme Corp',
          slug: demoSlug,
          isDemo: true,
          createdById: adminUser.id,
          suggestedQuestions,
        },
      });
    }

    // 3. Ensure admin membership
    const membership = await prisma!.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: adminUser.id,
        },
      },
    });

    if (!membership) {
      await prisma!.membership.create({
        data: {
          workspaceId: workspace.id,
          userId: adminUser.id,
          role: WorkspaceRole.ADMIN,
        },
      });
    }

    // 4. Sample Documents
    const sampleFilesMeta = [
      {
        fileName: 'leave-policy.md',
        title: 'Leave Policy',
      },
      {
        fileName: 'remote-work-policy.md',
        title: 'Remote Work Policy',
      },
      {
        fileName: 'expense-policy.md',
        title: 'Expense Policy',
      },
      {
        fileName: 'code-of-conduct.md',
        title: 'Code of Conduct',
      },
      {
        fileName: 'it-security-policy.md',
        title: 'IT Security Policy',
      },
    ];

    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const sampleDocsDir = path.join(currentDir, 'sample-docs');

    for (const meta of sampleFilesMeta) {
      const filePath = path.join(sampleDocsDir, meta.fileName);
      const buffer = await fs.readFile(filePath);
      const contentHash = createHash('sha256').update(buffer).digest('hex');

      const existingDoc = await prisma!.document.findUnique({
        where: {
          workspaceId_contentHash: {
            workspaceId: workspace.id,
            contentHash,
          },
        },
      });

      if (!existingDoc) {
        const storagePath = await storageService!.saveFile(buffer, '.md');
        await prisma!.document.create({
          data: {
            workspaceId: workspace.id,
            title: meta.title,
            sourceType: DocumentSourceType.MARKDOWN,
            fileName: meta.fileName,
            storagePath,
            mimeType: 'text/markdown',
            sizeBytes: buffer.length,
            contentHash,
            status: DocumentStatus.QUEUED,
            visibility: DocumentVisibility.ALL_MEMBERS,
            uploadedById: adminUser.id,
          },
        });
      }
    }

    // 5. Run ingestion worker inline until all queued documents for this workspace are READY
    while (true) {
      const pendingCount = await prisma!.document.count({
        where: {
          workspaceId: workspace.id,
          status: { in: [DocumentStatus.QUEUED, DocumentStatus.PROCESSING] },
        },
      });

      if (pendingCount === 0) {
        break;
      }

      const worked = await worker!.claimAndProcess();
      if (!worked) {
        // Yield briefly if claimed by another runner or awaiting lock
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // 6. Evaluation set (10 questions)
    const readyDocs = await prisma!.document.findMany({
      where: {
        workspaceId: workspace.id,
        status: DocumentStatus.READY,
      },
    });

    const docMap = new Map<string, string>();
    for (const d of readyDocs) {
      if (d.fileName) {
        docMap.set(d.fileName, d.id);
      }
    }

    const leaveDocId = docMap.get('leave-policy.md');
    const remoteDocId = docMap.get('remote-work-policy.md');
    const expenseDocId = docMap.get('expense-policy.md');
    const conductDocId = docMap.get('code-of-conduct.md');
    const securityDocId = docMap.get('it-security-policy.md');

    const evalQuestions = [
      // 4 suggested questions
      {
        question: 'How many vacation days do new hires get?',
        expectedAnswer:
          'Full-time staff get 20 vacation days per year, accrued monthly; up to 5 unused days carry over; part-time staff accrue pro rata.',
        expectUnanswered: false,
        expectedDocumentIds: leaveDocId ? [leaveDocId] : [],
      },
      {
        question: 'Can I work from another country?',
        expectedAnswer:
          'Working from another country is allowed up to 30 days per year with manager approval; core hours are 10:00 to 15:00.',
        expectUnanswered: false,
        expectedDocumentIds: remoteDocId ? [remoteDocId] : [],
      },
      {
        question: 'What is the daily meal limit on business trips?',
        expectedAnswer:
          'Meals are reimbursed up to 60 USD per day on business trips; receipts are required above 25 USD; claims are due within 30 days.',
        expectUnanswered: false,
        expectedDocumentIds: expenseDocId ? [expenseDocId] : [],
      },
      {
        question: 'How often must I change my password?',
        expectedAnswer:
          'Passwords have at least 14 characters and expire every 90 days; multi-factor authentication is mandatory; laptops must use disk encryption.',
        expectUnanswered: false,
        expectedDocumentIds: securityDocId ? [securityDocId] : [],
      },
      // 4 additional authoritative questions
      {
        question: 'How many sick days do I get?',
        expectedAnswer: 'Sick leave is 10 days per year.',
        expectUnanswered: false,
        expectedDocumentIds: leaveDocId ? [leaveDocId] : [],
      },
      {
        question: 'How long is parental leave?',
        expectedAnswer: 'Parental leave is 16 weeks.',
        expectUnanswered: false,
        expectedDocumentIds: leaveDocId ? [leaveDocId] : [],
      },
      {
        question: 'When are expense claims due?',
        expectedAnswer: 'Claims are due within 30 days.',
        expectUnanswered: false,
        expectedDocumentIds: expenseDocId ? [expenseDocId] : [],
      },
      {
        question: 'Who do I contact to report a conduct concern?',
        expectedAnswer:
          'Concerns are reported to ethics@acme.example; retaliation is prohibited; gifts above 50 USD must be declared.',
        expectUnanswered: false,
        expectedDocumentIds: conductDocId ? [conductDocId] : [],
      },
      // 2 expectUnanswered questions
      {
        question: 'What is the stock option vesting schedule?',
        expectedAnswer: null,
        expectUnanswered: true,
        expectedDocumentIds: [],
      },
      {
        question: 'Does Acme offer a pension plan?',
        expectedAnswer: null,
        expectUnanswered: true,
        expectedDocumentIds: [],
      },
    ];

    for (const q of evalQuestions) {
      const existingQ = await prisma!.evalQuestion.findFirst({
        where: {
          workspaceId: workspace.id,
          question: q.question,
        },
      });

      if (!existingQ) {
        await prisma!.evalQuestion.create({
          data: {
            workspaceId: workspace.id,
            question: q.question,
            expectedAnswer: q.expectedAnswer,
            expectUnanswered: q.expectUnanswered,
            expectedDocumentIds: q.expectedDocumentIds,
          },
        });
      }
    }

    const documentsCount = await prisma!.document.count({
      where: { workspaceId: workspace.id },
    });

    const evalQuestionsCount = await prisma!.evalQuestion.count({
      where: { workspaceId: workspace.id },
    });

    return {
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        isDemo: workspace.isDemo,
      },
      documentsCount,
      evalQuestionsCount,
    };
  } finally {
    if (!options?.prisma) {
      await prisma.$disconnect();
    }
  }
}

// Self-invoking execution when executed directly via CLI
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isDirectExecution) {
  // Try loading .env if not loaded
  try {
    if (typeof (process as any).loadEnvFile === 'function') {
      (process as any).loadEnvFile();
    }
  } catch {
    // ignore if already loaded or file missing
  }

  seed()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log('Seed completed successfully:', {
        workspace: result.workspace.slug,
        admin: result.adminUser.email,
        documents: result.documentsCount,
        evalQuestions: result.evalQuestionsCount,
      });
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
