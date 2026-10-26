import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  IP_HASH_SALT: z.string().min(1, 'IP_HASH_SALT is required'),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  STORAGE_DIR: z.string().default('./storage'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('no-reply@xs-rag.local'),
  LLM_PROVIDER: z.enum(['real', 'fake']).default('real'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  EVAL_JUDGE_MODEL: z.string().default('claude-sonnet-5-5'),
  RAG_MIN_SIMILARITY: z.coerce.number().default(0.25),
  INGESTION_WORKERS: z.coerce.number().default(1),
  THROTTLE_AUTH_PER_MIN: z.coerce.number().default(10),
  THROTTLE_ASK_PER_MIN: z.coerce.number().default(20),
  V1_RATE_PER_MIN: z.coerce.number().default(60),
  DEMO_WORKSPACE_SLUG: z.string().default('acme-demo'),
  SEED_DEMO_ADMIN_PASSWORD: z.string().optional().default('DemoAdminSecretPass123!'),
}).refine(
  (data) => {
    if (data.NODE_ENV === 'production' && data.LLM_PROVIDER === 'fake') {
      return false;
    }
    return true;
  },
  {
    message: 'LLM_PROVIDER=fake is not permitted in production',
    path: ['LLM_PROVIDER'],
  },
);

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function getEnv(): Env {
  if (!validatedEnv) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Environment validation failed:\n${issues}`);
    }
    validatedEnv = result.data;
  }
  return validatedEnv;
}
