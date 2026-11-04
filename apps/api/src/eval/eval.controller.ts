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
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { WorkspaceRole } from '@xs-rag/shared';
import { PrincipalGuard } from '../common/principal.guard.js';
import {
  WorkspaceMemberGuard,
  RolesGuard,
  Roles,
} from '../common/roles.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { EvalService } from './eval.service.js';

const createQuestionSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(1, 'Question is required')
      .max(2000, 'Question is too long'),
    expectedAnswer: z
      .string()
      .trim()
      .max(2000, 'Expected answer is too long')
      .optional()
      .nullable(),
    expectUnanswered: z.boolean().optional().default(false),
    expectedDocumentIds: z.array(z.string()).optional().default([]),
  })
  .refine(
    (data) => {
      if (
        !data.expectUnanswered &&
        (!data.expectedAnswer || data.expectedAnswer.trim().length === 0)
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'expectedAnswer is required unless expectUnanswered is true',
      path: ['expectedAnswer'],
    },
  );

const updateQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Question must not be empty')
    .max(2000, 'Question is too long')
    .optional(),
  expectedAnswer: z
    .string()
    .trim()
    .max(2000, 'Expected answer is too long')
    .optional()
    .nullable(),
  expectUnanswered: z.boolean().optional(),
  expectedDocumentIds: z.array(z.string()).optional(),
});

const listRunsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const compareQuerySchema = z.object({
  baseRunId: z.string().min(1, 'baseRunId is required'),
  otherRunId: z.string().min(1, 'otherRunId is required'),
});

@Controller('workspaces/:wid/eval')
@UseGuards(PrincipalGuard, WorkspaceMemberGuard, RolesGuard)
@Roles(WorkspaceRole.ADMIN)
export class EvalController {
  constructor(private readonly evalService: EvalService) {}

  @Get('questions')
  async listQuestions(@Param('wid') wid: string) {
    return this.evalService.listQuestions(wid);
  }

  @Post('questions')
  @HttpCode(HttpStatus.CREATED)
  async createQuestion(
    @Param('wid') wid: string,
    @Body(new ZodPipe(createQuestionSchema))
    body: z.infer<typeof createQuestionSchema>,
  ) {
    return this.evalService.createQuestion(wid, body);
  }

  @Patch('questions/:questionId')
  async updateQuestion(
    @Param('wid') wid: string,
    @Param('questionId') questionId: string,
    @Body(new ZodPipe(updateQuestionSchema))
    body: z.infer<typeof updateQuestionSchema>,
  ) {
    return this.evalService.updateQuestion(wid, questionId, body);
  }

  @Delete('questions/:questionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteQuestion(
    @Param('wid') wid: string,
    @Param('questionId') questionId: string,
  ): Promise<void> {
    await this.evalService.deleteQuestion(wid, questionId);
  }

  @Post('runs')
  @HttpCode(HttpStatus.ACCEPTED)
  async startRun(@Param('wid') wid: string, @Req() req: Request) {
    return this.evalService.startRun(wid, req.principal!);
  }

  @Get('compare')
  async compareRuns(
    @Param('wid') wid: string,
    @Query(new ZodPipe(compareQuerySchema))
    query: z.infer<typeof compareQuerySchema>,
  ) {
    return this.evalService.compareRuns(wid, query.baseRunId, query.otherRunId);
  }

  @Get('runs')
  async listRuns(
    @Param('wid') wid: string,
    @Query(new ZodPipe(listRunsQuerySchema))
    query: z.infer<typeof listRunsQuerySchema>,
  ) {
    return this.evalService.listRuns(wid, query);
  }

  @Get('runs/:runId')
  async getRun(
    @Param('wid') wid: string,
    @Param('runId') runId: string,
  ) {
    return this.evalService.getRun(wid, runId);
  }
}
