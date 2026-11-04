import { AnswerOutcome } from '@xs-rag/shared';

export interface EvalScoringInput {
  expectUnanswered: boolean;
  outcome: AnswerOutcome;
  accuracyVerdict?: 'CORRECT' | 'INCORRECT' | null;
  totalClaims?: number | null;
  supportedClaims?: number | null;
  expectedDocumentIds: string[];
  retrievedDocumentIds: string[];
}

export interface QuestionScores {
  accuracyCorrect: boolean;
  faithfulness: number | null;
  retrievalHit: boolean | null;
}

export interface RunScores {
  accuracy: number;
  faithfulness: number | null;
  retrieval: number | null;
}

/**
 * Calculates per-question metrics according to TR Section 7.7.
 */
export function computeQuestionScores(input: EvalScoringInput): QuestionScores {
  // Accuracy
  let accuracyCorrect = false;
  if (input.expectUnanswered) {
    accuracyCorrect = input.outcome === AnswerOutcome.UNANSWERED;
  } else {
    accuracyCorrect =
      input.outcome === AnswerOutcome.ANSWERED &&
      input.accuracyVerdict === 'CORRECT';
  }

  // Faithfulness
  let faithfulness: number | null = null;
  if (input.outcome === AnswerOutcome.ANSWERED) {
    if (
      input.totalClaims !== null &&
      input.totalClaims !== undefined &&
      input.supportedClaims !== null &&
      input.supportedClaims !== undefined
    ) {
      if (input.totalClaims === 0) {
        faithfulness = 1.0;
      } else {
        faithfulness = input.supportedClaims / input.totalClaims;
      }
    }
  }

  // Retrieval
  let retrievalHit: boolean | null = null;
  if (input.expectedDocumentIds && input.expectedDocumentIds.length > 0) {
    const expectedSet = new Set(input.expectedDocumentIds);
    retrievalHit = (input.retrievedDocumentIds || []).some((id) =>
      expectedSet.has(id),
    );
  }

  return {
    accuracyCorrect,
    faithfulness,
    retrievalHit,
  };
}

/**
 * Calculates aggregated run scores according to TR Section 7.7.
 */
export function computeRunScores(
  results: Array<{
    accuracyCorrect: boolean;
    faithfulness: number | null;
    retrievalHit: boolean | null;
  }>,
): RunScores {
  const questionCount = results.length;
  if (questionCount === 0) {
    return {
      accuracy: 0,
      faithfulness: null,
      retrieval: null,
    };
  }

  // Accuracy: sum / questionCount
  const correctCount = results.filter((r) => r.accuracyCorrect).length;
  const accuracy = correctCount / questionCount;

  // Faithfulness: mean of non-null values; null if none
  const nonNullFaithfulness = results
    .map((r) => r.faithfulness)
    .filter((f): f is number => f !== null && f !== undefined);

  const faithfulness =
    nonNullFaithfulness.length > 0
      ? nonNullFaithfulness.reduce((sum, val) => sum + val, 0) /
        nonNullFaithfulness.length
      : null;

  // Retrieval: hits / questions with an expected list; null if none
  const questionsWithExpectedDocs = results.filter(
    (r) => r.retrievalHit !== null && r.retrievalHit !== undefined,
  );

  const hits = questionsWithExpectedDocs.filter(
    (r) => r.retrievalHit === true,
  ).length;

  const retrieval =
    questionsWithExpectedDocs.length > 0
      ? hits / questionsWithExpectedDocs.length
      : null;

  return {
    accuracy,
    faithfulness,
    retrieval,
  };
}

/**
 * Calculates score deltas (other - base, null if either is null).
 */
export function computeDelta(
  other: number | null | undefined,
  base: number | null | undefined,
): number | null {
  if (
    other === null ||
    other === undefined ||
    base === null ||
    base === undefined
  ) {
    return null;
  }
  return Number((other - base).toFixed(4));
}
