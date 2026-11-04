import { describe, it, expect } from 'vitest';
import { AnswerOutcome } from '@xs-rag/shared';
import {
  computeQuestionScores,
  computeRunScores,
  computeDelta,
} from './scoring.js';

describe('T-73 AC-73: Unit scoring definitions (accuracy, faithfulness, retrieval per 7.7)', () => {
  it('scripted results: accuracy, faithfulness, retrieval equal hand-computed values', () => {
    // Hand-crafted dataset with 4 questions:
    // Q1: expectUnanswered: false, outcome: ANSWERED, verdict: CORRECT, claims: 2/2, expected: ['docA'], retrieved: ['docA']
    //     => accuracy: 1, faithfulness: 1.0, retrievalHit: true
    // Q2: expectUnanswered: false, outcome: ANSWERED, verdict: INCORRECT, claims: 1/2, expected: ['docB'], retrieved: ['docC']
    //     => accuracy: 0, faithfulness: 0.5, retrievalHit: false
    // Q3: expectUnanswered: true, outcome: UNANSWERED, verdict: null, claims: null, expected: [], retrieved: []
    //     => accuracy: 1, faithfulness: null, retrievalHit: null
    // Q4: expectUnanswered: false, outcome: ANSWERED, verdict: CORRECT, claims: 0/0, expected: ['docD'], retrieved: ['docD']
    //     => accuracy: 1, faithfulness: 1.0 (totalClaims 0 => 1), retrievalHit: true

    const q1 = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'CORRECT',
      totalClaims: 2,
      supportedClaims: 2,
      expectedDocumentIds: ['docA'],
      retrievedDocumentIds: ['docA', 'docX'],
    });
    expect(q1.accuracyCorrect).toBe(true);
    expect(q1.faithfulness).toBe(1.0);
    expect(q1.retrievalHit).toBe(true);

    const q2 = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'INCORRECT',
      totalClaims: 2,
      supportedClaims: 1,
      expectedDocumentIds: ['docB'],
      retrievedDocumentIds: ['docC'],
    });
    expect(q2.accuracyCorrect).toBe(false);
    expect(q2.faithfulness).toBe(0.5);
    expect(q2.retrievalHit).toBe(false);

    const q3 = computeQuestionScores({
      expectUnanswered: true,
      outcome: AnswerOutcome.UNANSWERED,
      accuracyVerdict: null,
      totalClaims: null,
      supportedClaims: null,
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });
    expect(q3.accuracyCorrect).toBe(true);
    expect(q3.faithfulness).toBeNull();
    expect(q3.retrievalHit).toBeNull();

    const q4 = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'CORRECT',
      totalClaims: 0,
      supportedClaims: 0,
      expectedDocumentIds: ['docD'],
      retrievedDocumentIds: ['docD'],
    });
    expect(q4.accuracyCorrect).toBe(true);
    expect(q4.faithfulness).toBe(1.0);
    expect(q4.retrievalHit).toBe(true);

    const runScores = computeRunScores([q1, q2, q3, q4]);

    // Hand-computed expected values:
    // Accuracy: 3 correct out of 4 => 3/4 = 0.75
    expect(runScores.accuracy).toBe(0.75);

    // Faithfulness: non-null values are [1.0, 0.5, 1.0] => sum = 2.5, count = 3 => 2.5 / 3 = 0.8333333333333334
    expect(runScores.faithfulness).toBeCloseTo(2.5 / 3, 5);

    // Retrieval: questions with expected docs are Q1, Q2, Q4 (3 questions).
    // Hits are Q1, Q4 (2 hits).
    // => 2/3 = 0.6666666666666666
    expect(runScores.retrieval).toBeCloseTo(2 / 3, 5);
  });

  it('no expected docs -> retrieval null', () => {
    const q1 = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'CORRECT',
      totalClaims: 1,
      supportedClaims: 1,
      expectedDocumentIds: [],
      retrievedDocumentIds: ['docA'],
    });
    expect(q1.retrievalHit).toBeNull();

    const q2 = computeQuestionScores({
      expectUnanswered: true,
      outcome: AnswerOutcome.UNANSWERED,
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });
    expect(q2.retrievalHit).toBeNull();

    const runScores = computeRunScores([q1, q2]);
    expect(runScores.retrieval).toBeNull();
    expect(runScores.accuracy).toBe(1.0);
    expect(runScores.faithfulness).toBe(1.0);
  });

  it('all unanswered -> faithfulness null', () => {
    const q1 = computeQuestionScores({
      expectUnanswered: true,
      outcome: AnswerOutcome.UNANSWERED,
      expectedDocumentIds: ['docA'],
      retrievedDocumentIds: [],
    });
    expect(q1.faithfulness).toBeNull();
    expect(q1.accuracyCorrect).toBe(true);
    expect(q1.retrievalHit).toBe(false);

    const q2 = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.UNANSWERED,
      expectedDocumentIds: ['docB'],
      retrievedDocumentIds: [],
    });
    expect(q2.faithfulness).toBeNull();
    expect(q2.accuracyCorrect).toBe(false);
    expect(q2.retrievalHit).toBe(false);

    const runScores = computeRunScores([q1, q2]);
    expect(runScores.faithfulness).toBeNull();
    expect(runScores.accuracy).toBe(0.5);
    expect(runScores.retrieval).toBe(0.0);
  });

  it('expectUnanswered scoring per 7.7', () => {
    // 1 if outcome UNANSWERED else 0
    const answeredWhenExpectedUnanswered = computeQuestionScores({
      expectUnanswered: true,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'CORRECT',
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });
    expect(answeredWhenExpectedUnanswered.accuracyCorrect).toBe(false);

    const unansweredWhenExpectedUnanswered = computeQuestionScores({
      expectUnanswered: true,
      outcome: AnswerOutcome.UNANSWERED,
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });
    expect(unansweredWhenExpectedUnanswered.accuracyCorrect).toBe(true);

    // expectUnanswered = false: 1 if verdict CORRECT and outcome ANSWERED, else 0
    const unansweredWhenExpectedAnswer = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.UNANSWERED,
      accuracyVerdict: 'CORRECT',
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });
    expect(unansweredWhenExpectedAnswer.accuracyCorrect).toBe(false);

    const answeredIncorrect = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'INCORRECT',
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });
    expect(answeredIncorrect.accuracyCorrect).toBe(false);

    const answeredCorrect = computeQuestionScores({
      expectUnanswered: false,
      outcome: AnswerOutcome.ANSWERED,
      accuracyVerdict: 'CORRECT',
      expectedDocumentIds: [],
      retrievedDocumentIds: [],
    });
    expect(answeredCorrect.accuracyCorrect).toBe(true);
  });

  it('computeDelta computes delta and handles nulls', () => {
    expect(computeDelta(0.8, 0.5)).toBe(0.3);
    expect(computeDelta(0.5, 0.8)).toBe(-0.3);
    expect(computeDelta(null, 0.5)).toBeNull();
    expect(computeDelta(0.5, null)).toBeNull();
    expect(computeDelta(null, null)).toBeNull();
  });
});
