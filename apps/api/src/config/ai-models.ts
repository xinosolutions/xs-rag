// Pricing as of October 2026:
// Anthropic: claude-3-5-sonnet: $3.00/MTok in, $15.00/MTok out; claude-3-5-haiku: $1.00/MTok in, $5.00/MTok out
// Google Gemini: Flash tier (GEMINI_CHAT_MODEL, default gemini-3.5-flash) ~$0.30/MTok in, ~$2.50/MTok out;
// gemini-embedding-001: $0.15/MTok. Verify against current Google pricing when changing the model.

export const GEMINI_FLASH_MODEL_ID = 'gemini-flash';
export const FALLBACK_DEFAULT_MODEL_ID = 'claude-sonnet-5-5';

export interface AiModelSpec {
  id: string;
  label: string;
  provider: 'anthropic' | 'gemini' | 'fake';
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
    // Stable catalog id; the concrete Gemini model comes from GEMINI_CHAT_MODEL
    // (default gemini-3.5-flash), so upgrading the model needs no data migration.
    id: GEMINI_FLASH_MODEL_ID,
    label: 'Gemini Flash',
    provider: 'gemini',
    inputUsdPerMTok: 0.3,
    outputUsdPerMTok: 2.5,
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
  return 0.15; // gemini-embedding-001
}

/** Model new workspaces start with (DEFAULT_CHAT_MODEL, must be a catalog id). */
export function getDefaultModelId(): string {
  return process.env.DEFAULT_CHAT_MODEL || FALLBACK_DEFAULT_MODEL_ID;
}

/** Which provider serves a catalog model id; unknown ids fall back to Anthropic as before. */
export function getModelProviderName(modelId: string): AiModelSpec['provider'] {
  const spec = [...BASE_AI_MODELS, FAKE_MODEL].find((m) => m.id === modelId);
  return spec?.provider ?? 'anthropic';
}
