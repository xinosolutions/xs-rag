import { PrismaService } from '../../src/common/prisma.service.js';

export async function insertTestChunk(
  prisma: PrismaService,
  params: {
    id: string;
    documentId: string;
    workspaceId: string;
    ordinal: number;
    text: string;
    page?: number | null;
    heading?: string | null;
    headingPath?: string | null;
    tokenCount?: number;
  },
): Promise<void> {
  const dummyEmbedding = `[${Array.from({ length: 1536 }, () => 0).join(',')}]`;
  const tokenCount = params.tokenCount ?? Math.ceil(params.text.length / 4);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "Chunk" ("id", "documentId", "workspaceId", "ordinal", "text", "page", "heading", "headingPath", "tokenCount", "embedding")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)`,
    params.id,
    params.documentId,
    params.workspaceId,
    params.ordinal,
    params.text,
    params.page ?? null,
    params.heading ?? null,
    params.headingPath ?? null,
    tokenCount,
    dummyEmbedding,
  );
}
