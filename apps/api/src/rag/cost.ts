import { getModelCatalog, getEmbeddingUsdPerMTok } from '../config/ai-models.js';

export interface CalculateCostParams {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  isFakeProvider?: boolean;
}

export class CostCalculator {
  static calculateCost(params: CalculateCostParams): number {
    const isFake = params.isFakeProvider ?? process.env.LLM_PROVIDER === 'fake';
    const catalog = getModelCatalog(isFake);
    const model = catalog.find((m) => m.id === params.modelId) || catalog[0];

    const inputUsdPerMTok = model ? model.inputUsdPerMTok : 1.0;
    const outputUsdPerMTok = model ? model.outputUsdPerMTok : 2.0;
    const embeddingUsdPerMTok = getEmbeddingUsdPerMTok(isFake);

    return Math.round(
      params.promptTokens * inputUsdPerMTok +
        params.completionTokens * outputUsdPerMTok +
        params.embeddingTokens * embeddingUsdPerMTok,
    );
  }
}
