import { Injectable, HttpStatus } from '@nestjs/common';
import { getDefaultModelId } from '../config/ai-models.js';
import { Prisma, EvalRunStatus, AnswerOutcome } from '@prisma/client';
import { ErrorCode, Limits } from '@xs-rag/shared';
import { PrismaService } from '../common/prisma.service.js';
import { Principal } from '../common/principal.js';
import { ApiException } from '../common/error-envelope.filter.js';
import { encodeCursor, decodeCursor } from '../common/pagination.js';
import { RagService } from '../rag/rag.service.js';
import { JudgeService } from './judge.service.js';
import {
  computeRunScores,
  computeDelta,
} from './scoring.js';

export interface CreateEvalQuestionDto {
  question: string;
  expectedAnswer?: string | null;
  expectUnanswered?: boolean;
  expectedDocumentIds?: string[];
}

export interface UpdateEvalQuestionDto {
  question?: string;
  expectedAnswer?: string | null;
  expectUnanswered?: boolean;
  expectedDocumentIds?: string[];
}

export interface CreateFromFeedbackDto {
  expectedAnswer: string;
  expectedDocumentIds?: string[];
}

@Injectable()
export class EvalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly judgeService: JudgeService,
  ) {}

  // 1. List questions (bounded list, cap 100)
  async listQuestions(wid: string) {
    const questions = await this.prisma.evalQuestion.findMany({
      where: { workspaceId: wid },
      orderBy: { createdAt: 'asc' },
    });
    return { data: questions };
  }

  // 2. Create question
  async createQuestion(wid: string, dto: CreateEvalQuestionDto) {
    const trimmedQuestion = (dto.question || '').trim();
    const expectUnanswered = dto.expectUnanswered ?? false;
    const trimmedAnswer = dto.expectedAnswer ? dto.expectedAnswer.trim() : null;

    if (!trimmedQuestion) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'Question is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!expectUnanswered && (!trimmedAnswer || trimmedAnswer.length === 0)) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'expectedAnswer is required unless expectUnanswered is true',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.expectedDocumentIds && dto.expectedDocumentIds.length > 0) {
      const validCount = await this.prisma.document.count({
        where: {
          id: { in: dto.expectedDocumentIds },
          workspaceId: wid,
        },
      });
      if (validCount !== dto.expectedDocumentIds.length) {
        throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          'expectedDocumentIds contains invalid documents',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const count = await this.prisma.evalQuestion.count({
      where: { workspaceId: wid },
    });
    if (count >= Limits.EVAL_QUESTIONS_PER_WORKSPACE) {
      throw new ApiException(
        ErrorCode.EVAL_LIMIT,
        'Evaluation question limit reached',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.evalQuestion.create({
      data: {
        workspaceId: wid,
        question: trimmedQuestion,
        expectedAnswer: trimmedAnswer,
        expectUnanswered,
        expectedDocumentIds: dto.expectedDocumentIds || [],
      },
    });
  }

  // 3. Edit question
  async updateQuestion(
    wid: string,
    questionId: string,
    dto: UpdateEvalQuestionDto,
  ) {
    const existing = await this.prisma.evalQuestion.findFirst({
      where: { id: questionId, workspaceId: wid },
    });
    if (!existing) {
      throw new ApiException(
        ErrorCode.EVAL_QUESTION_NOT_FOUND,
        'Evaluation question not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const newExpectUnanswered =
      dto.expectUnanswered !== undefined
        ? dto.expectUnanswered
        : existing.expectUnanswered;

    const newExpectedAnswer =
      dto.expectedAnswer !== undefined
        ? dto.expectedAnswer
        : existing.expectedAnswer;

    if (
      !newExpectUnanswered &&
      (!newExpectedAnswer || newExpectedAnswer.trim().length === 0)
    ) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'expectedAnswer is required unless expectUnanswered is true',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.expectedDocumentIds && dto.expectedDocumentIds.length > 0) {
      const validCount = await this.prisma.document.count({
        where: {
          id: { in: dto.expectedDocumentIds },
          workspaceId: wid,
        },
      });
      if (validCount !== dto.expectedDocumentIds.length) {
        throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          'expectedDocumentIds contains invalid documents',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return this.prisma.evalQuestion.update({
      where: { id: questionId },
      data: {
        ...(dto.question !== undefined ? { question: dto.question.trim() } : {}),
        ...(dto.expectedAnswer !== undefined
          ? { expectedAnswer: dto.expectedAnswer ? dto.expectedAnswer.trim() : null }
          : {}),
        ...(dto.expectUnanswered !== undefined
          ? { expectUnanswered: dto.expectUnanswered }
          : {}),
        ...(dto.expectedDocumentIds !== undefined
          ? { expectedDocumentIds: dto.expectedDocumentIds }
          : {}),
      },
    });
  }

  // 4. Delete question (hard delete)
  async deleteQuestion(wid: string, questionId: string): Promise<void> {
    const existing = await this.prisma.evalQuestion.findFirst({
      where: { id: questionId, workspaceId: wid },
    });
    if (!existing) {
      throw new ApiException(
        ErrorCode.EVAL_QUESTION_NOT_FOUND,
        'Evaluation question not found',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.evalQuestion.delete({
      where: { id: questionId },
    });
  }

  // 5. Start run
  async startRun(wid: string, principal: Principal) {
    const activeRun = await this.prisma.evalRun.findFirst({
      where: {
        workspaceId: wid,
        status: { in: [EvalRunStatus.QUEUED, EvalRunStatus.RUNNING] },
      },
    });
    if (activeRun) {
      throw new ApiException(
        ErrorCode.EVAL_RUN_IN_PROGRESS,
        'An evaluation run is already in progress',
        HttpStatus.CONFLICT,
      );
    }

    const questionCount = await this.prisma.evalQuestion.count({
      where: { workspaceId: wid },
    });
    if (questionCount === 0) {
      throw new ApiException(
        ErrorCode.EVAL_NO_QUESTIONS,
        'Workspace has no evaluation questions',
        HttpStatus.CONFLICT,
      );
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: wid },
    });
    const modelId = workspace?.modelId || getDefaultModelId();
    const judgeModelId = process.env.EVAL_JUDGE_MODEL || 'claude-sonnet-5-5';

    const run = await this.prisma.evalRun.create({
      data: {
        workspaceId: wid,
        status: EvalRunStatus.QUEUED,
        modelId,
        judgeModelId,
        questionCount,
        startedById: principal.userId || 'system',
      },
    });

    // Run execution asynchronously in background
    setImmediate(() => {
      this.executeRun(run.id, wid, principal, modelId, judgeModelId).catch(
        (err) => {
          console.error(`Evaluation run ${run.id} failed:`, err);
        },
      );
    });

    return run;
  }

  // Asynchronous run execution
  async executeRun(
    runId: string,
    wid: string,
    principal: Principal,
    modelId: string,
    judgeModelId: string,
  ): Promise<void> {
    try {
      await this.prisma.evalRun.update({
        where: { id: runId },
        data: {
          status: EvalRunStatus.RUNNING,
          startedAt: new Date(),
        },
      });

      const questions = await this.prisma.evalQuestion.findMany({
        where: { workspaceId: wid },
        orderBy: { createdAt: 'asc' },
      });

      const questionResults: Array<{
        accuracyCorrect: boolean;
        faithfulness: number | null;
        retrievalHit: boolean | null;
        costMicros: number;
      }> = [];

      for (const q of questions) {
        // 1. Ask via RagService without persistence
        const ragResult = await this.ragService.ask({
          principal: {
            type: principal.type,
            userId: principal.userId,
            workspaceId: wid,
          },
          question: q.question,
          persist: false,
        });

        const outcome = ragResult?.outcome || AnswerOutcome.UNANSWERED;
        const answer = ragResult?.content || '';
        const retrievedDocumentIds = ragResult?.retrievedDocumentIds || [];
        const retrievedPassages = ragResult?.retrievedPassages || [];
        let questionCost = ragResult?.costMicros || 0;

        // 2. Retrieval metric
        let retrievalHit: boolean | null = null;
        if (q.expectedDocumentIds && q.expectedDocumentIds.length > 0) {
          const expectedSet = new Set(q.expectedDocumentIds);
          retrievalHit = retrievedDocumentIds.some((id) => expectedSet.has(id));
        }

        // 3. Accuracy metric
        let accuracyCorrect = false;
        if (q.expectUnanswered) {
          accuracyCorrect = outcome === AnswerOutcome.UNANSWERED;
        } else if (outcome === AnswerOutcome.ANSWERED) {
          const accuracyJudge = await this.judgeService.judgeAccuracy(
            q.question,
            q.expectedAnswer || '',
            answer,
            judgeModelId,
          );
          accuracyCorrect = accuracyJudge.accuracyCorrect;
          questionCost += accuracyJudge.costMicros;
        } else {
          accuracyCorrect = false;
        }

        // 4. Faithfulness metric
        let faithfulness: number | null = null;
        if (outcome === AnswerOutcome.ANSWERED) {
          const passagesText = retrievedPassages
            .map((p, idx) => `[${idx + 1}] (${p.fileName}) ${p.text}`)
            .join('\n\n');

          const faithfulnessJudge = await this.judgeService.judgeFaithfulness(
            passagesText,
            answer,
            judgeModelId,
          );
          faithfulness = faithfulnessJudge.faithfulness;
          questionCost += faithfulnessJudge.costMicros;
        } else {
          faithfulness = null;
        }

        // 5. Store EvalResult
        await this.prisma.evalResult.create({
          data: {
            runId,
            questionId: q.id,
            questionText: q.question,
            expectedAnswer: q.expectedAnswer,
            expectUnanswered: q.expectUnanswered,
            expectedDocumentIds: q.expectedDocumentIds,
            answer,
            outcome,
            retrievedDocumentIds,
            accuracyCorrect,
            faithfulness,
            retrievalHit,
            costMicros: questionCost,
          },
        });

        questionResults.push({
          accuracyCorrect,
          faithfulness,
          retrievalHit,
          costMicros: questionCost,
        });
      }

      // Compute aggregate scores
      const runScores = computeRunScores(questionResults);
      const totalCostMicros = questionResults.reduce(
        (sum, r) => sum + r.costMicros,
        0,
      );

      await this.prisma.evalRun.update({
        where: { id: runId },
        data: {
          status: EvalRunStatus.COMPLETED,
          finishedAt: new Date(),
          accuracy: runScores.accuracy,
          faithfulness: runScores.faithfulness,
          retrieval: runScores.retrieval,
          costMicros: totalCostMicros,
        },
      });
    } catch (err: any) {
      await this.prisma.evalRun.update({
        where: { id: runId },
        data: {
          status: EvalRunStatus.FAILED,
          finishedAt: new Date(),
          failureMessage: err?.message || 'Evaluation run failed',
        },
      });
    }
  }

  // 6. List runs (cursor paginated)
  async listRuns(wid: string, query: { cursor?: string; limit?: number }) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const decodedCursor = query.cursor
      ? decodeCursor<string>(query.cursor)
      : null;

    const runs = await this.prisma.evalRun.findMany({
      where: { workspaceId: wid },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(decodedCursor ? { cursor: { id: decodedCursor }, skip: 1 } : {}),
    });

    const hasMore = runs.length > limit;
    const items = hasMore ? runs.slice(0, limit) : runs;
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1].id) : null;

    return {
      data: items,
      nextCursor,
    };
  }

  // 7. Get run by id
  async getRun(wid: string, runId: string) {
    const run = await this.prisma.evalRun.findFirst({
      where: { id: runId, workspaceId: wid },
      include: {
        results: true,
      },
    });
    if (!run) {
      throw new ApiException(
        ErrorCode.EVAL_RUN_NOT_FOUND,
        'Evaluation run not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return run;
  }

  // 8. Compare two runs
  async compareRuns(wid: string, baseRunId: string, otherRunId: string) {
    if (!baseRunId || !otherRunId || baseRunId === otherRunId) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'baseRunId and otherRunId are required and must be distinct',
        HttpStatus.BAD_REQUEST,
      );
    }

    const baseRun = await this.prisma.evalRun.findFirst({
      where: { id: baseRunId, workspaceId: wid },
      include: { results: true },
    });
    if (!baseRun) {
      throw new ApiException(
        ErrorCode.EVAL_RUN_NOT_FOUND,
        'Base evaluation run not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const otherRun = await this.prisma.evalRun.findFirst({
      where: { id: otherRunId, workspaceId: wid },
      include: { results: true },
    });
    if (!otherRun) {
      throw new ApiException(
        ErrorCode.EVAL_RUN_NOT_FOUND,
        'Other evaluation run not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const baseSummary = {
      id: baseRun.id,
      modelId: baseRun.modelId,
      judgeModelId: baseRun.judgeModelId,
      status: baseRun.status,
      questionCount: baseRun.questionCount,
      accuracy: baseRun.accuracy,
      faithfulness: baseRun.faithfulness,
      retrieval: baseRun.retrieval,
      costMicros: baseRun.costMicros,
      createdAt: baseRun.createdAt,
      startedAt: baseRun.startedAt,
      finishedAt: baseRun.finishedAt,
    };

    const otherSummary = {
      id: otherRun.id,
      modelId: otherRun.modelId,
      judgeModelId: otherRun.judgeModelId,
      status: otherRun.status,
      questionCount: otherRun.questionCount,
      accuracy: otherRun.accuracy,
      faithfulness: otherRun.faithfulness,
      retrieval: otherRun.retrieval,
      costMicros: otherRun.costMicros,
      createdAt: otherRun.createdAt,
      startedAt: otherRun.startedAt,
      finishedAt: otherRun.finishedAt,
    };

    const deltas = {
      accuracy: computeDelta(otherRun.accuracy, baseRun.accuracy),
      faithfulness: computeDelta(otherRun.faithfulness, baseRun.faithfulness),
      retrieval: computeDelta(otherRun.retrieval, baseRun.retrieval),
    };

    const baseMap = new Map<string, (typeof baseRun.results)[number]>();
    for (const r of baseRun.results) {
      if (r.questionId) {
        baseMap.set(r.questionId, r);
      }
    }

    const questions: Array<{
      questionId: string;
      questionText: string;
      baseCorrect: boolean;
      otherCorrect: boolean;
      changed: boolean;
    }> = [];

    for (const otherRes of otherRun.results) {
      if (otherRes.questionId && baseMap.has(otherRes.questionId)) {
        const baseRes = baseMap.get(otherRes.questionId)!;
        const baseCorrect = baseRes.accuracyCorrect;
        const otherCorrect = otherRes.accuracyCorrect;
        questions.push({
          questionId: otherRes.questionId,
          questionText: otherRes.questionText,
          baseCorrect,
          otherCorrect,
          changed: baseCorrect !== otherCorrect,
        });
      }
    }

    return {
      base: baseSummary,
      other: otherSummary,
      deltas,
      metrics: {
        accuracy: {
          base: baseRun.accuracy,
          other: otherRun.accuracy,
          delta: deltas.accuracy,
        },
        faithfulness: {
          base: baseRun.faithfulness,
          other: otherRun.faithfulness,
          delta: deltas.faithfulness,
        },
        retrieval: {
          base: baseRun.retrieval,
          other: otherRun.retrieval,
          delta: deltas.retrieval,
        },
      },
      questions,
    };
  }

  // 9. Add to evaluation set from feedback
  async createFromFeedback(
    wid: string,
    feedbackId: string,
    dto: CreateFromFeedbackDto,
  ) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id: feedbackId, workspaceId: wid },
      include: { message: true },
    });
    if (!feedback) {
      throw new ApiException(
        ErrorCode.FEEDBACK_NOT_FOUND,
        'Feedback not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const questionText = feedback.message.question || feedback.message.content;
    if (!questionText || questionText.trim().length === 0) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'Message question is empty',
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmedExpectedAnswer = (dto.expectedAnswer || '').trim();
    if (!trimmedExpectedAnswer) {
      throw new ApiException(
        ErrorCode.VALIDATION_FAILED,
        'expectedAnswer is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.expectedDocumentIds && dto.expectedDocumentIds.length > 0) {
      const docCount = await this.prisma.document.count({
        where: { id: { in: dto.expectedDocumentIds }, workspaceId: wid },
      });
      if (docCount !== dto.expectedDocumentIds.length) {
        throw new ApiException(
          ErrorCode.VALIDATION_FAILED,
          'Invalid expectedDocumentIds',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const count = await this.prisma.evalQuestion.count({
      where: { workspaceId: wid },
    });
    if (count >= Limits.EVAL_QUESTIONS_PER_WORKSPACE) {
      throw new ApiException(
        ErrorCode.EVAL_LIMIT,
        'Evaluation question limit reached',
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.prisma.evalQuestion.findUnique({
      where: {
        workspaceId_sourceMessageId: {
          workspaceId: wid,
          sourceMessageId: feedback.messageId,
        },
      },
    });
    if (existing) {
      throw new ApiException(
        ErrorCode.EVAL_QUESTION_EXISTS,
        'Feedback already added to evaluation set',
        HttpStatus.CONFLICT,
      );
    }

    try {
      return await this.prisma.evalQuestion.create({
        data: {
          workspaceId: wid,
          question: questionText.trim(),
          expectedAnswer: trimmedExpectedAnswer,
          expectUnanswered: false,
          expectedDocumentIds: dto.expectedDocumentIds || [],
          sourceMessageId: feedback.messageId,
        },
      });
    } catch (err: any) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ApiException(
          ErrorCode.EVAL_QUESTION_EXISTS,
          'Feedback already added to evaluation set',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }
}
