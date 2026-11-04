import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LlmProvider } from '../rag/llm/llm.provider.js';
import { FakeLlmProvider } from '../rag/llm/fake.provider.js';
import { AnthropicProvider } from '../rag/llm/anthropic.provider.js';
import { OpenAiProvider } from '../rag/llm/openai.provider.js';
import { CostCalculator } from '../rag/cost.js';
import {
  ACCURACY_JUDGE_SYSTEM_PROMPT,
  buildAccuracyJudgeUserPrompt,
  FAITHFULNESS_JUDGE_SYSTEM_PROMPT,
  buildFaithfulnessJudgeUserPrompt,
} from './prompts.js';

const accuracySchema = z.object({
  verdict: z.enum(['CORRECT', 'INCORRECT']),
});

const faithfulnessSchema = z.object({
  totalClaims: z.number().int().min(0),
  supportedClaims: z.number().int().min(0),
});

export interface AccuracyJudgeResult {
  accuracyCorrect: boolean;
  verdict: 'CORRECT' | 'INCORRECT' | null;
  costMicros: number;
}

export interface FaithfulnessJudgeResult {
  faithfulness: number | null;
  totalClaims: number | null;
  supportedClaims: number | null;
  costMicros: number;
}

@Injectable()
export class JudgeService {
  constructor(
    private readonly fakeLlmProvider: FakeLlmProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly openAiProvider: OpenAiProvider,
  ) {}

  private getProvider(modelId: string): LlmProvider {
    if (process.env.LLM_PROVIDER === 'fake') {
      return this.fakeLlmProvider;
    }
    if (modelId === 'gpt-4o-mini') {
      return this.openAiProvider;
    }
    return this.anthropicProvider;
  }

  private cleanJson(raw: string): string {
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    return text.trim();
  }

  async judgeAccuracy(
    question: string,
    expectedAnswer: string,
    actualAnswer: string,
    modelId: string,
  ): Promise<AccuracyJudgeResult> {
    const provider = this.getProvider(modelId);
    const messages = [
      { role: 'system' as const, content: ACCURACY_JUDGE_SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: buildAccuracyJudgeUserPrompt(
          question,
          expectedAnswer,
          actualAnswer,
        ),
      },
    ];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let parsed: z.infer<typeof accuracySchema> | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await provider.chat({
          modelId,
          messages,
          temperature: 0,
          maxTokens: 50,
        });

        totalPromptTokens += res.promptTokens;
        totalCompletionTokens += res.completionTokens;

        const cleaned = this.cleanJson(res.content);
        const json = JSON.parse(cleaned);
        parsed = accuracySchema.parse(json);
        break;
      } catch {
        // Retry once on parse failure per TR Section 7.6
        if (attempt === 1) {
          parsed = null;
        }
      }
    }

    const costMicros = CostCalculator.calculateCost({
      modelId,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      embeddingTokens: 0,
    });

    if (!parsed) {
      return {
        accuracyCorrect: false,
        verdict: null,
        costMicros,
      };
    }

    return {
      accuracyCorrect: parsed.verdict === 'CORRECT',
      verdict: parsed.verdict,
      costMicros,
    };
  }

  async judgeFaithfulness(
    passagesText: string,
    actualAnswer: string,
    modelId: string,
  ): Promise<FaithfulnessJudgeResult> {
    const provider = this.getProvider(modelId);
    const messages = [
      { role: 'system' as const, content: FAITHFULNESS_JUDGE_SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: buildFaithfulnessJudgeUserPrompt(passagesText, actualAnswer),
      },
    ];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let parsed: z.infer<typeof faithfulnessSchema> | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await provider.chat({
          modelId,
          messages,
          temperature: 0,
          maxTokens: 50,
        });

        totalPromptTokens += res.promptTokens;
        totalCompletionTokens += res.completionTokens;

        const cleaned = this.cleanJson(res.content);
        const json = JSON.parse(cleaned);
        parsed = faithfulnessSchema.parse(json);
        break;
      } catch {
        // Retry once on parse failure per TR Section 7.6
        if (attempt === 1) {
          parsed = null;
        }
      }
    }

    const costMicros = CostCalculator.calculateCost({
      modelId,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      embeddingTokens: 0,
    });

    if (!parsed) {
      return {
        faithfulness: null,
        totalClaims: null,
        supportedClaims: null,
        costMicros,
      };
    }

    const faithfulness =
      parsed.totalClaims === 0
        ? 1.0
        : parsed.supportedClaims / parsed.totalClaims;

    return {
      faithfulness,
      totalClaims: parsed.totalClaims,
      supportedClaims: parsed.supportedClaims,
      costMicros,
    };
  }
}
