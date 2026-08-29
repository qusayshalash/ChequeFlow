import { z } from 'zod';

/**
 * Environment contract for the API.
 *
 * The process refuses to start when anything here is missing or malformed —
 * a misconfigured secret must fail loudly at boot, never silently at runtime.
 */
const csv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    API_GLOBAL_PREFIX: z.string().default('api'),
    CORS_ORIGINS: z.string().default('http://localhost:3000').transform(csv),
    TRUST_PROXY: booleanish,

    DATABASE_URL: z.string().min(1),

    REDIS_URL: z.string().default('redis://localhost:6379'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: z.coerce.number().int().min(60).max(3600).default(900),
    JWT_REFRESH_TTL: z.coerce.number().int().min(3600).default(2_592_000),
    JWT_ISSUER: z.string().default('cheque-flow'),
    JWT_AUDIENCE: z.string().default('cheque-flow-clients'),

    FIELD_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'FIELD_ENCRYPTION_KEY must be 32 bytes, base64 encoded',
    }),

    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_UPLOAD_PER_MINUTE: z.coerce.number().int().min(1).default(30),
    RATE_LIMIT_OCR_PER_MINUTE: z.coerce.number().int().min(1).default(20),
    RATE_LIMIT_DEFAULT_PER_MINUTE: z.coerce.number().int().min(1).default(120),

    S3_ENDPOINT: z.string().min(1),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanish,
    S3_SIGNED_URL_TTL: z.coerce.number().int().min(30).max(3600).default(300),
    MAX_UPLOAD_SIZE_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(50 * 1024 * 1024)
      .default(10 * 1024 * 1024),

    OCR_PROVIDER: z.enum(['mock', 'claude', 'google']).default('google'),
    OCR_MOCK_LATENCY_MS: z.coerce.number().int().min(0).max(10_000).default(350),
    OCR_MOCK_SEED: z.string().default('cheque-flow'),
    ANTHROPIC_API_KEY: z.string().optional(),
    OCR_CLAUDE_MODEL: z.string().default('claude-opus-5'),
    OCR_CLAUDE_MAX_TOKENS: z.coerce.number().int().min(1024).max(64_000).default(8_000),
    /** Service account key file; omit to use application default credentials. */
    GOOGLE_VISION_KEY_FILE: z.string().optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

    REMINDER_OFFSET_DAYS: z
      .string()
      .default('7,3,1,0')
      .transform((value) => csv(value).map(Number))
      .refine((days) => days.every((d) => Number.isInteger(d) && d >= 0), {
        message: 'REMINDER_OFFSET_DAYS must be a comma separated list of whole days',
      }),
    REMINDER_OVERDUE_DAYS: z.coerce.number().int().min(0).default(1),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      // Outside production a missing OCR credential is not fatal: the OCR
      // module falls back to the mock provider and says so loudly, which keeps
      // a fresh clone, the test suites and CI runnable with no cloud account.
      return;
    }

    // Production must never silently run on synthetic OCR data.
    if (env.OCR_PROVIDER === 'claude' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when OCR_PROVIDER=claude',
      });
    }
    if (
      env.OCR_PROVIDER === 'google' &&
      !env.GOOGLE_VISION_KEY_FILE &&
      !env.GOOGLE_APPLICATION_CREDENTIALS
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_VISION_KEY_FILE'],
        message:
          'GOOGLE_VISION_KEY_FILE (or GOOGLE_APPLICATION_CREDENTIALS) is required when OCR_PROVIDER=google',
      });
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'Access and refresh secrets must differ in production',
      });
    }
    if (/replace_me|change_me/i.test(env.JWT_ACCESS_SECRET + env.FIELD_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Placeholder secrets from .env.example cannot be used in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Validates `process.env`; throws a readable aggregate error when invalid. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
