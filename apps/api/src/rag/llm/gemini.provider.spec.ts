import { describe, it, expect, vi, beforeEach } from 'vitest';

const embedContent = vi.fn();
const generateContent = vi.fn();
const generateContentStream = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { embedContent, generateContent, generateContentStream } };
  }),
}));

const { GeminiProvider, EMBEDDING_DIMENSIONS, l2Normalize, toGeminiContents } = await import(
  './gemini.provider.js'
);
const { getModelProviderName, getDefaultModelId, GEMINI_FLASH_MODEL_ID } = await import(
  '../../config/ai-models.js'
);

describe('gemini helpers', () => {
  it('l2Normalize returns a unit vector and leaves zero vectors alone', () => {
    const v = l2Normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect(l2Normalize([0, 0])).toEqual([0, 0]);
  });

  it('toGeminiContents maps system to systemInstruction and assistant to model', () => {
    const out = toGeminiContents([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
    expect(out.systemInstruction).toBe('sys');
    expect(out.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(out.contents[2]?.parts?.[0]?.text).toBe('q2');
  });

  it('routes the gemini catalog id to gemini and keeps Claude on anthropic', () => {
    expect(getModelProviderName(GEMINI_FLASH_MODEL_ID)).toBe('gemini');
    expect(getModelProviderName('claude-sonnet-5-5')).toBe('anthropic');
    expect(getModelProviderName('fake-model')).toBe('fake');
  });

  it('getDefaultModelId honours DEFAULT_CHAT_MODEL', () => {
    const prev = process.env.DEFAULT_CHAT_MODEL;
    delete process.env.DEFAULT_CHAT_MODEL;
    expect(getDefaultModelId()).toBe('claude-sonnet-5-5');
    process.env.DEFAULT_CHAT_MODEL = 'gemini-flash';
    expect(getDefaultModelId()).toBe('gemini-flash');
    if (prev === undefined) delete process.env.DEFAULT_CHAT_MODEL;
    else process.env.DEFAULT_CHAT_MODEL = prev;
  });
});

describe('GeminiProvider', () => {
  beforeEach(() => {
    embedContent.mockReset();
    generateContent.mockReset();
    generateContentStream.mockReset();
    delete process.env.GEMINI_CHAT_MODEL;
    delete process.env.GEMINI_EMBEDDING_MODEL;
    delete process.env.GEMINI_THINKING_BUDGET;
  });

  it('embeds with gemini-embedding-001 at the pgvector dimension and normalises', async () => {
    const raw = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 2);
    embedContent.mockResolvedValue({ embeddings: [{ values: raw }, { values: raw }] });
    const provider = new GeminiProvider();
    const vectors = await provider.embed(['a', 'b'], 'query');
    expect(embedContent).toHaveBeenCalledWith({
      model: 'gemini-embedding-001',
      contents: ['a', 'b'],
      config: { outputDimensionality: 1536, taskType: 'RETRIEVAL_QUERY' },
    });
    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(1536);
    const norm = Math.sqrt(vectors[0]!.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1);
  });

  it('rejects embeddings with the wrong dimension', async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: [1, 2, 3] }] });
    await expect(new GeminiProvider().embed(['a'])).rejects.toThrow(/expected 1536/);
  });

  it('streams text chunks from the configured chat model', async () => {
    process.env.GEMINI_CHAT_MODEL = 'gemini-3.5-flash-lite';
    generateContentStream.mockResolvedValue(
      (async function* () {
        yield { text: 'Hello' };
        yield { text: undefined };
        yield { text: ' world' };
      })(),
    );
    const tokens: string[] = [];
    for await (const t of new GeminiProvider().streamChat({
      modelId: 'gemini-flash',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
    })) {
      tokens.push(t);
    }
    expect(tokens.join('')).toBe('Hello world');
    const call = generateContentStream.mock.calls[0]![0];
    expect(call.model).toBe('gemini-3.5-flash-lite');
    expect(call.config.systemInstruction).toBe('be brief');
    expect(call.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('chat returns text and token usage', async () => {
    generateContent.mockResolvedValue({
      text: 'CORRECT',
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 },
    });
    const res = await new GeminiProvider().chat({
      modelId: 'gemini-flash',
      messages: [{ role: 'user', content: 'judge' }],
    });
    expect(res).toEqual({ content: 'CORRECT', promptTokens: 12, completionTokens: 3 });
    expect(generateContent.mock.calls[0]![0].model).toBe('gemini-3.5-flash');
  });
});
