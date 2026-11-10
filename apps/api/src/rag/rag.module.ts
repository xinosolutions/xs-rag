import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service.js';
import { DocumentAccessService } from '../documents/document-access.service.js';
import { RetrievalService } from './retrieval.service.js';
import { RagService } from './rag.service.js';
import { FakeLlmProvider } from './llm/fake.provider.js';
import { AnthropicProvider } from './llm/anthropic.provider.js';
import { GeminiProvider } from './llm/gemini.provider.js';

@Module({
  providers: [
    PrismaService,
    DocumentAccessService,
    RetrievalService,
    RagService,
    FakeLlmProvider,
    AnthropicProvider,
    GeminiProvider,
  ],
  exports: [
    RagService,
    RetrievalService,
    FakeLlmProvider,
    AnthropicProvider,
    GeminiProvider,
  ],
})
export class RagModule {}
