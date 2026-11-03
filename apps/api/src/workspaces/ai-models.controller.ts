import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrincipalGuard } from '../common/principal.guard.js';
import { getModelCatalog } from '../config/ai-models.js';

@Controller('ai-models')
@UseGuards(PrincipalGuard)
export class AiModelsController {
  @Get()
  getAiModels() {
    const catalog = getModelCatalog();
    return {
      data: catalog.map(({ id, label, provider }) => ({
        id,
        label,
        provider,
      })),
    };
  }
}
