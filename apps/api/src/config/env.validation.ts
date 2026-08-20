/**
 * Environment validation. The API refuses to boot on a bad config rather than
 * failing at 3am on the first request that needs a missing secret.
 *
 * The DATABASE_APP_URL check is the important one — booting with the owner
 * connection string would silently disable Row Level Security.
 */

import { z } from 'zod';

function emptyToUndef(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    TZ: z.string().default('Asia/Kolkata'),

    APP_BASE_URL: z.string().url(),
    API_BASE_URL: z.string().url(),
    FILES_BASE_URL: z.string().url(),

    // Zod strips unknown keys and Nest only puts the *validated* object back on
    // process.env, so anything missing here is invisible to ConfigService — for
    // these two that silently drops the web apps from the CORS allowlist.
    ADMIN_WEB_URL: z.string().url().optional(),
    FAMILY_WEB_URL: z.string().url().optional(),
    CONTROL_WEB_URL: z.string().url().optional(),

    // Read by `db/seeds`, not by the API — declared here so a value in .env is
    // not silently stripped, and so the pair is documented in one place.
    // Local and staging bootstrap only; production provisioning of an account
    // with cross-tenant reach is a separate, more careful conversation.
    PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
    PLATFORM_ADMIN_PASSWORD: z.string().min(12).optional(),
    PLATFORM_ADMIN_NAME: z.string().optional(),

    DATABASE_URL: z.string().min(1),
    DATABASE_APP_URL: z.string().min(1),
    DB_POOL_MAX: z.coerce.number().default(12),

    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),

    OTP_TTL_SECONDS: z.coerce.number().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().default(5),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('/data/storage'),
    STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().default(900),
    STORAGE_MAX_UPLOAD_MB: z.coerce.number().default(100),

    SMS_PROVIDER: z.string().optional(),
    MSG91_AUTH_KEY: z.string().optional(),
    DLT_ENTITY_ID: z.string().optional(),

    /**
     * Gmail SMTP for the email channel. Optional — unset means email falls
     * back to the logging stub (same pattern as PLATFORM_ADMIN_* bootstrap).
     * Must be an App Password, not the Google account password.
     */
    GMAIL_USER: z.string().email().optional(),
    GMAIL_APP_PASSWORD: z.string().min(8).optional(),

    /**
     * FCM HTTP v1. Optional — unset (or blank) means push falls back to the
     * logging stub. All three must be present to initialise the provider.
     */
    FCM_PROJECT_ID: z.preprocess(emptyToUndef, z.string().min(1).optional()),
    FCM_CLIENT_EMAIL: z.preprocess(emptyToUndef, z.string().email().optional()),
    FCM_PRIVATE_KEY: z.preprocess(emptyToUndef, z.string().min(1).optional()),

    /**
     * 'log' writes messages to the log and the delivery ledger without touching
     * a carrier. Fine for development and a watched pilot; see the production
     * guard below for why it cannot be the default forever.
     */
    NOTIFICATION_PROVIDER: z.enum(['log']).default('log'),

    SMS_ESCALATION_MINUTES: z.coerce.number().default(45),
    SMS_DAILY_CAP_PER_TENANT: z.coerce.number().default(2000),
    COMMS_QUIET_HOURS_START: z.string().default('21:00'),
    COMMS_QUIET_HOURS_END: z.string().default('07:00'),

    /**
     * Firm identity for B2B tax invoices (manual activations + Stay Connected).
     * Invoice generation fails loudly if FIRM_GSTIN is unset — a blank GSTIN
     * on a tax invoice is worse than no invoice.
     */
    FIRM_NAME: z.preprocess(
      emptyToUndef,
      z.string().min(1).optional(),
    ),
    FIRM_GSTIN: z.preprocess(
      emptyToUndef,
      z.string().length(15).optional(),
    ),
    FIRM_ADDRESS: z.preprocess(
      emptyToUndef,
      z.string().min(1).optional(),
    ),
    FIRM_STATE_CODE: z.preprocess(
      emptyToUndef,
      z.string().length(2).optional(),
    ),

    FEES_GATEWAY_WEBHOOK_SECRET: z.string().optional(),
    FILES_SIGNING_SECRET: z.string().optional(),

    SENTRY_DSN: z.string().optional(),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.DATABASE_URL === env.DATABASE_APP_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DATABASE_APP_URL'],
        message:
          'DATABASE_APP_URL must differ from DATABASE_URL. The API must connect as the ' +
          'restricted saw_app role — using the owner role bypasses Row Level Security ' +
          'and disables tenant isolation entirely.',
      });
    }
    if (env.NODE_ENV === 'production') {
      const gmailReady = Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
      if (!gmailReady && env.NOTIFICATION_PROVIDER === 'log') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GMAIL_USER'],
          message:
            'Production needs a funded delivery channel. Configure GMAIL_USER and ' +
            'GMAIL_APP_PASSWORD (invite emails), or implement a real SMS gateway. ' +
            'Booting with only the logging stub would accept logins and invitations and ' +
            'quietly drop them.',
        });
      }
    }
    if (env.NODE_ENV === 'production' && !env.ADMIN_WEB_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_WEB_URL'],
        message:
          'Public signup hands the new admin over to the admin app at this URL. ' +
          'Without it a school can complete signup and then have nowhere to go.',
      });
    }

    // Parent/student invites are built from this. Unset used to fall back to a
    // subdomain that has never existed, so invites silently pointed nowhere.
    if (env.NODE_ENV === 'production' && !env.FAMILY_WEB_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FAMILY_WEB_URL'],
        message:
          'Parent and student invite links are built from this URL. ' +
          'Set FAMILY_WEB_URL in production.',
      });
    }
    if (env.NODE_ENV === 'production' && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'Access and refresh secrets must differ in production.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n`);
  }
  return parsed.data;
}
