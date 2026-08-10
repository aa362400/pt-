import { z } from 'zod';

const DEV_ACCESS_SECRET = 'dev-access-secret-key-min-32-chars-long!!';
const DEV_REFRESH_SECRET = 'dev-refresh-secret-key-min-32-chars-long!';
const DEV_2FA_TEMP_SECRET = 'dev-2fa-temp-secret-key-min-32-chars!!!!';

const booleanEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

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
    QUEUE_READINESS_BACKLOG_LIMIT: z.coerce.number().int().min(1).default(500),

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
    AGENT_ALLOW_MOCK: booleanEnv.default(true),
    AGENT_WEBHOOK_SECRET: z.string().min(16).optional(),
    JUDGE_CALIBRATION_EVIDENCE_PATH: z.string().optional(),
    JUDGE_GOLD_DATASET_PATH: z.string().optional(),
    JUDGE_GOLD_APPROVAL_PATH: z.string().optional(),
    JUDGE_GOLD_SIGNING_PRIVATE_KEY_PATH: z.string().optional(),
    JUDGE_GOLD_APPROVAL_PUBLIC_KEY_PATH: z.string().optional(),
    JUDGE_GOLD_LOCAL_SIGNING_ENABLED: booleanEnv.default(false),
    AGENT_REVIEW_THRESHOLD: z.coerce.number().min(0).max(100).default(60),
    COMMERCE_AGENT_MCP_SERVER: z.string().optional(),
    COMMERCE_AGENT_PYTHON: z.string().default('python'),
    COMMERCE_AGENT_MCP_TIMEOUT_MS: z.coerce
      .number()
      .min(1000)
      .max(120_000)
      .default(30_000),

    // Marketplace APIs
    OZON_API_BASE_URL: z.string().url().default('https://api-seller.ozon.ru'),
    OZON_ORDER_SYNC_INTERVAL_MS: z.coerce.number().min(0).default(300_000),
    PRODUCT_LAUNCH_RECOVERY_INTERVAL_MS: z.coerce
      .number()
      .positive()
      .default(60_000),
    PRODUCT_LAUNCH_RECOVERY_STALE_AFTER_MS: z.coerce
      .number()
      .positive()
      .default(300_000),
    AUTOMATION_SCHEDULER_INTERVAL_MS: z.coerce.number().min(0).default(30_000),
    DAILY_PRODUCT_RESEARCH_MODE: z
      .enum(['DISABLED', 'DRY_RUN', 'SHADOW', 'PILOT', 'GENERAL'])
      .default('DRY_RUN'),
    DAILY_PRODUCT_RESEARCH_TIMEZONE: z.string().default('Asia/Shanghai'),
    DAILY_PRODUCT_RESEARCH_CANDIDATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(300)
      .default(300),
    DAILY_PRODUCT_RESEARCH_TOP_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(10),
    DAILY_PRODUCT_RESEARCH_PILOT_ORGANIZATION_IDS: z.string().default(''),
    DAILY_PRODUCT_RESEARCH_REAL_CONNECTORS_ENABLED: booleanEnv.default(false),
    DAILY_PRODUCT_RESEARCH_INTERNAL_ACTIONS_ENABLED: booleanEnv.default(false),
    DAILY_PRODUCT_RESEARCH_GENERAL_ACCESS_ENABLED: booleanEnv.default(false),
    SUPPLIER_IMAGE_SEARCH_ENRICHMENT_ENABLED: booleanEnv.default(false),
    SUPPLIER_IMAGE_SEARCH_ENRICHMENT_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(10),

    // Storage
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_PATH: z.string().default('./uploads'),
    LOCAL_STORAGE_BASE_URL: z.string().default('/uploads'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),

    // Immutable external audit archive (S3 Object Lock)
    AUDIT_ARCHIVE_ENABLED: booleanEnv.default(false),
    AUDIT_ARCHIVE_S3_BUCKET: z.string().min(1).optional(),
    AUDIT_ARCHIVE_S3_REGION: z.string().default('us-east-1'),
    AUDIT_ARCHIVE_S3_ENDPOINT: z.string().url().optional(),
    AUDIT_ARCHIVE_S3_ACCESS_KEY_ID: z.string().optional(),
    AUDIT_ARCHIVE_S3_SECRET_ACCESS_KEY: z.string().optional(),
    AUDIT_ARCHIVE_OBJECT_LOCK_MODE: z
      .enum(['GOVERNANCE', 'COMPLIANCE'])
      .default('COMPLIANCE'),
    AUDIT_ARCHIVE_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(365)
      .default(2555),
    AUDIT_ARCHIVE_KMS_KEY_ID: z.string().optional(),

    // Encryption
    CREDENTIAL_ENCRYPTION_PROVIDER: z
      .enum(['local', 'aws-kms'])
      .default('local'),
    KMS_KEY_ID: z.string().min(1).optional(),
    KMS_REGION: z.string().default('us-east-1'),
    KMS_ENDPOINT: z.string().url().optional(),
    KMS_ACCESS_KEY_ID: z.string().optional(),
    KMS_SECRET_ACCESS_KEY: z.string().optional(),
    ENCRYPTION_KEY: z.string().min(16).optional(),
    ENCRYPTION_KEYS: z.string().optional(),
    ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1).max(64).optional(),

    // Email
    EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().positive().default(587),
    SMTP_SECURE: z.string().default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),

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

    if (
      config.EMAIL_PROVIDER === 'smtp' &&
      (!config.SMTP_HOST || !config.SMTP_FROM)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'EMAIL_PROVIDER=smtp requires SMTP_HOST and SMTP_FROM',
      });
    }

    if (config.CORS_ORIGINS === '*') {
      ctx.addIssue({
        code: 'custom',
        message:
          'CORS_ORIGINS must be an explicit comma-separated whitelist in production ("*" is not allowed)',
      });
    }

    if (config.AGENT_ALLOW_MOCK) {
      ctx.addIssue({
        code: 'custom',
        path: ['AGENT_ALLOW_MOCK'],
        message: 'AGENT_ALLOW_MOCK must be false in production',
      });
    }

    if (!config.AGENT_BASE_URL || !config.AGENT_API_KEY?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['AGENT_API_KEY'],
        message: 'AGENT_BASE_URL and AGENT_API_KEY are required in production',
      });
    }

    if (
      config.CREDENTIAL_ENCRYPTION_PROVIDER !== 'aws-kms' ||
      !config.KMS_KEY_ID
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['CREDENTIAL_ENCRYPTION_PROVIDER'],
        message:
          'Production requires CREDENTIAL_ENCRYPTION_PROVIDER=aws-kms with KMS_KEY_ID',
      });
    }

    if (config.ENCRYPTION_KEYS) {
      if (!config.ENCRYPTION_ACTIVE_KEY_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['ENCRYPTION_ACTIVE_KEY_ID'],
          message: 'ENCRYPTION_ACTIVE_KEY_ID is required with ENCRYPTION_KEYS',
        });
      } else {
        try {
          const keys = JSON.parse(config.ENCRYPTION_KEYS) as unknown;
          if (
            !keys ||
            typeof keys !== 'object' ||
            Array.isArray(keys) ||
            !(config.ENCRYPTION_ACTIVE_KEY_ID in keys)
          ) {
            throw new Error('active key missing');
          }
        } catch {
          ctx.addIssue({
            code: 'custom',
            path: ['ENCRYPTION_KEYS'],
            message:
              'ENCRYPTION_KEYS must be a JSON object containing ENCRYPTION_ACTIVE_KEY_ID',
          });
        }
      }
    }

    if (
      !config.AUDIT_ARCHIVE_ENABLED ||
      !config.AUDIT_ARCHIVE_S3_BUCKET ||
      !config.AUDIT_ARCHIVE_KMS_KEY_ID ||
      config.AUDIT_ARCHIVE_OBJECT_LOCK_MODE !== 'COMPLIANCE'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUDIT_ARCHIVE_ENABLED'],
        message:
          'Production requires COMPLIANCE-mode S3 Object Lock audit archives encrypted with AUDIT_ARCHIVE_KMS_KEY_ID',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }
  return result.data;
}
