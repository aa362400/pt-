import { z } from 'zod';

const DEV_ACCESS_SECRET = 'dev-access-secret-key-min-32-chars-long!!';
const DEV_REFRESH_SECRET = 'dev-refresh-secret-key-min-32-chars-long!';
const DEV_2FA_TEMP_SECRET = 'dev-2fa-temp-secret-key-min-32-chars!!!!';

export const envSchema = z
  .object({
    // App
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().positive().default(3000),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis - optional in dev/test
    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    // JWT - dev fallbacks are rejected in production (see superRefine below)
    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_ACCESS_SECRET),
    JWT_REFRESH_SECRET: z.string().min(32).default(DEV_REFRESH_SECRET),
    JWT_2FA_TEMP_SECRET: z.string().min(32).default(DEV_2FA_TEMP_SECRET),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL: z.string().default('7d'),

    // CORS
    CORS_ORIGINS: z.string().default('*'),

    // AI Agent
    AGENT_BASE_URL: z.string().url().optional(),
    AGENT_PUBLIC_URL: z.string().url().optional(),
    AGENT_API_KEY: z.string().optional(),

    // Storage
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_PATH: z.string().default('./uploads'),
    LOCAL_STORAGE_BASE_URL: z.string().default('/uploads'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),

    // Encryption
    ENCRYPTION_KEY: z.string().min(16).optional(),

    // Stripe / Billing
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_FREE: z.string().optional(),
    STRIPE_PRICE_STARTER: z.string().optional(),
    STRIPE_PRICE_PROFESSIONAL: z.string().optional(),
    STRIPE_PRICE_ENTERPRISE: z.string().optional(),
    FRONTEND_URL: z.string().default('http://localhost:5173'),

    // Logging
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error', 'fatal'])
      .default('info'),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== 'production') return;

    if (
      config.JWT_ACCESS_SECRET === DEV_ACCESS_SECRET ||
      config.JWT_REFRESH_SECRET === DEV_REFRESH_SECRET ||
      config.JWT_2FA_TEMP_SECRET === DEV_2FA_TEMP_SECRET
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and JWT_2FA_TEMP_SECRET must be explicitly set in production (dev fallbacks are not allowed)',
      });
    }

    if (config.CORS_ORIGINS === '*') {
      ctx.addIssue({
        code: 'custom',
        message:
          'CORS_ORIGINS must be an explicit comma-separated whitelist in production ("*" is not allowed)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
