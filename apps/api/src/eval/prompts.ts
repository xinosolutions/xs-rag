export const ACCURACY_JUDGE_SYSTEM_PROMPT = `You are an evaluation judge. Compare the actual answer with the expected answer for the given question.
Return JSON ONLY in the following format:
{"verdict":"CORRECT"|"INCORRECT"}
Output CORRECT only if the actual answer conveys the same facts as the expected answer and contradicts nothing in it. Otherwise output INCORRECT.
Do not output markdown code fences or any text other than the raw JSON object.`;

export function buildAccuracyJudgeUserPrompt(
  question: string,
  expectedAnswer: string,
  actualAnswer: string,
): string {
  return `QUESTION: ${question}
EXPECTED ANSWER: ${expectedAnswer}
ACTUAL ANSWER: ${actualAnswer}`;
}

export const FAITHFULNESS_JUDGE_SYSTEM_PROMPT = `You are an evaluation judge. Assess the faithfulness of the actual answer based ONLY on the provided retrieved passages.
Break the actual answer down into factual claims.
A claim counts as supported only if a passage states it.
Return JSON ONLY in the following format:
{"totalClaims": <integer>, "supportedClaims": <integer>}
Do not output markdown code fences or any text other than the raw JSON object.`;

export function buildFaithfulnessJudgeUserPrompt(
  passagesText: string,
  actualAnswer: string,
): string {
  return `RETRIEVED PASSAGES:
${passagesText}

ACTUAL ANSWER:
${actualAnswer}`;
}
