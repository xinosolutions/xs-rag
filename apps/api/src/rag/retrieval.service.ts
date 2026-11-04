import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service.js';
import { DocumentAccessService } from '../documents/document-access.service.js';
import { Principal } from '../common/principal.js';

export interface RetrievedPassage {
  id: string;
  documentId: string;
  workspaceId: string;
  ordinal: number;
  text: string;
  page: number | null;
  heading: string | null;
  headingPath: string | null;
  fileName: string;
  score: number;
  vectorSimilarity?: number;
}

export interface RetrievalResult {
  passages: RetrievedPassage[];
  meetsRelevanceGate: boolean;
  bestVectorSimilarity: number;
  keywordHitCount: number;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
  ) {}

  async retrieve(
    principal: Principal,
    queryText: string,
    queryEmbedding: number[],
  ): Promise<RetrievalResult> {
    const candidatesLimit = parseInt(process.env.RAG_CANDIDATES_PER_SEARCH || '20', 10);
    const topK = parseInt(process.env.RAG_TOP_K || '6', 10);
    const minSimilarity = parseFloat(process.env.RAG_MIN_SIMILARITY || '0.25');

    const permitted = this.documentAccessService.permittedSql(principal);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    return await this.prisma.$transaction(async (tx) => {
      try {
        await tx.$executeRawUnsafe('SET LOCAL hnsw.iterative_scan = strict_order');
        await tx.$executeRawUnsafe('SET LOCAL hnsw.ef_search = 100');
      } catch {
        // Ignore if unsupported in test environment / pgvector version
      }

      // 1. Vector Search
      const vectorResults = await tx.$queryRaw<
        Array<{
          id: string;
          documentId: string;
          workspaceId: string;
          ordinal: number;
          text: string;
          page: number | null;
          heading: string | null;
          headingPath: string | null;
          fileName: string;
          similarity: number;
        }>
      >(Prisma.sql`
        SELECT c."id", c."documentId", c."workspaceId", c."ordinal", c."text", c."page", c."heading", c."headingPath", d."fileName",
               (1 - (c."embedding" <=> ${vectorStr}::vector)) AS "similarity"
        FROM "Chunk" c
        JOIN "Document" d ON d."id" = c."documentId"
        WHERE ${permitted}
        ORDER BY c."embedding" <=> ${vectorStr}::vector ASC
        LIMIT ${candidatesLimit}
      `);

      // 2. Keyword Search (using websearch_to_tsquery)
      let keywordResults: Array<{
        id: string;
        documentId: string;
        workspaceId: string;
        ordinal: number;
        text: string;
        page: number | null;
        heading: string | null;
        headingPath: string | null;
        fileName: string;
        rank: number;
      }> = [];

      if (queryText.trim().length > 0) {
        try {
          keywordResults = await tx.$queryRaw<
            Array<{
              id: string;
              documentId: string;
              workspaceId: string;
              ordinal: number;
              text: string;
              page: number | null;
              heading: string | null;
              headingPath: string | null;
              fileName: string;
              rank: number;
            }>
          >(Prisma.sql`
            SELECT c."id", c."documentId", c."workspaceId", c."ordinal", c."text", c."page", c."heading", c."headingPath", d."fileName",
                   ts_rank_cd(c."tsv", websearch_to_tsquery('english', ${queryText})) AS "rank"
            FROM "Chunk" c
            JOIN "Document" d ON d."id" = c."documentId"
            WHERE ${permitted} AND c."tsv" @@ websearch_to_tsquery('english', ${queryText})
            ORDER BY ts_rank_cd(c."tsv", websearch_to_tsquery('english', ${queryText})) DESC
            LIMIT ${candidatesLimit}
          `);
        } catch {
          keywordResults = [];
        }
      }

      // 3. Reciprocal Rank Fusion (RRF): score = Σ 1 / (60 + rank)
      const fusedMap = new Map<string, RetrievedPassage>();

      vectorResults.forEach((vr, idx) => {
        const rank = idx + 1;
        const rrfScore = 1 / (60 + rank);
        fusedMap.set(vr.id, {
          id: vr.id,
          documentId: vr.documentId,
          workspaceId: vr.workspaceId,
          ordinal: vr.ordinal,
          text: vr.text,
          page: vr.page,
          heading: vr.heading,
          headingPath: vr.headingPath,
          fileName: vr.fileName,
          score: rrfScore,
          vectorSimilarity: Number(vr.similarity),
        });
      });

      keywordResults.forEach((kr, idx) => {
        const rank = idx + 1;
        const rrfScore = 1 / (60 + rank);
        const existing = fusedMap.get(kr.id);
        if (existing) {
          existing.score += rrfScore;
        } else {
          fusedMap.set(kr.id, {
            id: kr.id,
            documentId: kr.documentId,
            workspaceId: kr.workspaceId,
            ordinal: kr.ordinal,
            text: kr.text,
            page: kr.page,
            heading: kr.heading,
            headingPath: kr.headingPath,
            fileName: kr.fileName,
            score: rrfScore,
          });
        }
      });

      const allFused = Array.from(fusedMap.values()).sort((a, b) => b.score - a.score);
      const topPassages = allFused.slice(0, topK);

      const bestVectorSimilarity =
        vectorResults.length > 0 ? Number(vectorResults[0].similarity) : 0;
      const keywordHitCount = keywordResults.length;

      const meetsRelevanceGate =
        topPassages.length > 0 &&
        !(bestVectorSimilarity < minSimilarity && keywordHitCount === 0);

      return {
        passages: topPassages,
        meetsRelevanceGate,
        bestVectorSimilarity,
        keywordHitCount,
      };
    });
  }
}
