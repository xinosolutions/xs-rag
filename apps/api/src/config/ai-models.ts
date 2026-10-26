// Pricing as of October 2026:
// Anthropic: claude-3-5-sonnet: $3.00/MTok in, $15.00/MTok out; claude-3-5-haiku: $1.00/MTok in, $5.00/MTok out
// OpenAI: gpt-4o-mini: $0.15/MTok in, $0.60/MTok out; text-embedding-3-small: $0.02/MTok

export interface AiModelSpec {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai' | 'fake';
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export const BASE_AI_MODELS: AiModelSpec[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    inputUsdPerMTok: 3.0,
    outputUsdPerMTok: 15.0,
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    inputUsdPerMTok: 1.0,
    outputUsdPerMTok: 5.0,
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'openai',
    inputUsdPerMTok: 0.15,
    outputUsdPerMTok: 0.6,
  },
];

export const FAKE_MODEL: AiModelSpec = {
  id: 'fake-model',
  label: 'Fake Model (Test)',
  provider: 'fake',
  inputUsdPerMTok: 1.0,
  outputUsdPerMTok: 2.0,
};

export function getModelCatalog(isFakeProvider = false): AiModelSpec[] {
  if (isFakeProvider || process.env.LLM_PROVIDER === 'fake') {
    return [...BASE_AI_MODELS, FAKE_MODEL];
  }
  return BASE_AI_MODELS;
}

export function getEmbeddingUsdPerMTok(isFakeProvider = false): number {
  if (isFakeProvider || process.env.LLM_PROVIDER === 'fake') {
    return 0.5;
  }
  return 0.02; // text-embedding-3-small
}
